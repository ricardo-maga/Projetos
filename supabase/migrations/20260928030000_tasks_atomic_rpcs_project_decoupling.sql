-- Migration: 20260928030000_tasks_atomic_rpcs_project_decoupling.sql
-- FASE 66-B: Tasks Persistence Boundary & Project Decoupling
-- FASE 66-B-HARDENING: Granular RPC Authorization Boundary & Named Dollar Quoting
-- Permite criação e atualização de tarefas com ou sem projeto associado (project_id NULL)
-- e elimina ambiguidades no update através do parâmetro p_update_project_id.

SET search_path = public;

-- Drop previous overloaded signatures to avoid PostgreSQL function overload ambiguity (ERROR 42725)
DROP FUNCTION IF EXISTS public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[]);
DROP FUNCTION IF EXISTS public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN);
DROP FUNCTION IF EXISTS public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.delete_task_atomic(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.has_permission(TEXT, UUID);

-- 1. Canonical Helper Function to check granular permissions for a given user or authenticated caller
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
  v_target_uid UUID;
  v_user RECORD;
  v_role_code TEXT;
  v_perm_code_alt TEXT;
BEGIN
  -- 1. Determine effective target user ID:
  -- In authenticated session context, auth.uid() is primary
  -- If service_role or server-side call without auth session, use p_user_id
  IF auth.role() = 'authenticated' THEN
    v_target_uid := auth.uid();
  ELSE
    v_target_uid := p_user_id;
  END IF;

  -- If still null and service_role, grant access (trusted system backend)
  IF v_target_uid IS NULL THEN
    IF auth.role() = 'service_role' THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- 2. Lookup user profile in public.users
  SELECT id, role_id, is_admin, approved, deleted
  INTO v_user
  FROM public.users
  WHERE (auth_user_id = v_target_uid OR id = v_target_uid);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 3. Inactive, unapproved, or deleted users never have permissions
  IF (v_user.approved IS NOT TRUE) OR (v_user.deleted IS TRUE) THEN
    RETURN FALSE;
  END IF;

  -- 4. Administrators have unrestricted access
  IF (v_user.is_admin IS TRUE) OR (v_user.role_id IN ('ug-1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')) THEN
    RETURN TRUE;
  END IF;

  -- 5. Normalize permission code between 'tasks_write' and 'tasks:write'
  v_perm_code_alt := CASE
    WHEN POSITION(':' IN p_permission_code) > 0 THEN REPLACE(p_permission_code, ':', '_')
    ELSE REPLACE(p_permission_code, '_', ':')
  END;

  -- 6. Check database role_permissions junction table if entries exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'role_permissions'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE (rp.role_id::text = v_user.role_id::text)
        AND (p.code = p_permission_code OR p.code = v_perm_code_alt)
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- 7. Resolve role code from public.roles if role_id is UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roles'
  ) THEN
    SELECT code INTO v_role_code FROM public.roles WHERE id::text = v_user.role_id::text;
  END IF;

  -- 8. Fallback for legacy text role IDs ('ug-1'..'ug-4') or missing roles record
  IF v_role_code IS NULL THEN
    v_role_code := CASE
      WHEN v_user.role_id IN ('00000000-0000-0000-0000-000000000001', 'ug-1') THEN 'SUPER_ADMIN'
      WHEN v_user.role_id IN ('00000000-0000-0000-0000-000000000002') THEN 'ADMIN'
      WHEN v_user.role_id IN ('00000000-0000-0000-0000-000000000003', 'ug-2') THEN 'PROJECT_MANAGER'
      WHEN v_user.role_id IN ('00000000-0000-0000-0000-000000000004', 'ug-3') THEN 'TECHNICIAN'
      WHEN v_user.role_id IN ('00000000-0000-0000-0000-000000000005', 'ug-4') THEN 'VIEWER'
      ELSE COALESCE(v_user.role_id, 'VIEWER')
    END;
  END IF;

  -- Super Admin and Admin have all permissions
  IF v_role_code IN ('SUPER_ADMIN', 'ADMIN') THEN
    RETURN TRUE;
  END IF;

  -- Tasks permissions:
  -- tasks:write / tasks_write -> SUPER_ADMIN, ADMIN, PROJECT_MANAGER, TECHNICIAN
  IF p_permission_code IN ('tasks_write', 'tasks:write') THEN
    RETURN v_role_code IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'TECHNICIAN');
  END IF;

  -- tasks:delete / tasks_delete -> SUPER_ADMIN, ADMIN, PROJECT_MANAGER (technician and viewer CANNOT delete)
  IF p_permission_code IN ('tasks_delete', 'tasks:delete') THEN
    RETURN v_role_code IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER');
  END IF;

  -- tasks:read / tasks_read -> all active roles
  IF p_permission_code IN ('tasks_read', 'tasks:read') THEN
    RETURN v_role_code IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'TECHNICIAN', 'VIEWER');
  END IF;

  -- projects:write / projects_write -> SUPER_ADMIN, ADMIN, PROJECT_MANAGER
  IF p_permission_code IN ('projects_write', 'projects:write') THEN
    RETURN v_role_code IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER');
  END IF;

  -- projects:read / projects_read -> all active roles
  IF p_permission_code IN ('projects_read', 'projects:read') THEN
    RETURN v_role_code IN ('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'TECHNICIAN', 'VIEWER');
  END IF;

  RETURN FALSE;
END;
$function$;

-- 2. Function to atomically create a task with assignees (suporta project_id NULL)
CREATE OR REPLACE FUNCTION public.create_task_atomic(
  p_id UUID,
  p_project_id UUID DEFAULT NULL,
  p_task_title TEXT DEFAULT '',
  p_status_id TEXT DEFAULT 'ts-1',
  p_task_type_id TEXT DEFAULT NULL,
  p_estimated_hours INTERVAL DEFAULT '0 hours',
  p_actual_hours INTERVAL DEFAULT '0 hours',
  p_start_date DATE DEFAULT NULL,
  p_start_time TIME DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_end_time TIME DEFAULT NULL,
  p_estimated_date DATE DEFAULT NULL,
  p_completed_date DATE DEFAULT NULL,
  p_task_description TEXT DEFAULT '',
  p_notes TEXT DEFAULT NULL,
  p_is_milestone BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL,
  p_assignee_user_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_task_row RECORD;
  v_uid UUID;
BEGIN
  -- 1. Authorization check: if called directly in authenticated user context, verify caller is approved and has tasks:write permission
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:write', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para criar tarefas.' USING ERRCODE = '42501';
    END IF;
    -- Non-admin cannot forge created_by
    IF p_created_by IS NOT NULL AND p_created_by <> auth.uid() AND NOT public.is_admin() THEN
      p_created_by := auth.uid();
    ELSIF p_created_by IS NULL THEN
      p_created_by := auth.uid();
    END IF;
  ELSIF p_created_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:write', p_created_by) THEN
      RAISE EXCEPTION 'Sem permissão para criar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Validate project exists and is active ONLY IF project_id is provided
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 3. Insert into tasks table (project_id pode ser NULL)
  INSERT INTO public.tasks (
    id,
    project_id,
    task_title,
    status_id,
    task_type_id,
    estimated_hours,
    actual_hours,
    start_date,
    start_time,
    end_date,
    end_time,
    estimated_date,
    completed_date,
    task_description,
    notes,
    is_milestone,
    deleted,
    version,
    created_at,
    updated_at,
    created_by,
    updated_by
  ) VALUES (
    p_id,
    p_project_id,
    p_task_title,
    p_status_id,
    p_task_type_id,
    p_estimated_hours,
    p_actual_hours,
    p_start_date,
    p_start_time,
    p_end_date,
    p_end_time,
    p_estimated_date,
    p_completed_date,
    p_task_description,
    p_notes,
    COALESCE(p_is_milestone, FALSE),
    FALSE,
    1,
    timezone('utc'::text, now()),
    timezone('utc'::text, now()),
    p_created_by,
    p_created_by
  )
  RETURNING * INTO v_task_row;

  -- 4. Insert assignees atomically
  IF p_assignee_user_ids IS NOT NULL AND array_length(p_assignee_user_ids, 1) > 0 THEN
    FOREACH v_uid IN ARRAY p_assignee_user_ids LOOP
      IF v_uid IS NOT NULL THEN
        INSERT INTO public.task_assignees (task_id, user_id)
        VALUES (p_id, v_uid)
        ON CONFLICT (task_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN to_jsonb(v_task_row);
END;
$function$;

-- 3. Function to atomically update a task with OCC verification, project decoupling and assignee syncing
CREATE OR REPLACE FUNCTION public.update_task_atomic(
  p_id UUID,
  p_expected_version INTEGER,
  p_project_id UUID DEFAULT NULL,
  p_task_title TEXT DEFAULT NULL,
  p_status_id TEXT DEFAULT NULL,
  p_task_type_id TEXT DEFAULT NULL,
  p_estimated_hours INTERVAL DEFAULT NULL,
  p_actual_hours INTERVAL DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_start_time TIME DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_end_time TIME DEFAULT NULL,
  p_estimated_date DATE DEFAULT NULL,
  p_completed_date DATE DEFAULT NULL,
  p_task_description TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_is_milestone BOOLEAN DEFAULT NULL,
  p_updated_by UUID DEFAULT NULL,
  p_assignee_user_ids UUID[] DEFAULT NULL,
  p_update_assignees BOOLEAN DEFAULT FALSE,
  p_update_project_id BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
  v_uid UUID;
BEGIN
  -- 1. Authorization check: if called directly in authenticated user context, verify caller is approved and has tasks:write permission
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:write', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para editar tarefas.' USING ERRCODE = '42501';
    END IF;
    -- Non-admin cannot forge updated_by
    IF p_updated_by IS NOT NULL AND p_updated_by <> auth.uid() AND NOT public.is_admin() THEN
      p_updated_by := auth.uid();
    ELSIF p_updated_by IS NULL THEN
      p_updated_by := auth.uid();
    END IF;
  ELSIF p_updated_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:write', p_updated_by) THEN
      RAISE EXCEPTION 'Sem permissão para editar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Check current task version for OCC
  SELECT version INTO v_current_version
  FROM public.tasks
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate target project if project_id is being updated and is not null
  IF p_update_project_id AND p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- 4. Update task row and increment version
  -- Quando p_update_project_id é TRUE:
  --   Se p_project_id for UUID -> associa ao novo projeto
  --   Se p_project_id for NULL -> desassocia do projeto (project_id = NULL)
  -- Quando p_update_project_id é FALSE:
  --   Mantém o project_id existente inalterado.
  UPDATE public.tasks
  SET
    project_id = CASE WHEN p_update_project_id THEN p_project_id ELSE project_id END,
    task_title = COALESCE(p_task_title, task_title),
    status_id = COALESCE(p_status_id, status_id),
    task_type_id = CASE WHEN p_task_type_id IS NOT NULL THEN p_task_type_id ELSE task_type_id END,
    estimated_hours = COALESCE(p_estimated_hours, estimated_hours),
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    start_date = CASE WHEN p_start_date IS NOT NULL THEN p_start_date ELSE start_date END,
    start_time = CASE WHEN p_start_time IS NOT NULL THEN p_start_time ELSE start_time END,
    end_date = CASE WHEN p_end_date IS NOT NULL THEN p_end_date ELSE end_date END,
    end_time = CASE WHEN p_end_time IS NOT NULL THEN p_end_time ELSE end_time END,
    estimated_date = CASE WHEN p_estimated_date IS NOT NULL THEN p_estimated_date ELSE estimated_date END,
    completed_date = CASE WHEN p_completed_date IS NOT NULL THEN p_completed_date ELSE completed_date END,
    task_description = COALESCE(p_task_description, task_description),
    notes = COALESCE(p_notes, notes),
    is_milestone = COALESCE(p_is_milestone, is_milestone),
    version = version + 1,
    updated_at = timezone('utc'::text, now()),
    updated_by = p_updated_by
  WHERE id = p_id
  RETURNING * INTO v_task_row;

  -- 5. Sync assignees atomically if requested
  IF p_update_assignees THEN
    DELETE FROM public.task_assignees WHERE task_id = p_id;
    IF p_assignee_user_ids IS NOT NULL AND array_length(p_assignee_user_ids, 1) > 0 THEN
      FOREACH v_uid IN ARRAY p_assignee_user_ids LOOP
        IF v_uid IS NOT NULL THEN
          INSERT INTO public.task_assignees (task_id, user_id)
          VALUES (p_id, v_uid)
          ON CONFLICT (task_id, user_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN to_jsonb(v_task_row);
END;
$function$;

-- 4. Function to atomically soft-delete a task with OCC verification
CREATE OR REPLACE FUNCTION public.delete_task_atomic(
  p_id UUID,
  p_expected_version INTEGER,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
BEGIN
  -- 1. Authorization check: if called directly in authenticated user context, verify caller is approved and has tasks:delete permission
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:delete', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
    END IF;
    -- Non-admin cannot forge updated_by
    IF p_updated_by IS NOT NULL AND p_updated_by <> auth.uid() AND NOT public.is_admin() THEN
      p_updated_by := auth.uid();
    ELSIF p_updated_by IS NULL THEN
      p_updated_by := auth.uid();
    END IF;
  ELSIF p_updated_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:delete', p_updated_by) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT version INTO v_current_version
  FROM public.tasks
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tasks
  SET
    deleted = TRUE,
    version = version + 1,
    updated_at = timezone('utc'::text, now()),
    updated_by = p_updated_by
  WHERE id = p_id
  RETURNING * INTO v_task_row;

  RETURN to_jsonb(v_task_row);
END;
$function$;

-- Grant execution permissions with explicit signatures
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_task_atomic(UUID, INTEGER, UUID) TO authenticated, service_role;
