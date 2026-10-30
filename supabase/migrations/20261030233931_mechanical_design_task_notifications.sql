-- Independent mechanical-design tasks use the existing task notification settings.
CREATE OR REPLACE FUNCTION notification_internal.task_assignment_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE setting_row public.notification_settings%ROWTYPE;
DECLARE task_row public.tasks%ROWTYPE;
DECLARE request_id uuid;
DECLARE destination text;
BEGIN
  SELECT * INTO setting_row FROM public.notification_settings WHERE type = 'task_allocation' AND enabled;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id AND deleted IS FALSE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT wt.request_id INTO request_id FROM public.work_request_tasks wt WHERE wt.task_id = NEW.task_id;
  destination := CASE WHEN request_id IS NOT NULL THEN '/projects?tab=mechanical-design&request=' || request_id::text
    WHEN task_row.project_id IS NOT NULL THEN '/projects?project=' || task_row.project_id::text END;
  IF destination IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id, 'Tarefa atribuída: ' || task_row.task_title,
    'Foi atribuída a tarefa "' || task_row.task_title || '".', destination,
    'task_allocation:' || NEW.task_id || ':' || NEW.user_id || ':' || txid_current() || ':' || r.user_id
  FROM notification_internal.recipients(setting_row.target_group, task_row.project_id, NEW.task_id) r
  WHERE setting_row.target_group <> 'allocated' OR r.user_id = NEW.user_id
  ON CONFLICT (event_key) DO NOTHING;
  RETURN NEW;
END; $$;

-- The existing daily task reminder uses estimated_date and requires a project.
-- A request has one agreed deadline; remind once per request and recipient.
CREATE FUNCTION notification_internal.generate_mechanical_design_due(p_today date DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE added integer;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id,
    CASE WHEN w.planned_end_date < p_today THEN 'Pedido em atraso: '
      WHEN w.planned_end_date = p_today THEN 'Pedido vence hoje: ' ELSE 'Prazo do pedido: ' END || w.title,
    'Data limite: ' || to_char(w.planned_end_date, 'DD/MM/YYYY'),
    '/projects?tab=mechanical-design&request=' || w.id::text,
    'task_due_date:mechanical_design:' || w.id || ':' || w.planned_end_date || ':' ||
      CASE WHEN w.planned_end_date < p_today THEN 'overdue' WHEN w.planned_end_date = p_today THEN 'today' ELSE 'before' END || ':' || r.user_id
  FROM public.work_requests w
  JOIN public.notification_settings s ON s.type = 'task_due_date' AND s.enabled
  CROSS JOIN LATERAL (
    SELECT u.id AS user_id FROM public.users u
    WHERE u.approved IS TRUE AND u.deleted IS FALSE AND u.type IS DISTINCT FROM 'External'
      AND (s.target_group = 'all'
        OR (s.target_group = 'managers' AND u.id = w.area_owner_id)
        OR (s.target_group = 'allocated' AND EXISTS (
          SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id = wt.task_id
          WHERE wt.request_id = w.id AND ta.user_id = u.id)))
  ) r
  WHERE w.kind = 'mechanical_design' AND w.status IN ('submitted','accepted')
    AND w.planned_end_date IS NOT NULL
    AND (w.planned_end_date = p_today OR w.planned_end_date = p_today - 1
      OR (s.days_before > 0 AND w.planned_end_date = p_today + s.days_before))
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END; $$;
REVOKE ALL ON FUNCTION notification_internal.generate_mechanical_design_due(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notification_internal.generate_mechanical_design_due(date) TO service_role;
SELECT cron.schedule('mechanical-design-notification-due-daily', '0 7 * * *',
  'SELECT notification_internal.generate_mechanical_design_due();');

-- Reuse enabled task rules for independent requests. A rule that changes a
-- project status has no target for an independent request and is skipped.
CREATE FUNCTION notification_internal.run_mechanical_design_task_rules(
  p_task_id uuid, p_event text, p_from_status uuid, p_to_status uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE request_id uuid;
DECLARE rule_row public.automation_rules%ROWTYPE;
DECLARE action_row jsonb;
DECLARE action_count integer;
BEGIN
  SELECT wt.request_id INTO request_id FROM public.work_request_tasks wt
  JOIN public.tasks t ON t.id = wt.task_id
  WHERE wt.task_id = p_task_id AND t.project_id IS NULL AND t.deleted IS FALSE;
  IF request_id IS NULL THEN RETURN; END IF;
  FOR rule_row IN SELECT * FROM public.automation_rules
    WHERE enabled IS TRUE AND deleted IS FALSE AND trigger_type = p_event
      AND (p_event = 'task_created' OR nullif(trigger_condition->>'toStatusId','') IS NULL
        OR trigger_condition->>'toStatusId' = p_to_status::text)
      AND (p_event = 'task_created' OR nullif(trigger_condition->>'fromStatusId','') IS NULL
        OR trigger_condition->>'fromStatusId' = p_from_status::text)
    ORDER BY created_at, id
  LOOP
    action_count := 0;
    FOR action_row IN SELECT value FROM jsonb_array_elements(rule_row.actions) LOOP
      IF action_row->>'type' = 'send_notification' THEN
        INSERT INTO public.notifications (user_id, title, message, link_url)
        SELECT u.id, action_row->'params'->>'notificationTitle',
          coalesce(action_row->'params'->>'notificationMessage', ''),
          '/projects?tab=mechanical-design&request=' || request_id::text
        FROM public.users u WHERE u.deleted IS FALSE;
        action_count := action_count + 1;
      END IF;
    END LOOP;
    INSERT INTO public.automation_executions (rule_id,event_type,entity_id,action_count)
    VALUES (rule_row.id,p_event,p_task_id,action_count);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION notification_internal.run_mechanical_design_task_rules(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION notification_internal.mechanical_design_task_link_rule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM notification_internal.run_mechanical_design_task_rules(NEW.task_id,'task_created',NULL,NULL);
  RETURN NEW;
END; $$;
CREATE TRIGGER mechanical_design_task_link_rule AFTER INSERT ON public.work_request_tasks
FOR EACH ROW EXECUTE FUNCTION notification_internal.mechanical_design_task_link_rule();

CREATE FUNCTION notification_internal.mechanical_design_task_status_rule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    PERFORM notification_internal.run_mechanical_design_task_rules(NEW.id,'task_status_changed',OLD.status_id,NEW.status_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER mechanical_design_task_status_rule AFTER UPDATE OF status_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION notification_internal.mechanical_design_task_status_rule();
