-- Migration: 20261002000000_task_temporal_integrity_constraints.sql
-- FASE 73: INTEGRIDADE TEMPORAL CANÓNICA DAS TASKS
-- Constraints & RPC Validation for start_date and end_date integrity

-- 1. Note on historical records:
-- FASE 73-A audit confirmed 0 partial date records (start_date alone or end_date alone)
-- and 0 records with start_date > end_date. No historical data cleanup UPDATE required.

-- 2. Add CHECK constraints to public.tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_tasks_temporal_both_or_neither'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT check_tasks_temporal_both_or_neither
      CHECK (
        (start_date IS NULL AND end_date IS NULL) OR
        (start_date IS NOT NULL AND end_date IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_tasks_end_date_gte_start_date'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT check_tasks_end_date_gte_start_date
      CHECK (
        start_date IS NULL OR end_date IS NULL OR end_date >= start_date
      );
  END IF;
END $$;

-- 3. Cleanup legacy/overloaded function signatures to prevent overloaded RPCs
DROP FUNCTION IF EXISTS public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[]);

DROP FUNCTION IF EXISTS public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN);
DROP FUNCTION IF EXISTS public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN);

DROP FUNCTION IF EXISTS public.delete_task_atomic(UUID, INTEGER, UUID);

-- 4. Atomic create_task_atomic RPC with temporal validation
CREATE OR REPLACE FUNCTION public.create_task_atomic(
  p_id UUID,
  p_project_id UUID DEFAULT NULL,
  p_task_title TEXT DEFAULT '',
  p_status_id TEXT DEFAULT NULL,
  p_task_type_id TEXT DEFAULT NULL,
  p_estimated_hours INTERVAL DEFAULT '0 hours'::INTERVAL,
  p_actual_hours INTERVAL DEFAULT '0 hours'::INTERVAL,
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
  v_caller_user_id UUID;
  v_status_uuid UUID;
  v_task_type_uuid UUID;
BEGIN
  -- 1. Authorization check
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:write', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para criar tarefas.' USING ERRCODE = '42501';
    END IF;

    -- Resolve caller profile in public.users to preserve FK integrity
    SELECT id INTO v_caller_user_id
    FROM public.users
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND approved = TRUE AND deleted = FALSE;

    IF p_created_by IS NOT NULL AND p_created_by <> v_caller_user_id AND p_created_by <> auth.uid() AND NOT public.is_admin() THEN
      p_created_by := COALESCE(v_caller_user_id, auth.uid());
    ELSIF p_created_by IS NULL OR p_created_by = auth.uid() THEN
      p_created_by := COALESCE(v_caller_user_id, auth.uid());
    END IF;
  ELSIF p_created_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:write', p_created_by) THEN
      RAISE EXCEPTION 'Sem permissão para criar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Validate temporal constraints: start_date and end_date must exist together and end_date >= start_date
  IF (p_start_date IS NOT NULL AND p_end_date IS NULL) OR (p_start_date IS NULL AND p_end_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Data de início e data de fim devem ser preenchidas em conjunto.' USING ERRCODE = '23514';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Data de fim não pode ser anterior à data de início.' USING ERRCODE = '23514';
  END IF;

  -- 3. Validate project exists and is active ONLY IF project_id is provided
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 4. Resolve status_id to UUID
  IF p_status_id IS NOT NULL AND trim(p_status_id) <> '' THEN
    IF p_status_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_status_uuid := p_status_id::UUID;
    ELSIF p_status_id ~ '^ts-[0-9]+$' THEN
      v_status_uuid := ('99999999-9999-9999-9999-' || lpad(substring(p_status_id from 4), 12, '0'))::UUID;
    ELSE
      v_status_uuid := NULL;
    END IF;
  ELSE
    v_status_uuid := NULL;
  END IF;

  -- 5. Resolve task_type_id to UUID
  IF p_task_type_id IS NOT NULL AND trim(p_task_type_id) <> '' THEN
    IF p_task_type_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_task_type_uuid := p_task_type_id::UUID;
    ELSIF p_task_type_id ~ '^tt-[0-9]+$' THEN
      v_task_type_uuid := ('88888888-8888-8888-8888-' || lpad(substring(p_task_type_id from 4), 12, '0'))::UUID;
    ELSE
      v_task_type_uuid := NULL;
    END IF;
  ELSE
    v_task_type_uuid := NULL;
  END IF;

  -- 6. Insert into tasks table
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
    version,
    created_by,
    updated_by,
    deleted,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_project_id,
    p_task_title,
    COALESCE(v_status_uuid, '99999999-9999-9999-9999-999999999901'::UUID),
    v_task_type_uuid,
    COALESCE(p_estimated_hours, '0 hours'::INTERVAL),
    COALESCE(p_actual_hours, '0 hours'::INTERVAL),
    p_start_date,
    p_start_time,
    p_end_date,
    p_end_time,
    p_estimated_date,
    p_completed_date,
    p_task_description,
    p_notes,
    COALESCE(p_is_milestone, FALSE),
    1,
    p_created_by,
    p_created_by,
    FALSE,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  RETURNING * INTO v_task_row;

  -- 7. Insert assignees
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

-- Revoke default public/anon access and grant strictly to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[]) TO authenticated, service_role;


-- 5. Atomic update_task_atomic RPC with temporal validation
CREATE OR REPLACE FUNCTION public.update_task_atomic(
  p_id UUID,
  p_expected_version INTEGER DEFAULT NULL,
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
  p_update_project_id BOOLEAN DEFAULT FALSE,
  p_update_dates BOOLEAN DEFAULT FALSE
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
  v_caller_user_id UUID;
  v_status_uuid UUID;
  v_task_type_uuid UUID;
  v_curr_start_date DATE;
  v_curr_end_date DATE;
  v_target_start_date DATE;
  v_target_end_date DATE;
BEGIN
  -- 1. Authorization check
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:write', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para editar tarefas.' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_caller_user_id
    FROM public.users
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND approved = TRUE AND deleted = FALSE;

    IF p_updated_by IS NOT NULL AND p_updated_by <> v_caller_user_id AND p_updated_by <> auth.uid() AND NOT public.is_admin() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    ELSIF p_updated_by IS NULL OR p_updated_by = auth.uid() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    END IF;
  ELSIF p_updated_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:write', p_updated_by) THEN
      RAISE EXCEPTION 'Sem permissão para editar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Check current task version & dates for OCC and validation
  SELECT version, start_date, end_date INTO v_current_version, v_curr_start_date, v_curr_end_date
  FROM public.tasks
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' USING ERRCODE = 'P0001';
  END IF;

  -- Determine target dates to validate
  IF p_update_dates THEN
    v_target_start_date := p_start_date;
    v_target_end_date := p_end_date;
  ELSE
    v_target_start_date := CASE WHEN p_start_date IS NOT NULL THEN p_start_date ELSE v_curr_start_date END;
    v_target_end_date := CASE WHEN p_end_date IS NOT NULL THEN p_end_date ELSE v_curr_end_date END;
  END IF;

  -- Validate temporal constraints
  IF (v_target_start_date IS NOT NULL AND v_target_end_date IS NULL) OR (v_target_start_date IS NULL AND v_target_end_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Data de início e data de fim devem ser preenchidas em conjunto.' USING ERRCODE = '23514';
  END IF;

  IF v_target_start_date IS NOT NULL AND v_target_end_date IS NOT NULL AND v_target_end_date < v_target_start_date THEN
    RAISE EXCEPTION 'Data de fim não pode ser anterior à data de início.' USING ERRCODE = '23514';
  END IF;

  -- 3. Validate target project if project_id is being updated and is not null
  IF p_update_project_id AND p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- 4. Resolve status_id to UUID
  IF p_status_id IS NOT NULL AND trim(p_status_id) <> '' THEN
    IF p_status_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_status_uuid := p_status_id::UUID;
    ELSIF p_status_id ~ '^ts-[0-9]+$' THEN
      v_status_uuid := ('99999999-9999-9999-9999-' || lpad(substring(p_status_id from 4), 12, '0'))::UUID;
    ELSE
      v_status_uuid := NULL;
    END IF;
  ELSE
    v_status_uuid := NULL;
  END IF;

  -- 5. Resolve task_type_id to UUID
  IF p_task_type_id IS NOT NULL AND trim(p_task_type_id) <> '' THEN
    IF p_task_type_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_task_type_uuid := p_task_type_id::UUID;
    ELSIF p_task_type_id ~ '^tt-[0-9]+$' THEN
      v_task_type_uuid := ('88888888-8888-8888-8888-' || lpad(substring(p_task_type_id from 4), 12, '0'))::UUID;
    ELSE
      v_task_type_uuid := NULL;
    END IF;
  ELSE
    v_task_type_uuid := NULL;
  END IF;

  -- 6. Update task row
  UPDATE public.tasks
  SET
    project_id = CASE WHEN p_update_project_id THEN p_project_id ELSE project_id END,
    task_title = COALESCE(p_task_title, task_title),
    status_id = COALESCE(v_status_uuid, status_id),
    task_type_id = CASE WHEN p_task_type_id IS NOT NULL THEN v_task_type_uuid ELSE task_type_id END,
    estimated_hours = COALESCE(p_estimated_hours, estimated_hours),
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    start_date = CASE WHEN p_update_dates THEN p_start_date WHEN p_start_date IS NOT NULL THEN p_start_date ELSE start_date END,
    start_time = CASE WHEN p_start_time IS NOT NULL THEN p_start_time ELSE start_time END,
    end_date = CASE WHEN p_update_dates THEN p_end_date WHEN p_end_date IS NOT NULL THEN p_end_date ELSE end_date END,
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

  -- 7. Sync assignees
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

-- Revoke default public/anon access and grant strictly to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;


-- 6. Atomic delete_task_atomic RPC with active planning allocations check
CREATE OR REPLACE FUNCTION public.delete_task_atomic(
  p_id UUID,
  p_expected_version INTEGER DEFAULT NULL,
  p_updated_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
  v_caller_user_id UUID;
BEGIN
  -- 1. Authorization check
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:delete', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
    END IF;

    -- Resolve caller profile in public.users to preserve FK integrity (tasks.updated_by -> users.id)
    SELECT id INTO v_caller_user_id
    FROM public.users
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND approved = TRUE AND deleted = FALSE;

    -- Non-admin cannot forge updated_by
    IF p_updated_by IS NOT NULL AND p_updated_by <> v_caller_user_id AND p_updated_by <> auth.uid() AND NOT public.is_admin() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    ELSIF p_updated_by IS NULL OR p_updated_by = auth.uid() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    END IF;
  ELSIF p_updated_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:delete', p_updated_by) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
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

  -- 3. Hardening Invariant: Check for active planning allocations (DRAFT or CONFIRMED)
  IF EXISTS (
    SELECT 1
    FROM public.planning_allocations
    WHERE task_id = p_id
      AND status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION
      'Não é possível eliminar a tarefa porque existem alocações de planeamento ativas associadas.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Soft-delete task and increment version
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

-- Revoke default public/anon access and grant strictly to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.delete_task_atomic(UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_task_atomic(UUID, INTEGER, UUID) TO authenticated, service_role;
