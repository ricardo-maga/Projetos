-- Migration: 20260928040000_normalize_users_role_id_canonical_rbac.sql
-- FASE 66-B-HARDENING-4-FIX-3: Normalização RBAC Determinística, Sem Matching Fuzzy e Com Replay Safety
-- Corrige a colisão de UUIDs entre o modelo legado user_groups e o modelo canónico roles:
--   user_groups ...0001 (Administrator)   -> roles ...0001 (SUPER_ADMIN)
--   user_groups ...0002 (Project Manager) -> roles ...0003 (PROJECT_MANAGER)
--   user_groups ...0003 (Technician)      -> roles ...0004 (TECHNICIAN)
--   user_groups ...0004 (Viewer)          -> roles ...0005 (VIEWER)
--   user_groups ...0005 (Viewer)          -> roles ...0005 (VIEWER)

SET search_path = public;

-- 1. Garantir que os 5 roles canónicos existem na tabela public.roles com os UUIDs canónicos
INSERT INTO public.roles (id, code, name, description) VALUES
('00000000-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'Super Administrador', 'Acesso total e irrestrito a todo o sistema e parametrizações'),
('00000000-0000-0000-0000-000000000002', 'ADMIN', 'Administrador', 'Gestão global de projetos, tarefas, utilizadores e configurações'),
('00000000-0000-0000-0000-000000000003', 'PROJECT_MANAGER', 'Gestor de Projetos', 'Criação e gestão de projetos, tarefas e equipas'),
('00000000-0000-0000-0000-000000000004', 'TECHNICIAN', 'Técnico / Equipa', 'Visualização de projetos e atualização de tarefas atribuídas'),
('00000000-0000-0000-0000-000000000005', 'VIEWER', 'Visualizador', 'Acesso apenas de leitura aos dados autorizados')
ON CONFLICT (id) DO UPDATE SET 
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Garantir que as permissões padrão existem
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

-- 3. Popular role_permissions canónico para todas as roles
-- SUPER_ADMIN: todas as permissões
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001'::UUID, id
FROM public.permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN: todas as permissões exceto config:manage avançada
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002'::UUID, id
FROM public.permissions
WHERE code NOT IN ('config:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- PROJECT_MANAGER: gestão de projetos, tarefas, clientes, calendário, ausências, orçamentos, tickets, materiais, equipamentos
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003'::UUID, id
FROM public.permissions
WHERE code IN (
  'projects:read', 'projects:write',
  'tasks:read', 'tasks:write', 'tasks:delete',
  'clients:read', 'clients:write',
  'calendar:read', 'calendar:write',
  'absences:read', 'absences:write',
  'config:read',
  'tickets:read', 'tickets:write', 'tickets:delete',
  'quotes:read', 'quotes:write',
  'materials:read', 'materials:write',
  'equipment:read', 'equipment:write',
  'users:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- TECHNICIAN: visualização de projetos, tarefas de escrita/leitura, calendário, ausências
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000004'::UUID, id
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

-- VIEWER: apenas leitura
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000005'::UUID, id
FROM public.permissions
WHERE code IN (
  'projects:read',
  'tasks:read',
  'clients:read',
  'calendar:read',
  'absences:read',
  'tickets:read',
  'materials:read',
  'equipment:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Migração e normalização determinística com Verificação Explícita de Replay Safety
DO $migration$
DECLARE
  v_already_migrated BOOLEAN := FALSE;
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
    RAISE NOTICE 'A tabela public.users já possui FK para public.roles(id). Replay seguro: ignorando mapeamento semântico legacy.';
    RETURN;
  END IF;

  -- Criar coluna temporária de staging para garantir atomicidade sem corridas entre IDs coincidentes
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS canonical_role_id UUID;

  -- Mapeamento semântico explícito dos IDs legados conhecidos (SEM MATCHING FUZZY 'LIKE')
  UPDATE public.users
  SET canonical_role_id = CASE
    -- ug-1: Administrator (...0001) -> SUPER_ADMIN (...0001)
    WHEN role_id = '00000000-0000-0000-0000-000000000001'::UUID THEN '00000000-0000-0000-0000-000000000001'::UUID
    -- ug-2: Project Manager (...0002) -> PROJECT_MANAGER (...0003)
    WHEN role_id = '00000000-0000-0000-0000-000000000002'::UUID THEN '00000000-0000-0000-0000-000000000003'::UUID
    -- ug-3: Technician (...0003) -> TECHNICIAN (...0004)
    WHEN role_id = '00000000-0000-0000-0000-000000000003'::UUID THEN '00000000-0000-0000-0000-000000000004'::UUID
    -- ug-4: Viewer (...0004) -> VIEWER (...0005)
    WHEN role_id = '00000000-0000-0000-0000-000000000004'::UUID THEN '00000000-0000-0000-0000-000000000005'::UUID
    -- ug-5 / VIEWER (...0005) -> VIEWER (...0005)
    WHEN role_id = '00000000-0000-0000-0000-000000000005'::UUID THEN '00000000-0000-0000-0000-000000000005'::UUID
    ELSE NULL
  END
  WHERE role_id IS NOT NULL;

  -- Validação de Integridade Estrita: Se existir qualquer utilizador com role_id não-nulo cujo mapeamento explícito falhou, ABORTAR
  IF EXISTS (
    SELECT 1 
    FROM public.users 
    WHERE role_id IS NOT NULL AND canonical_role_id IS NULL
  ) THEN
    RAISE EXCEPTION 'MIGRATION BLOCKER: Existem utilizadores com role_id desconhecido sem mapeamento explícito para public.roles.' USING ERRCODE = '23503';
  END IF;

  -- Aplicar a coluna convertida de volta a role_id
  UPDATE public.users
  SET role_id = canonical_role_id
  WHERE canonical_role_id IS NOT NULL;

  -- Remover coluna de staging
  ALTER TABLE public.users DROP COLUMN IF EXISTS canonical_role_id;

  -- Remover constraint legada se existir
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

-- 5. Atualizar função canónica has_permission()
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
  -- 1. Resolução da identidade: em sessão autenticada, auth.uid() é primário e inalterável
  IF auth.role() = 'authenticated' THEN
    v_auth_uid := auth.uid();
  ELSE
    v_auth_uid := p_user_id;
  END IF;

  IF v_auth_uid IS NULL THEN
    IF auth.role() = 'service_role' THEN
      RETURN TRUE; -- Contexto de backend confiável / service_role
    END IF;
    RETURN FALSE;
  END IF;

  -- 2. Obter o perfil do utilizador na tabela public.users
  SELECT id, role_id, is_admin, approved, deleted
  INTO v_profile
  FROM public.users
  WHERE (auth_user_id = v_auth_uid OR id = v_auth_uid);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 3. Utilizadores inativos, não aprovados, eliminados ou sem role_id nunca têm permissões
  IF (v_profile.approved IS NOT TRUE) OR (v_profile.deleted IS TRUE) OR (v_profile.role_id IS NULL) THEN
    RETURN FALSE;
  END IF;

  -- 4. Normalizar o código de permissão ('tasks_write' <-> 'tasks:write')
  v_perm_code_alt := CASE
    WHEN POSITION(':' IN p_permission_code) > 0 THEN REPLACE(p_permission_code, ':', '_')
    ELSE REPLACE(p_permission_code, '_', ':')
  END;

  -- 5. Consulta direta à tabela canónica de RBAC (role_permissions -> permissions)
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
