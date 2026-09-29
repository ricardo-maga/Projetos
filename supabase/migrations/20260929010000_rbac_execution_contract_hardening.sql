-- Migration: 20260929010000_rbac_execution_contract_hardening.sql
-- FASE 66-B-HARDENING-8: RBAC Execution Contract Hardening
-- Revoke EXECUTE from PUBLIC and anon for public.has_permission(text, uuid)
-- Grant EXECUTE exclusively to authenticated and service_role
-- Revoke all write permissions on roles, permissions and role_permissions

SET search_path = public;

-- 1. Assegurar a definição canónica e idempotente de public.has_permission(text, uuid)
CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_code TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_auth_uid UUID;
  v_profile RECORD;
  v_perm_code_alt TEXT;
BEGIN
  -- 1. Em sessão autenticada, auth.uid() é estritamente primário.
  -- Qualquer p_user_id fornecido por cliente authenticated é expressamente ignorado.
  IF auth.role() = 'authenticated' THEN
    v_auth_uid := auth.uid();
  ELSE
    v_auth_uid := p_user_id;
  END IF;

  -- 2. service_role sem auth.uid() e sem p_user_id explícito -> FAIL CLOSED (sem bypass genérico)
  IF v_auth_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 3. Resolução de identidade em duas etapas determinísticas no public.users
  SELECT id, role_id, is_admin, approved, deleted
  INTO v_profile
  FROM public.users
  WHERE auth_user_id = v_auth_uid;

  IF NOT FOUND THEN
    SELECT id, role_id, is_admin, approved, deleted
    INTO v_profile
    FROM public.users
    WHERE id = v_auth_uid;
  END IF;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 4. Utilizadores inativos, não aprovados, eliminados ou sem role_id atribuída nunca têm permissões
  IF (v_profile.approved IS NOT TRUE) OR (v_profile.deleted IS TRUE) OR (v_profile.role_id IS NULL) THEN
    RETURN FALSE;
  END IF;

  -- 5. is_admin concede exclusivamente privilégios administrativos explícitos ('admin:access', 'config:manage')
  -- NUNCA concede permissões funcionais (tasks:write, projects:write, etc.) de forma implícita
  IF (v_profile.is_admin IS TRUE) AND (
    p_permission_code IN ('admin:access', 'config:manage', 'admin_access', 'config_manage')
  ) THEN
    RETURN TRUE;
  END IF;

  -- 6. Normalização de formato de código de permissão ('tasks_write' <-> 'tasks:write')
  v_perm_code_alt := CASE
    WHEN POSITION(':' IN p_permission_code) > 0 THEN REPLACE(p_permission_code, ':', '_')
    ELSE REPLACE(p_permission_code, '_', ':')
  END;

  -- 7. Consulta autoritativa à matriz canónica (role_permissions -> permissions)
  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_profile.role_id
      AND (p.code = p_permission_code OR p.code = v_perm_code_alt)
  );
END;
$function$;

-- 2. TAREFA 1: Fecho estrito da superfície de execução da função has_permission
-- Revogar EXECUTE de PUBLIC (comportamento padrão do PostgreSQL que expõe novas funções)
REVOKE EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) FROM PUBLIC;

-- Revogar EXECUTE de utilizadores anónimos
REVOKE EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) FROM anon;

-- Conceder EXECUTE exclusivamente a utilizadores autenticados e service_role
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) TO authenticated, service_role;

-- 3. Proteção das tabelas de metadados RBAC (roles, permissions, role_permissions)
-- Garantir que não existem permissões de escrita para utilizadores anónimos nem autenticados
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.roles FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.permissions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.role_permissions FROM PUBLIC, anon, authenticated;

-- Garantir acesso de leitura (SELECT) estritamente a authenticated e service_role
GRANT SELECT ON TABLE public.roles TO authenticated, service_role;
GRANT SELECT ON TABLE public.permissions TO authenticated, service_role;
GRANT SELECT ON TABLE public.role_permissions TO authenticated, service_role;

COMMENT ON FUNCTION public.has_permission(TEXT, UUID) IS
  'FASE 66-B-HARDENING-8: Função canónica de autorização RBAC. Execução reservada a authenticated (auth.uid() forçado) e service_role (p_user_id avaliado explicitamente). Fail-closed total.';
