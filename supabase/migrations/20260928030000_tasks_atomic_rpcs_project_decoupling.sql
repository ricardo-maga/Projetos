-- Migration: 20260928030000_tasks_atomic_rpcs_project_decoupling.sql
-- FASE 66-B: Tasks Persistence Boundary & Project Decoupling
-- Permite criação e atualização de tarefas com ou sem projeto associado (project_id NULL)
-- e elimina ambiguidades no update através do parâmetro p_update_project_id.

SET search_path = public;

-- Drop previous overloaded signatures to avoid PostgreSQL function overload ambiguity (ERROR 42725)
DROP FUNCTION IF EXISTS public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[]);
DROP FUNCTION IF EXISTS public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN);
DROP FUNCTION IF EXISTS public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.delete_task_atomic(UUID, INTEGER, UUID);

-- 1. Function to atomically create a task with assignees (suporta project_id NULL)
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
AS $$
DECLARE
  v_task_row RECORD;
  v_uid UUID;
BEGIN
  -- 1. Validate project exists and is active ONLY IF project_id is provided
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 2. Insert into tasks table (project_id pode ser NULL)
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

  -- 3. Insert assignees atomically
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
$$;

-- 2. Function to atomically update a task with OCC verification, project decoupling and assignee syncing
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
AS $$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
  v_uid UUID;
BEGIN
  -- 1. Check current task version for OCC
  SELECT version INTO v_current_version
  FROM public.tasks
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validate target project if project_id is being updated and is not null
  IF p_update_project_id AND p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 3. Update task row and increment version
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

  -- 4. Sync assignees atomically if requested
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
$$;

-- 3. Function to atomically soft-delete a task with OCC verification
CREATE OR REPLACE FUNCTION public.delete_task_atomic(
  p_id UUID,
  p_expected_version INTEGER,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
BEGIN
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
$$;

-- Grant execution permissions with explicit signatures
GRANT EXECUTE ON FUNCTION public.create_task_atomic(UUID, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_task_atomic(UUID, INTEGER, UUID, TEXT, TEXT, TEXT, INTERVAL, INTERVAL, DATE, TIME, DATE, TIME, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID[], BOOLEAN, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_task_atomic(UUID, INTEGER, UUID) TO authenticated, service_role;
