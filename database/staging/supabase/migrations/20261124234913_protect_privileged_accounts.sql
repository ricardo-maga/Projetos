-- Proteção de contas privilegiadas e do último Super Administrador.
--  1. Permissão users.credentials.manage (atribuída apenas a SUPER_ADMIN).
--  2. Funções auxiliares partilhadas (conta privilegiada; outro Super Administrador elegível).
--  3. Eliminação e edição de perfil atómicas, com o mesmo lock de admin_replace_user_roles,
--     controlo otimista por users.sync_version e a mesma proteção do alvo (roles.manage para contas privilegiadas).
--  4. admin_replace_user_roles passa a usar a mesma definição de Super Administrador elegível.

INSERT INTO public.permissions (code, module, action, description, is_system, is_active)
VALUES ('users.credentials.manage', 'users', 'credentials.manage',
  'Alterar email, palavra-passe e ativação de acesso de outros utilizadores', true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, granted_at)
SELECT r.id, p.id, now()
FROM public.roles r
JOIN public.permissions p ON p.code = 'users.credentials.manage'
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Elegível = consegue iniciar sessão (mesmos critérios de requireAuth) e tem a função SUPER_ADMIN ativa.
CREATE OR REPLACE FUNCTION public.has_other_eligible_super_admin(p_excluding UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active IS TRUE AND r.code = 'SUPER_ADMIN'
    WHERE u.id <> p_excluding
      AND u.approved IS TRUE
      AND u.deleted IS NOT TRUE
      AND COALESCE(u.type, '') <> 'External'
      AND u.auth_user_id IS NOT NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_privileged_user(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.is_admin IS TRUE)
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id AND r.is_active IS TRUE AND r.code IN ('ADMIN', 'SUPER_ADMIN')
        WHERE ur.user_id = p_user_id
      );
$function$;

-- The reservation spans the Auth call without holding a PostgreSQL transaction
-- open. It is cleared by the owning operation, never by a time-based takeover.
CREATE TABLE private.user_profile_changes (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  changes_credentials boolean NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.user_profile_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.user_profile_changes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_begin_user_profile_change(
  p_user_id uuid, p_operation_id uuid, p_actor_id uuid, p_expected_version bigint, p_changes_credentials boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_target public.users%ROWTYPE; v_actor_auth uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server-only operation' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rbac:last-super-admin', 0));
  SELECT auth_user_id INTO v_actor_auth FROM public.users WHERE id = p_actor_id;
  IF v_actor_auth IS NULL OR NOT public.has_permission('users.write', v_actor_auth) THEN
    RAISE EXCEPTION 'Sem permissão para editar utilizadores.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.deleted IS TRUE THEN
    RAISE EXCEPTION 'Perfil inexistente ou eliminado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.sync_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'O perfil foi alterado entretanto. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;
  IF p_user_id <> p_actor_id AND public.is_privileged_user(p_user_id)
     AND NOT public.has_permission('roles.manage', v_actor_auth) THEN
    RAISE EXCEPTION 'Apenas o Super Administrador pode alterar contas privilegiadas.' USING ERRCODE = '42501';
  END IF;
  IF p_changes_credentials AND (p_user_id = p_actor_id OR NOT public.has_permission('users.credentials.manage', v_actor_auth)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar as credenciais desta conta.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.user_profile_changes (user_id, operation_id, actor_id, changes_credentials)
  VALUES (p_user_id, p_operation_id, p_actor_id, p_changes_credentials) ON CONFLICT (user_id) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Existe uma alteração pendente para esta conta.' USING ERRCODE = '40001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(
  p_user_id uuid, p_actor_id uuid, p_expected_version bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_target public.users%ROWTYPE; v_actor_auth uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server-only operation' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rbac:last-super-admin', 0));
  SELECT auth_user_id INTO v_actor_auth FROM public.users WHERE id = p_actor_id;
  IF v_actor_auth IS NULL OR NOT public.has_permission('users.delete', v_actor_auth) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar utilizadores.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = p_actor_id THEN
    RAISE EXCEPTION 'Não é possível eliminar a própria conta.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.deleted IS TRUE THEN
    RAISE EXCEPTION 'Utilizador inexistente ou eliminado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.sync_version IS DISTINCT FROM p_expected_version
     OR EXISTS (SELECT 1 FROM private.user_profile_changes WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'O perfil foi alterado ou tem uma alteração pendente.' USING ERRCODE = '40001';
  END IF;
  IF public.is_privileged_user(p_user_id) AND NOT public.has_permission('roles.manage', v_actor_auth) THEN
    RAISE EXCEPTION 'Apenas o Super Administrador pode eliminar contas privilegiadas.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active IS TRUE
      AND r.code = 'SUPER_ADMIN' WHERE ur.user_id = p_user_id)
     AND NOT public.has_other_eligible_super_admin(p_user_id) THEN
    RAISE EXCEPTION 'Não é possível eliminar o último Super Administrador.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.users SET deleted = true WHERE id = p_user_id;
  -- Supabase refresh tokens cascade from sessions. Revoke only the exact linked Auth account.
  DELETE FROM auth.sessions WHERE user_id = v_target.auth_user_id;
END;
$function$;

