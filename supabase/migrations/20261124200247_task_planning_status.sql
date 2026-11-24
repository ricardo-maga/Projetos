-- Persist planning confirmation and expose it to operational calendar subscriptions.

ALTER TABLE public.tasks
  ADD COLUMN planning_status text NOT NULL DEFAULT 'planned',
  ADD CONSTRAINT tasks_planning_status_check CHECK (planning_status IN ('planned', 'provisional'));

CREATE OR REPLACE FUNCTION public.guard_task_planning_status() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog, public AS $$
DECLARE
  starts_execution boolean;
  had_execution boolean;
BEGIN
  IF NEW.deleted IS TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.planning_status = 'planned' AND
      (TG_OP = 'INSERT' OR OLD.planning_status = 'planned') THEN
    RETURN NEW;
  END IF;

  starts_execution := NEW.start_date IS NOT NULL OR NEW.end_date IS NOT NULL
    OR NEW.start_time IS NOT NULL OR NEW.end_time IS NOT NULL OR NEW.completed_date IS NOT NULL
    OR COALESCE(NEW.actual_hours, interval '0') <> interval '0'
    OR NOT EXISTS (SELECT 1 FROM public.task_status WHERE id = NEW.status_id AND scale = 1);

  IF starts_execution THEN
    RAISE EXCEPTION 'Confirme o planeamento antes de registar a execução da tarefa.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.planning_status = 'planned' AND NEW.planning_status = 'provisional' THEN
    had_execution := OLD.start_date IS NOT NULL OR OLD.end_date IS NOT NULL
      OR OLD.start_time IS NOT NULL OR OLD.end_time IS NOT NULL OR OLD.completed_date IS NOT NULL
      OR COALESCE(OLD.actual_hours, interval '0') <> interval '0'
      OR NOT EXISTS (SELECT 1 FROM public.task_status WHERE id = OLD.status_id AND scale = 1);
    IF had_execution THEN
      RAISE EXCEPTION 'Só pode tornar provisória uma tarefa por iniciar e sem execução registada.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_task_planning_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_task_planning_status
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_task_planning_status();

CREATE OR REPLACE TRIGGER capture_application_audit
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row(
  'task', 'task_title',
  'task_title status_id planning_status priority_id task_type_id estimated_date start_date start_time end_date end_time completed_date estimated_hours actual_hours is_milestone project_id'
);

