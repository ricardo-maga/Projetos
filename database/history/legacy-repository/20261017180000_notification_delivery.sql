-- Notification delivery is server-owned. Every row has one recipient, and
-- event_key prevents retries or concurrent workers from duplicating notices.
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type varchar(255) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  enabled boolean DEFAULT true,
  days_before integer DEFAULT 0,
  target_group varchar(50) NOT NULL
);
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.notification_settings TO service_role;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique
  ON public.notifications (event_key);
CREATE INDEX IF NOT EXISTS notifications_recipient_recent
  ON public.notifications (user_id, created_at DESC);

INSERT INTO public.notification_settings (type, name, enabled, days_before, target_group)
VALUES
  ('new_project', 'Novo Projeto', false, 0, 'managers'),
  ('project_allocation', 'Alocação de utilizadores a projeto', true, 0, 'allocated'),
  ('task_allocation', 'Alocação de utilizador a tarefa', true, 0, 'allocated'),
  ('task_due_date', 'Data limite da tarefa (aviso prévio)', true, 2, 'allocated'),
  ('project_due_date', 'Prazo de entrega do projeto (aviso prévio)', true, 5, 'managers'),
  ('project_scheduled_date', 'Data agendada do projeto (aviso prévio)', true, 2, 'managers')
ON CONFLICT (type) DO NOTHING;

-- This optional broadcast was previously configured but had no delivery engine.
-- Start it disabled so enabling notifications does not surprise every user.
UPDATE public.notification_settings
SET enabled = false, target_group = 'managers'
WHERE type = 'new_project';

ALTER TABLE public.notification_settings
  ADD CONSTRAINT notification_settings_days_range CHECK (days_before BETWEEN 0 AND 30),
  ADD CONSTRAINT notification_settings_target_group CHECK (target_group IN ('all', 'allocated', 'managers'));

CREATE SCHEMA IF NOT EXISTS notification_internal;
REVOKE ALL ON SCHEMA notification_internal FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION notification_internal.recipients(p_group text, p_project uuid, p_task uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id
  FROM public.users u
  LEFT JOIN public.projects p ON p.id = p_project
  WHERE u.approved IS TRUE AND u.deleted IS FALSE AND u.type IS DISTINCT FROM 'External'
    AND (
      p_group = 'all'
      OR (p_group = 'managers' AND u.id IN (p.project_manager_id, p.field_manager_id))
      OR (p_group = 'allocated' AND (
        (p_task IS NULL AND u.id IN (p.project_manager_id, p.field_manager_id))
        OR (p_task IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = p_task AND ta.user_id = u.id
        ))
      ))
    );
