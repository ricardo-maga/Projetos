-- Migration: Atomic transactional functions for Tasks domain
-- FASE 63 — Desacoplamento e Persistência Atómica do domínio Tasks

-- 1. Function to atomically create a task with assignees
CREATE OR REPLACE FUNCTION public.create_task_atomic(
  p_id UUID,
  p_project_id UUID,
  p_task_title TEXT,
  p_status_id TEXT,
  p_task_type_id TEXT,
  p_estimated_hours INTERVAL,
  p_actual_hours INTERVAL,
  p_start_date DATE,
  p_start_time TIME,
  p_end_date DATE,
  p_end_time TIME,
  p_estimated_date DATE,
  p_completed_date DATE,
  p_task_description TEXT,
  p_notes TEXT,
  p_is_milestone BOOLEAN,
  p_created_by UUID,
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
  -- 1. Validate project exists and is active
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 2. Insert into tasks table
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

-- 2. Function to atomically update a task with OCC verification and assignee syncing
CREATE OR REPLACE FUNCTION public.update_task_atomic(
  p_id UUID,
  p_expected_version INTEGER,
  p_project_id UUID,
  p_task_title TEXT,
  p_status_id TEXT,
  p_task_type_id TEXT,
  p_estimated_hours INTERVAL,
  p_actual_hours INTERVAL,
  p_start_date DATE,
  p_start_time TIME,
  p_end_date DATE,
  p_end_time TIME,
  p_estimated_date DATE,
  p_completed_date DATE,
  p_task_description TEXT,
  p_notes TEXT,
  p_is_milestone BOOLEAN,
  p_updated_by UUID,
  p_assignee_user_ids UUID[] DEFAULT NULL,
  p_update_assignees BOOLEAN DEFAULT FALSE
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

  -- 2. Validate target project if provided
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 3. Update task row and increment version
  UPDATE public.tasks
  SET
    project_id = COALESCE(p_project_id, project_id),
    task_title = COALESCE(p_task_title, task_title),
    status_id = COALESCE(p_status_id, status_id),
    task_type_id = COALESCE(p_task_type_id, task_type_id),
    estimated_hours = COALESCE(p_estimated_hours, estimated_hours),
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    start_date = COALESCE(p_start_date, start_date),
    start_time = COALESCE(p_start_time, start_time),
    end_date = COALESCE(p_end_date, end_date),
    end_time = COALESCE(p_end_time, end_time),
    estimated_date = COALESCE(p_estimated_date, estimated_date),
    completed_date = COALESCE(p_completed_date, completed_date),
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

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.create_task_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_task_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_task_atomic TO authenticated, service_role;