-- All profile writes and compensations use the reservation and the most
-- recent version returned to the owning operation.
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_user_id uuid, p_operation_id uuid, p_name text, p_email text, p_type text,
  p_auth_user_id uuid, p_expected_version bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_target public.users%ROWTYPE; v_credentials boolean; v_version bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server-only operation' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rbac:last-super-admin', 0));
  SELECT changes_credentials INTO v_credentials FROM private.user_profile_changes
    WHERE user_id = p_user_id AND operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A reserva desta alteração já não está ativa.' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.deleted IS TRUE THEN
    RAISE EXCEPTION 'Perfil inexistente ou eliminado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.sync_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'O perfil foi alterado entretanto. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;
  IF NOT v_credentials AND (v_target.auth_user_id IS DISTINCT FROM p_auth_user_id
     OR lower(v_target.email) IS DISTINCT FROM lower(p_email)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar as credenciais desta conta.' USING ERRCODE = '42501';
  END IF;
  IF p_type = 'External' AND v_target.type <> 'External'
     AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active IS TRUE
       AND r.code = 'SUPER_ADMIN' WHERE ur.user_id = p_user_id)
     AND NOT public.has_other_eligible_super_admin(p_user_id) THEN
    RAISE EXCEPTION 'Não é possível retirar o acesso ao último Super Administrador.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.users SET name = p_name, email = p_email, type = p_type, auth_user_id = p_auth_user_id
    WHERE id = p_user_id RETURNING sync_version INTO v_version;
  RETURN v_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_end_user_profile_change(p_user_id uuid, p_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server-only operation' USING ERRCODE = '42501';
  END IF;
  DELETE FROM private.user_profile_changes WHERE user_id = p_user_id AND operation_id = p_operation_id;
END;
$function$;
-- Mesma função, apenas com a verificação do último Super Administrador substituída pela função partilhada.
CREATE OR REPLACE FUNCTION "public"."admin_replace_user_roles"("p_user_id" "uuid", "p_role_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_request_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_target public.users%ROWTYPE;v_requested_count INTEGER;v_valid_count INTEGER;v_keeps_super_admin BOOLEAN;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Server-only operation' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'')<>'External') THEN RAISE EXCEPTION 'Executor inválido ou inativo.' USING ERRCODE='42501'; END IF;
 IF NOT public.has_permission('roles.manage',COALESCE((SELECT auth_user_id FROM public.users WHERE id=p_actor_id),p_actor_id)) THEN RAISE EXCEPTION 'Apenas o Super Administrador pode atribuir funções.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rbac:last-super-admin',0));
 SELECT * INTO v_target FROM public.users WHERE id=p_user_id FOR UPDATE; IF NOT FOUND OR v_target.deleted IS TRUE THEN RAISE EXCEPTION 'Utilizador inexistente ou eliminado.' USING ERRCODE='P0002'; END IF;
 IF EXISTS (SELECT 1 FROM private.user_profile_changes WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'Existe uma alteração pendente para esta conta.' USING ERRCODE='23514'; END IF;
 IF COALESCE(v_target.type,'')='External' AND cardinality(COALESCE(p_role_ids,ARRAY[]::UUID[]))>0 THEN RAISE EXCEPTION 'Utilizadores externos não podem receber funções internas.' USING ERRCODE='42501'; END IF;
 SELECT count(DISTINCT x) INTO v_requested_count FROM unnest(COALESCE(p_role_ids,ARRAY[]::UUID[])) x;
 SELECT count(*) INTO v_valid_count FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[])) AND r.is_active IS TRUE;
 IF v_requested_count<>v_valid_count THEN RAISE EXCEPTION 'A lista contém funções inativas ou inexistentes.' USING ERRCODE='22023'; END IF;
 v_keeps_super_admin:=EXISTS(SELECT 1 FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[])) AND r.code='SUPER_ADMIN');
 IF NOT v_keeps_super_admin AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.code='SUPER_ADMIN') AND NOT public.has_other_eligible_super_admin(p_user_id) THEN RAISE EXCEPTION 'Não é possível remover o último Super Administrador.' USING ERRCODE='23514'; END IF;
 DELETE FROM public.user_roles WHERE user_id=p_user_id;
 INSERT INTO public.user_roles(user_id,role_id,assigned_by) SELECT p_user_id,r.id,p_actor_id FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[]));
 UPDATE public.users SET role_id=(COALESCE(p_role_ids,ARRAY[]::UUID[]))[1] WHERE id=p_user_id;
 INSERT INTO public.audit_logs(user_id,user_name,user_email,action,entity_type,entity_id,entity_name,details,ip,user_agent,request_id) SELECT p_actor_id,u.name,u.email,'SETTINGS','USER',p_user_id,'user.roles.updated',jsonb_build_object('roleIds',COALESCE(p_role_ids,ARRAY[]::UUID[]))::text,p_ip,p_user_agent,p_request_id FROM public.users u WHERE u.id=p_actor_id;
END;$$;

REVOKE ALL ON FUNCTION public.has_other_eligible_super_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_privileged_user(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_soft_delete_user(UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_user_profile(UUID, UUID, TEXT, TEXT, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_other_eligible_super_admin(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_privileged_user(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(UUID, UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(UUID, UUID, TEXT, TEXT, TEXT, UUID, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_begin_user_profile_change(uuid, uuid, uuid, bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_end_user_profile_change(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_begin_user_profile_change(uuid, uuid, uuid, bigint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_end_user_profile_change(uuid, uuid) TO service_role;
