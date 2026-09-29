-- Migration: 20260928040000_normalize_users_role_id_canonical_rbac.sql
-- FASE 66-B-HARDENING-7: Canonical RBAC Schema, 7 Roles (10000000 Series), Permission Matrix & RPC Hardening

SET search_path = public;

-- 1. Tabela public.roles (7 roles canónicas com a série 10000000-...)
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);

INSERT INTO public.roles (id, code, name, description) VALUES
('10000000-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'Super Administrador', 'Acesso total e irrestrito a todo o sistema e parametrizações'),
('10000000-0000-0000-0000-000000000002', 'ADMIN', 'Administrador', 'Gestão global de projetos, tarefas, utilizadores e configurações'),
('10000000-0000-0000-0000-000000000003', 'PROJECT_MANAGER', 'Gestor de Projetos', 'Criação e gestão de projetos, tarefas e equipas'),
('10000000-0000-0000-0000-000000000004', 'TECHNICIAN', 'Técnico', 'Visualização de projetos, tarefas e atualização de trabalhos'),
('10000000-0000-0000-0000-000000000005', 'COMMERCIAL', 'Comercial', 'Gestão de clientes, orçamentos e oportunidades comerciais'),
('10000000-0000-0000-0000-000000000006', 'SOLUTIONS', 'Soluções', 'Planeamento técnico, especificações e gestão operacional'),
('10000000-0000-0000-0000-000000000007', 'VIEWER', 'Visualizador', 'Acesso apenas de leitura aos dados autorizados')
ON CONFLICT (id) DO UPDATE SET 
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Tabela public.permissions (33 permissões canónicas)
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  module TEXT NOT NULL,
  description TEXT
);

INSERT INTO public.permissions (code, module, description) VALUES
('projects:read', 'projects', 'Visualizar projetos'),
('projects:write', 'projects', 'Criar e editar projetos'),
('projects:delete', 'projects', 'Eliminar projetos'),
('tasks:read', 'tasks', 'Visualizar tarefas'),
('tasks:write', 'tasks', 'Criar e editar tarefas'),
('tasks:delete', 'tasks', 'Eliminar tarefas'),
('clients:read', 'clients', 'Visualizar clientes'),
('clients:write', 'clients', 'Criar e editar clientes'),
('clients:delete', 'clients', 'Eliminar clientes'),
('calendar:read', 'calendar', 'Visualizar calendário e planeamento'),
('calendar:write', 'calendar', 'Criar e editar agendamentos e planeamento'),
('absences:read', 'absences', 'Visualizar ausências'),
('absences:write', 'absences', 'Criar e editar ausências'),
('absences:delete', 'absences', 'Eliminar ausências'),
('config:read', 'config', 'Visualizar configurações'),
('config:write', 'config', 'Editar configurações'),
('tickets:read', 'tickets', 'Visualizar tickets de suporte'),
('tickets:write', 'tickets', 'Criar e editar tickets'),
('tickets:delete', 'tickets', 'Eliminar tickets'),
('materials:read', 'materials', 'Visualizar materiais'),
('materials:write', 'materials', 'Criar e editar materiais'),
('materials:delete', 'materials', 'Eliminar materiais'),
('equipment:read', 'equipment', 'Visualizar equipamentos'),
('equipment:write', 'equipment', 'Criar e editar equipamentos'),
('equipment:delete', 'equipment', 'Eliminar equipamentos'),
('quotes:read', 'quotes', 'Visualizar orçamentos'),
('quotes:write', 'quotes', 'Criar e editar orçamentos'),
('quotes:delete', 'quotes', 'Eliminar orçamentos'),
('users:read', 'users', 'Visualizar utilizadores'),
('users:write', 'users', 'Criar e editar utilizadores'),
('users:delete', 'users', 'Eliminar utilizadores'),
('admin:access', 'admin', 'Aceder à área administrativa'),
('config:manage', 'config', 'Gerir configurações globais do ERP')
ON CONFLICT (code) DO NOTHING;

