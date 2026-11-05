-- Run automation actions in the same transaction as the operational write.
-- Rules and execution history remain backend-only resources.
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_id uuid NOT NULL,
  action_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_executions_rule_created_idx
  ON public.automation_executions (rule_id, created_at DESC);
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_executions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_project_status_automations()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  rule_row public.automation_rules%ROWTYPE;
  action_row jsonb;
  action_count integer;
  default_status uuid;
BEGIN
  IF NEW.deleted OR OLD.status_id IS NOT DISTINCT FROM NEW.status_id THEN RETURN NEW; END IF;
  FOR rule_row IN
    SELECT * FROM public.automation_rules
    WHERE enabled = true AND deleted = false AND trigger_type = 'project_status_changed'
      AND (nullif(trigger_condition->>'toStatusId', '') IS NULL
           OR trigger_condition->>'toStatusId' = NEW.status_id::text)
      AND (nullif(trigger_condition->>'fromStatusId', '') IS NULL
           OR trigger_condition->>'fromStatusId' = OLD.status_id::text)
    ORDER BY created_at, id
  LOOP
    action_count := 0;
    FOR action_row IN SELECT value FROM jsonb_array_elements(rule_row.actions) LOOP
      IF action_row->>'type' = 'create_default_tasks' THEN
        IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE project_id = NEW.id AND deleted = false) THEN
          SELECT id INTO default_status FROM public.task_status
            WHERE deleted = false ORDER BY sort_order, id LIMIT 1;
          INSERT INTO public.tasks
            (project_id, task_title, task_description, estimated_hours, actual_hours,
             start_date, start_time, end_date, end_time, estimated_date, notes, status_id)
          SELECT NEW.id, d.title, coalesce(d.description, ''), d.estimated_hours,
                 interval '0 hours', CURRENT_DATE, time '09:00', CURRENT_DATE,
                 time '18:00', CURRENT_DATE,
                 'Gerada automaticamente pela regra de automação.', default_status
          FROM public.default_tasks d;
          action_count := action_count + 1;
        END IF;
      ELSIF action_row->>'type' = 'send_notification' THEN
        INSERT INTO public.notifications (user_id, title, message, link_url)
        SELECT u.id, action_row->'params'->>'notificationTitle',
          coalesce(action_row->'params'->>'notificationMessage', ''),
          '/projects?project=' || NEW.id::text
        FROM public.users u WHERE u.deleted = false;
        action_count := action_count + 1;
      END IF;
    END LOOP;
    INSERT INTO public.automation_executions (rule_id, event_type, entity_id, action_count)
      VALUES (rule_row.id, 'project_status_changed', NEW.id, action_count);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS run_project_status_automations ON public.projects;
CREATE TRIGGER run_project_status_automations
AFTER UPDATE OF status_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.run_project_status_automations();

CREATE OR REPLACE FUNCTION public.run_task_automations()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  rule_row public.automation_rules%ROWTYPE;
  action_row jsonb;
  event_name text;
  action_count integer;
  target_status uuid;
  old_status uuid;
BEGIN
  IF NEW.deleted OR NEW.project_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    event_name := 'task_created';
    old_status := NULL;
  ELSIF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
    event_name := 'task_status_changed';
    old_status := OLD.status_id;
  ELSE
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND deleted = false) THEN RETURN NEW; END IF;
  FOR rule_row IN
    SELECT * FROM public.automation_rules
    WHERE enabled = true AND deleted = false AND trigger_type = event_name
      AND (event_name = 'task_created'
           OR nullif(trigger_condition->>'toStatusId', '') IS NULL
           OR trigger_condition->>'toStatusId' = NEW.status_id::text)
      AND (event_name = 'task_created'
           OR nullif(trigger_condition->>'fromStatusId', '') IS NULL
           OR trigger_condition->>'fromStatusId' = old_status::text)
    ORDER BY created_at, id
  LOOP
    action_count := 0;
    FOR action_row IN SELECT value FROM jsonb_array_elements(rule_row.actions) LOOP
      IF action_row->>'type' = 'change_project_status' THEN
        target_status := (action_row->'params'->>'targetStatusId')::uuid;
        IF event_name = 'task_created' OR NOT EXISTS (
          SELECT 1 FROM public.tasks
          WHERE project_id = NEW.project_id AND deleted = false
            AND status_id IS DISTINCT FROM NEW.status_id
        ) THEN
          UPDATE public.projects SET status_id = target_status
          WHERE id = NEW.project_id AND deleted = false
            AND status_id IS DISTINCT FROM target_status;
          action_count := action_count + 1;
        END IF;
      ELSIF action_row->>'type' = 'send_notification' THEN
        INSERT INTO public.notifications (user_id, title, message, link_url)
        SELECT u.id, action_row->'params'->>'notificationTitle',
          coalesce(action_row->'params'->>'notificationMessage', ''),
          '/projects?project=' || NEW.project_id::text
        FROM public.users u WHERE u.deleted = false;
        action_count := action_count + 1;
      END IF;
    END LOOP;
    INSERT INTO public.automation_executions (rule_id, event_type, entity_id, action_count)
      VALUES (rule_row.id, event_name, NEW.id, action_count);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS run_task_automations ON public.tasks;
CREATE TRIGGER run_task_automations
AFTER INSERT OR UPDATE OF status_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.run_task_automations();

REVOKE ALL ON FUNCTION public.run_project_status_automations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_task_automations() FROM PUBLIC, anon, authenticated;
