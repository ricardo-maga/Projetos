-- Explicit planned-date PATCH semantics, with legacy RPC compatibility.
CREATE OR REPLACE FUNCTION public.update_task_atomic("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean, "p_priority_id" uuid, "p_update_priority" boolean, "p_update_estimated_date" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
  WHERE id = p_id AND (deleted IS NOT TRUE) FOR UPDATE;

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

  IF p_update_priority AND p_priority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.project_priority WHERE id = p_priority_id AND deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Prioridade da tarefa inválida ou eliminada.' USING ERRCODE = '23503';
  END IF;

  -- 6. Update task row
  UPDATE public.tasks
  SET
    priority_id = CASE WHEN p_update_priority THEN p_priority_id ELSE priority_id END,
    project_id = CASE WHEN p_update_project_id THEN p_project_id ELSE project_id END,
    task_title = COALESCE(p_task_title, task_title),
    status_id = COALESCE(v_status_uuid, status_id),
    task_type_id = CASE WHEN p_task_type_id IS NOT NULL THEN v_task_type_uuid ELSE task_type_id END,
    estimated_hours = COALESCE(p_estimated_hours, estimated_hours),
    actual_hours = CASE WHEN p_actual_hours = interval '0' THEN NULL ELSE COALESCE(p_actual_hours, actual_hours) END,
    start_date = CASE WHEN p_update_dates THEN p_start_date WHEN p_start_date IS NOT NULL THEN p_start_date ELSE start_date END,
    start_time = CASE WHEN p_start_time IS NOT NULL THEN p_start_time ELSE start_time END,
    end_date = CASE WHEN p_update_dates THEN p_end_date WHEN p_end_date IS NOT NULL THEN p_end_date ELSE end_date END,
    end_time = CASE WHEN p_end_time IS NOT NULL THEN p_end_time ELSE end_time END,
    estimated_date = CASE WHEN p_update_estimated_date THEN p_estimated_date WHEN p_estimated_date IS NOT NULL THEN p_estimated_date ELSE estimated_date END,
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
$_$;

CREATE OR REPLACE FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer DEFAULT NULL::integer, "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_task_title" "text" DEFAULT NULL::"text", "p_status_id" "text" DEFAULT NULL::"text", "p_task_type_id" "text" DEFAULT NULL::"text", "p_estimated_hours" interval DEFAULT NULL::interval, "p_actual_hours" interval DEFAULT NULL::interval, "p_start_date" "date" DEFAULT NULL::"date", "p_start_time" time without time zone DEFAULT NULL::time without time zone, "p_end_date" "date" DEFAULT NULL::"date", "p_end_time" time without time zone DEFAULT NULL::time without time zone, "p_estimated_date" "date" DEFAULT NULL::"date", "p_completed_date" "date" DEFAULT NULL::"date", "p_task_description" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_is_milestone" boolean DEFAULT NULL::boolean, "p_updated_by" "uuid" DEFAULT NULL::"uuid", "p_assignee_user_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_update_assignees" boolean DEFAULT false, "p_update_project_id" boolean DEFAULT false, "p_update_dates" boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $wrapper$
  SELECT public.update_task_atomic(p_id, p_expected_version, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_updated_by, p_assignee_user_ids, p_update_assignees, p_update_project_id, p_update_dates, NULL::uuid, false, false);
$wrapper$;

CREATE OR REPLACE FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean, "p_priority_id" "uuid", "p_update_priority" boolean) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $wrapper$
  SELECT public.update_task_atomic(p_id, p_expected_version, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_updated_by, p_assignee_user_ids, p_update_assignees, p_update_project_id, p_update_dates, p_priority_id, p_update_priority, false);
$wrapper$;

REVOKE ALL ON FUNCTION public.update_task_atomic("uuid", integer, "uuid", "text", "text", "text", interval, interval, "date", time without time zone, "date", time without time zone, "date", "date", "text", "text", boolean, "uuid", "uuid"[], boolean, boolean, boolean, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_atomic("uuid", integer, "uuid", "text", "text", "text", interval, interval, "date", time without time zone, "date", time without time zone, "date", "date", "text", "text", boolean, "uuid", "uuid"[], boolean, boolean, boolean, uuid, boolean, boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