$$;
REVOKE ALL ON FUNCTION notification_internal.recipients(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA notification_internal TO service_role;
GRANT EXECUTE ON FUNCTION notification_internal.recipients(text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION notification_internal.project_assignment_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE setting_row public.notification_settings%ROWTYPE;
DECLARE prior_manager uuid;
DECLARE prior_field_manager uuid;
BEGIN
  IF NEW.deleted IS TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    prior_manager := OLD.project_manager_id;
    prior_field_manager := OLD.field_manager_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO setting_row FROM public.notification_settings WHERE type = 'new_project' AND enabled;
    IF FOUND THEN
      INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
      SELECT r.user_id, 'Novo projeto: ' || NEW.project_title,
        'Foi criado o projeto "' || NEW.project_title || '".',
        '/projects?project=' || NEW.id,
        'new_project:' || NEW.id || ':' || r.user_id
      FROM notification_internal.recipients(setting_row.target_group, NEW.id) r
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  END IF;
  SELECT * INTO setting_row FROM public.notification_settings WHERE type = 'project_allocation' AND enabled;
  IF FOUND THEN
    INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
    SELECT r.user_id, 'Projeto atribuído: ' || NEW.project_title,
      'A equipa responsável pelo projeto "' || NEW.project_title || '" foi atualizada.',
      '/projects?project=' || NEW.id,
      'project_allocation:' || NEW.id || ':' || txid_current() || ':' || r.user_id
    FROM notification_internal.recipients(setting_row.target_group, NEW.id) r
    WHERE (TG_OP = 'INSERT' OR NEW.project_manager_id IS DISTINCT FROM prior_manager
      OR NEW.field_manager_id IS DISTINCT FROM prior_field_manager)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION notification_internal.project_assignment_notice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS project_assignment_notice ON public.projects;
CREATE TRIGGER project_assignment_notice AFTER INSERT OR UPDATE OF project_manager_id, field_manager_id
  ON public.projects FOR EACH ROW EXECUTE FUNCTION notification_internal.project_assignment_notice();

CREATE OR REPLACE FUNCTION notification_internal.task_assignment_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE setting_row public.notification_settings%ROWTYPE;
DECLARE task_row public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO setting_row FROM public.notification_settings WHERE type = 'task_allocation' AND enabled;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id AND deleted IS FALSE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id, 'Tarefa atribuída: ' || task_row.task_title,
    'Foi atribuída a tarefa "' || task_row.task_title || '".',
    '/projects?project=' || task_row.project_id,
    'task_allocation:' || NEW.task_id || ':' || NEW.user_id || ':' || txid_current() || ':' || r.user_id
  FROM notification_internal.recipients(setting_row.target_group, task_row.project_id, NEW.task_id) r
  WHERE setting_row.target_group <> 'allocated' OR r.user_id = NEW.user_id
  ON CONFLICT (event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION notification_internal.task_assignment_notice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS task_assignment_notice ON public.task_assignees;
CREATE TRIGGER task_assignment_notice AFTER INSERT ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION notification_internal.task_assignment_notice();

CREATE OR REPLACE FUNCTION public.generate_due_notifications(p_today date DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE inserted_count integer := 0;
DECLARE added integer;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id,
    CASE WHEN t.estimated_date < p_today THEN 'Tarefa em atraso: ' WHEN t.estimated_date = p_today THEN 'Tarefa vence hoje: ' ELSE 'Prazo da tarefa: ' END || t.task_title,
    'Data limite: ' || to_char(t.estimated_date, 'DD/MM/YYYY'),
    '/projects?project=' || t.project_id,
    'task_due_date:' || t.id || ':' || t.estimated_date || ':' || CASE WHEN t.estimated_date < p_today THEN 'overdue' WHEN t.estimated_date = p_today THEN 'today' ELSE 'before' END || ':' || r.user_id
  FROM public.tasks t
  JOIN public.projects p ON p.id = t.project_id AND p.deleted IS FALSE
  JOIN public.notification_settings s ON s.type = 'task_due_date' AND s.enabled
  LEFT JOIN public.task_status ts ON ts.id = t.status_id
  CROSS JOIN LATERAL notification_internal.recipients(s.target_group, t.project_id, t.id) r
  WHERE t.deleted IS FALSE AND t.completed_date IS NULL
    AND COALESCE(lower(ts.name), '') NOT LIKE '%complet%'
    AND COALESCE(lower(ts.name), '') NOT LIKE '%conclu%'
    AND (t.estimated_date = p_today OR t.estimated_date = p_today - 1
      OR (s.days_before > 0 AND t.estimated_date = p_today + s.days_before))
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  inserted_count := inserted_count + added;

  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id,
    CASE WHEN x.due_date < p_today THEN 'Projeto em atraso: ' WHEN x.due_date = p_today THEN 'Projeto vence hoje: ' ELSE 'Prazo do projeto: ' END || x.project_title,
    'Data: ' || to_char(x.due_date, 'DD/MM/YYYY'),
    '/projects?project=' || x.id,
    x.kind || ':' || x.id || ':' || x.due_date || ':' || CASE WHEN x.due_date < p_today THEN 'overdue' WHEN x.due_date = p_today THEN 'today' ELSE 'before' END || ':' || r.user_id
  FROM (
    SELECT p.id, p.project_title, p.delivery_date AS due_date, s.target_group, s.days_before, s.type AS kind
      FROM public.projects p JOIN public.notification_settings s ON s.type = 'project_due_date' AND s.enabled
    UNION ALL
    SELECT p.id, p.project_title, p.scheduled_date, s.target_group, s.days_before, s.type
      FROM public.projects p JOIN public.notification_settings s ON s.type = 'project_scheduled_date' AND s.enabled
  ) x
  JOIN public.projects p ON p.id = x.id AND p.deleted IS FALSE AND p.completed_date IS NULL
  LEFT JOIN public.project_status ps ON ps.id = p.status_id
  CROSS JOIN LATERAL notification_internal.recipients(x.target_group, x.id) r
  WHERE x.due_date IS NOT NULL
    AND COALESCE(lower(ps.name), '') NOT LIKE '%complet%'
    AND COALESCE(lower(ps.name), '') NOT LIKE '%conclu%'
    AND (x.due_date = p_today OR x.due_date = p_today - 1
      OR (x.days_before > 0 AND x.due_date = p_today + x.days_before))
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN inserted_count + added;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_due_notifications(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_notifications(date) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
SELECT cron.schedule(
  'project-notification-due-daily',
  '0 7 * * *',
  'SELECT public.generate_due_notifications();'
);