CREATE OR REPLACE FUNCTION public.create_task_atomic(
  p_id uuid,
  p_project_id uuid,
  p_task_title text,
  p_status_id text,
  p_task_type_id text,
  p_estimated_hours interval,
  p_actual_hours interval,
  p_start_date date,
  p_start_time time without time zone,
  p_end_date date,
  p_end_time time without time zone,
  p_estimated_date date,
  p_completed_date date,
  p_task_description text,
  p_notes text,
  p_is_milestone boolean,
  p_created_by uuid,
  p_assignee_user_ids uuid[],
  p_priority_id uuid,
  p_planning_status text
) RETURNS jsonb
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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

  IF p_priority_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_priority WHERE id = p_priority_id AND deleted IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Prioridade da tarefa inválida ou eliminada.' USING ERRCODE = '23503';
  END IF;

  -- 6. Insert into tasks table
  INSERT INTO public.tasks (
    id,
    project_id,
    task_title,
    status_id,
    task_type_id,
    priority_id,
    planning_status,
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
    p_priority_id,
    COALESCE(p_planning_status, 'planned'),
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
$_$;

REVOKE ALL ON FUNCTION public.create_task_atomic(uuid, uuid, text, text, text, interval, interval, date, time without time zone, date, time without time zone, date, date, text, text, boolean, uuid, uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_task_atomic(uuid, uuid, text, text, text, interval, interval, date, time without time zone, date, time without time zone, date, date, text, text, boolean, uuid, uuid[], uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_task_title" "text" DEFAULT ''::"text", "p_status_id" "text" DEFAULT NULL::"text", "p_task_type_id" "text" DEFAULT NULL::"text", "p_estimated_hours" interval DEFAULT '00:00:00'::interval, "p_actual_hours" interval DEFAULT '00:00:00'::interval, "p_start_date" "date" DEFAULT NULL::"date", "p_start_time" time without time zone DEFAULT NULL::time without time zone, "p_end_date" "date" DEFAULT NULL::"date", "p_end_time" time without time zone DEFAULT NULL::time without time zone, "p_estimated_date" "date" DEFAULT NULL::"date", "p_completed_date" "date" DEFAULT NULL::"date", "p_task_description" "text" DEFAULT ''::"text", "p_notes" "text" DEFAULT NULL::"text", "p_is_milestone" boolean DEFAULT false, "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_assignee_user_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS "jsonb"
LANGUAGE sql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
  SELECT public.create_task_atomic(
    p_id, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_created_by, p_assignee_user_ids, NULL::uuid, NULL::text
  );
$$;

CREATE OR REPLACE FUNCTION public.update_task_atomic(
  p_id uuid,
  p_expected_version integer,
  p_project_id uuid,
  p_task_title text,
  p_status_id text,
  p_task_type_id text,
  p_estimated_hours interval,
  p_actual_hours interval,
  p_start_date date,
  p_start_time time without time zone,
  p_end_date date,
  p_end_time time without time zone,
  p_estimated_date date,
  p_completed_date date,
  p_task_description text,
  p_notes text,
  p_is_milestone boolean,
  p_updated_by uuid,
  p_assignee_user_ids uuid[],
  p_update_assignees boolean,
  p_update_project_id boolean,
  p_update_dates boolean,
  p_priority_id uuid,
  p_update_priority boolean,
  p_update_estimated_date boolean,
  p_planning_status text
) RETURNS jsonb
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
    planning_status = COALESCE(p_planning_status, planning_status),
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

REVOKE ALL ON FUNCTION public.update_task_atomic(uuid, integer, uuid, text, text, text, interval, interval, date, time without time zone, date, time without time zone, date, date, text, text, boolean, uuid, uuid[], boolean, boolean, boolean, uuid, boolean, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_atomic(uuid, integer, uuid, text, text, text, interval, interval, date, time without time zone, date, time without time zone, date, date, text, text, boolean, uuid, uuid[], boolean, boolean, boolean, uuid, boolean, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_task_atomic("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean, "p_priority_id" uuid, "p_update_priority" boolean, "p_update_estimated_date" boolean) RETURNS "jsonb"
LANGUAGE sql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
  SELECT public.update_task_atomic(
    p_id, p_expected_version, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_updated_by, p_assignee_user_ids, p_update_assignees, p_update_project_id, p_update_dates, p_priority_id, p_update_priority, p_update_estimated_date, NULL::text
  );
$$;

CREATE OR REPLACE FUNCTION "public"."list_calendar_feed_events_v2"("p_scope" "text", "p_user_id" "uuid") RETURNS TABLE("task_id" "uuid", "project_id" "uuid", "task_title" "text", "start_date" "date", "end_date" "date", "estimated_date" "date", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "version" integer, "client_id" "uuid", "client_name" "text", "install_project_no" "text", "project_updated_at" timestamp with time zone, "client_updated_at" timestamp with time zone, "assignees" "jsonb", planning_status text)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT t.id, t.project_id, t.task_title,
    t.start_date, t.end_date, t.estimated_date,
    t.created_at, t.updated_at, t.version,
    p.client_id, c.client_name, p.install_project_no,
    p.updated_at, c.updated_at,
    COALESCE(a.assignees, '[]'::jsonb), t.planning_status
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  LEFT JOIN public.clients c ON c.id = p.client_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', u.id, 'name', u.name, 'updated_at', NULL
    ) ORDER BY ta.user_id) AS assignees,
    bool_or(ta.user_id = p_user_id) AS has_owner
    FROM public.task_assignees ta
    JOIN public.users u ON u.id = ta.user_id
    WHERE ta.task_id = t.id
  ) a ON TRUE
  WHERE t.deleted IS FALSE
    AND ((t.start_date IS NOT NULL AND t.end_date IS NOT NULL) OR t.estimated_date IS NOT NULL)
    AND (p_scope = 'all' OR (p_scope = 'mine' AND COALESCE(a.has_owner, FALSE)))
  ORDER BY t.id;
$$;

REVOKE ALL ON FUNCTION public.list_calendar_feed_events_v2(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_calendar_feed_events_v2(text, uuid) TO service_role;