-- 3. Tabela public.role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- SUPER_ADMIN (10000000-...001): todas as 33 permissões
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '10000000-0000-0000-0000-000000000001'::UUID, id
FROM public.permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN (10000000-...002): todas exceto config:manage
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '10000000-0000-0000-0000-000000000002'::UUID, id
FROM public.permissions
WHERE code NOT IN ('config:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- PROJECT_MANAGER (10000000-...003)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '10000000-0000-0000-0000-000000000003'::UUID, id
FROM public.permissions
WHERE code IN (
  'projects:read', 'projects:write', 'projects:delete',
  'tasks:read', 'tasks:write', 'tasks:delete',
  'clients:read', 'clients:write',
  'calendar:read', 'calendar:write',
  'absences:read', 'absences:write', 'absences:delete',
  'config:read',
  'tickets:read', 'tickets:write', 'tickets:delete',
  'quotes:read', 'quotes:write',
  'materials:read', 'materials:write',
  'equipment:read', 'equipment:write',
  'users:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- TECHNICIAN (10000000-...004)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '10000000-0000-0000-0000-000000000004'::UUID, id
FROM public.permissions
WHERE code IN (
  'projects:read',
  'tasks:read', 'tasks:write',
  'clients:read',
  'calendar:read', 'calendar:write',
  'absences:read', 'absences:write',
  'tickets:read', 'tickets:write',
  'materials:read',
  'equipment:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- COMMERCIAL (10000000-...005) (DENY para tasks:write e calendar:write por princípio de menor privilégio)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '10000000-0000-0000-0000-000000000005'::UUID, id
FROM public.permissions
WHERE code IN (
  'projects:read',
  'tasks:read',
  'calendar:read',
  'clients:read', 'clients:write',
  'quotes:read', 'quotes:write',
  'absences:read', 'absences:write'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- SOLUTIONS (10000000-...006)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '10000000-0000-0000-0000-000000000006'::UUID, id
FROM public.permissions
WHERE code IN (
  'projects:read', 'projects:write',
  'tasks:read', 'tasks:write', 'tasks:delete',
  'calendar:read', 'calendar:write',
  'clients:read', 'clients:write',
  'quotes:read', 'quotes:write',
  'materials:read',
  'equipment:read',
  'users:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- VIEWER (10000000-...007)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '10000000-0000-0000-0000-000000000007'::UUID, id
FROM public.permissions
WHERE code IN (
  'projects:read',
  'tasks:read',
  'clients:read',
  'calendar:read',
  'absences:read',
  'tickets:read',
  'materials:read',
  'equipment:read',
  'quotes:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Migração e normalização determinística de users.role_id
DO $migration$
DECLARE
  v_already_migrated BOOLEAN := FALSE;
  v_unmapped_role_id TEXT;
BEGIN
  -- Verificar se users.role_id já aponta formalmente para public.roles(id)
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'users'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name = 'users_role_id_fkey'
      AND ccu.table_name = 'roles'
  ) INTO v_already_migrated;

  IF v_already_migrated THEN
    RAISE NOTICE 'A tabela public.users já possui FK para public.roles(id). Replay seguro.';
    RETURN;
  END IF;

  -- Criar coluna temporária de staging
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS canonical_role_id UUID;

  -- Mapeamento semântico explícito
  UPDATE public.users
  SET canonical_role_id = CASE
    -- Se já for um UUID canónico da série 10000000
    WHEN role_id IN (
      '10000000-0000-0000-0000-000000000001'::UUID,
      '10000000-0000-0000-0000-000000000002'::UUID,
      '10000000-0000-0000-0000-000000000003'::UUID,
      '10000000-0000-0000-0000-000000000004'::UUID,
      '10000000-0000-0000-0000-000000000005'::UUID,
      '10000000-0000-0000-0000-000000000006'::UUID,
      '10000000-0000-0000-0000-000000000007'::UUID
    ) THEN role_id
    -- ug-1 / Administrator (...0001) -> SUPER_ADMIN (...001)
    WHEN role_id = '00000000-0000-0000-0000-000000000001'::UUID THEN '10000000-0000-0000-0000-000000000001'::UUID
    -- ug-2 / Project Manager (...0002) -> PROJECT_MANAGER (...003)
    WHEN role_id = '00000000-0000-0000-0000-000000000002'::UUID THEN '10000000-0000-0000-0000-000000000003'::UUID
    -- ug-3 / Técnico (...0003 ou ...0004) -> TECHNICIAN (...004)
    WHEN role_id = '00000000-0000-0000-0000-000000000003'::UUID THEN '10000000-0000-0000-0000-000000000004'::UUID
    WHEN role_id = '00000000-0000-0000-0000-000000000004'::UUID THEN '10000000-0000-0000-0000-000000000004'::UUID
    -- ug-4 / Viewer (...0005) -> VIEWER (...007)
    WHEN role_id = '00000000-0000-0000-0000-000000000005'::UUID THEN '10000000-0000-0000-0000-000000000007'::UUID
    -- Comercial (52616954-8b59-4459-a00b-963f1b29a91c) -> COMMERCIAL (...005)
    WHEN role_id = '52616954-8b59-4459-a00b-963f1b29a91c'::UUID THEN '10000000-0000-0000-0000-000000000005'::UUID
    -- Soluções (a158a7b3-88ce-46d1-a779-cd6d73363d3c) -> SOLUTIONS (...006)
    WHEN role_id = 'a158a7b3-88ce-46d1-a779-cd6d73363d3c'::UUID THEN '10000000-0000-0000-0000-000000000006'::UUID
    -- Visualizador (9de391f6-46fa-45f6-b32d-25c11e1dd533) -> VIEWER (...007)
    WHEN role_id = '9de391f6-46fa-45f6-b32d-25c11e1dd533'::UUID THEN '10000000-0000-0000-0000-000000000007'::UUID
    ELSE NULL
  END
  WHERE role_id IS NOT NULL;

  -- PARTE E: Proteção contra estado desconhecido - Abortar se algum role_id não-nulo falhar o mapeamento
  IF EXISTS (
    SELECT 1 
    FROM public.users 
    WHERE role_id IS NOT NULL AND canonical_role_id IS NULL
  ) THEN
    SELECT role_id::text INTO v_unmapped_role_id
    FROM public.users
    WHERE role_id IS NOT NULL AND canonical_role_id IS NULL
    LIMIT 1;

    RAISE EXCEPTION 'MIGRATION BLOCKER: Utilizador com role_id desconhecido sem mapeamento canónico: %', v_unmapped_role_id USING ERRCODE = '23503';
  END IF;

  -- Aplicar a coluna convertida de volta a role_id
  UPDATE public.users
  SET role_id = canonical_role_id
  WHERE canonical_role_id IS NOT NULL;

  -- Remover coluna de staging
  ALTER TABLE public.users DROP COLUMN IF EXISTS canonical_role_id;

  -- PARTE F: Remover constraint legada se existir
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_role_id_fkey' 
      AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_role_id_fkey;
  END IF;

  -- Adicionar nova Foreign Key canónica para public.roles(id)
  ALTER TABLE public.users
    ADD CONSTRAINT users_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES public.roles(id)
    ON DELETE SET NULL;
END;
$migration$;

-- 5. Atualizar função canónica has_permission() (PARTE G, H, I)
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
  -- PARTE G: Em sessão autenticada, auth.uid() é estritamente primário. Ignorar p_user_id do cliente.
  IF auth.role() = 'authenticated' THEN
    v_auth_uid := auth.uid();
  ELSE
    v_auth_uid := p_user_id;
  END IF;

  -- PARTE H: service_role sem auth.uid() -> FAIL CLOSED por defeito (sem bypass genérico)
  IF v_auth_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- PARTE I: Resolução de identidade em duas etapas determinísticas
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

  -- Utilizadores inativos, não aprovados, eliminados ou sem role_id nunca têm permissões
  IF (v_profile.approved IS NOT TRUE) OR (v_profile.deleted IS TRUE) OR (v_profile.role_id IS NULL) THEN
    RETURN FALSE;
  END IF;

  -- PARTE G: is_admin privilégio administrativo adicional
  -- Concede acesso administrativo ('admin:access', 'config:manage'), mas preserva os limites funcionais da role
  IF (v_profile.is_admin IS TRUE) AND (
    p_permission_code IN ('admin:access', 'config:manage', 'admin_access', 'config_manage')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Normalizar o código de permissão ('tasks_write' <-> 'tasks:write')
  v_perm_code_alt := CASE
    WHEN POSITION(':' IN p_permission_code) > 0 THEN REPLACE(p_permission_code, ':', '_')
    ELSE REPLACE(p_permission_code, '_', ':')
  END;

  -- Consulta à tabela canónica de RBAC (role_permissions -> permissions)
  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_profile.role_id
      AND (p.code = p_permission_code OR p.code = v_perm_code_alt)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) TO authenticated, service_role;

-- PARTE L: Habilitar e configurar RLS em roles, permissions e role_permissions
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Políticas SELECT para utilizadores autenticados e service_role
DROP POLICY IF EXISTS "Allow read access to roles for authenticated users" ON public.roles;
CREATE POLICY "Allow read access to roles for authenticated users"
  ON public.roles FOR SELECT
  TO authenticated, service_role
  USING (true);

DROP POLICY IF EXISTS "Allow read access to permissions for authenticated users" ON public.permissions;
CREATE POLICY "Allow read access to permissions for authenticated users"
  ON public.permissions FOR SELECT
  TO authenticated, service_role
  USING (true);

DROP POLICY IF EXISTS "Allow read access to role_permissions for authenticated users" ON public.role_permissions;
CREATE POLICY "Allow read access to role_permissions for authenticated users"
  ON public.role_permissions FOR SELECT
  TO authenticated, service_role
  USING (true);
