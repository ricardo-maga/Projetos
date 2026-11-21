BEGIN;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS audit_version smallint,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS previous_project_id uuid,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS changes jsonb,
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS automation_rule_id uuid;

CREATE INDEX audit_logs_cursor_idx ON public.audit_logs (created_at DESC, id DESC);
CREATE INDEX audit_logs_project_cursor_idx ON public.audit_logs (project_id, created_at DESC, id DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX audit_logs_prev_project_cursor_idx ON public.audit_logs (previous_project_id, created_at DESC, id DESC)
  WHERE previous_project_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS application_audit;
REVOKE ALL ON SCHEMA application_audit FROM PUBLIC, anon, authenticated;

CREATE FUNCTION application_audit.capture_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  headers jsonb := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb;
  claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  before_row jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  after_row jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  kind text := TG_ARGV[0];
  captured jsonb;
  event_action text;
  event_source text := 'application';
  actor uuid;
  related_project uuid;
  old_project uuid;
  entity uuid;
  rule_id uuid;
BEGIN
  -- Only requests backed by a trusted server login opt in. This also supports
  -- old application versions during the migration.
  IF COALESCE(claims->>'role', '') <> 'service_role'
     OR NULLIF(headers->>'x-projetos-audit-operation', '') IS NULL THEN
    RETURN NULL;
  END IF;

  actor := (headers->>'x-projetos-audit-actor')::uuid;
  IF actor IS NULL THEN RAISE EXCEPTION 'Missing audit actor'; END IF;
entity := COALESCE(after_row->>'id', before_row->>'id',
    CASE WHEN kind = 'calendar_subscription' THEN COALESCE(after_row->>'user_id', before_row->>'user_id') END)::uuid;
  old_project := (before_row->>'project_id')::uuid;
  related_project := CASE WHEN TG_OP = 'DELETE' THEN old_project ELSE (after_row->>'project_id')::uuid END;
  IF kind = 'project' THEN related_project := entity; END IF;

  SELECT COALESCE(jsonb_object_agg(field, jsonb_build_object(
    'before', before_row->field, 'after', after_row->field)), '{}'::jsonb)
  INTO captured
  FROM unnest(string_to_array(TG_ARGV[2], ' ')) AS fields(field)
  WHERE before_row->field IS DISTINCT FROM after_row->field;

  event_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN kind = 'calendar_subscription' AND TG_OP = 'DELETE' THEN 'revoked'
    WHEN kind = 'calendar_subscription' AND before_row->'token_hash' IS DISTINCT FROM after_row->'token_hash' THEN 'rotated'
    WHEN kind = 'integration' AND before_row->>'revoked_at' IS NULL AND after_row->>'revoked_at' IS NOT NULL THEN 'revoked'
    WHEN TG_OP = 'DELETE' OR (after_row->>'deleted' = 'true' AND before_row->>'deleted' IS DISTINCT FROM 'true') THEN 'deleted'
    WHEN before_row->>'deleted' = 'true' AND after_row->>'deleted' = 'false' THEN 'restored'
    WHEN kind = 'task' AND captured ? 'project_id' THEN 'moved'
    WHEN captured ? 'status_id' THEN 'status_changed'
    WHEN kind = 'task' AND captured ?| ARRAY['estimated_date', 'start_date', 'end_date', 'start_time', 'end_time'] THEN 'rescheduled'
    ELSE 'updated'
  END;

  IF TG_OP = 'UPDATE' AND event_action = 'updated' AND captured = '{}'::jsonb THEN
    IF kind = 'comment' AND before_row->'comment' IS DISTINCT FROM after_row->'comment' THEN
      captured := '{"comment":{"changed":true}}';
    ELSIF kind = 'material' AND before_row->'description' IS DISTINCT FROM after_row->'description' THEN
      captured := '{"description":{"changed":true}}';
    ELSIF kind = 'presales_template' AND before_row->'markdown' IS DISTINCT FROM after_row->'markdown' THEN
      captured := '{"document":{"changed":true}}';
    ELSIF kind = 'automation_rule' AND (before_row->'actions' IS DISTINCT FROM after_row->'actions'
          OR before_row->'trigger_condition' IS DISTINCT FROM after_row->'trigger_condition') THEN
      captured := '{"rule_configuration":{"changed":true}}';
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  IF kind = 'automation_execution' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NULL; END IF;
    event_action := 'executed';
    event_source := 'automation';
    rule_id := (after_row->>'rule_id')::uuid;
  ELSIF kind IN ('work_request', 'work_task') THEN
    IF TG_OP <> 'INSERT' THEN RETURN NULL; END IF;
    event_action := after_row->>'action';
  ELSIF kind IN ('project', 'task') THEN
    rule_id := NULLIF(current_setting('application_audit.automation_rule', true), '')::uuid;
    IF rule_id IS NOT NULL THEN event_source := 'automation'; END IF;
  END IF;

  INSERT INTO public.audit_logs (id, audit_version, user_id, actor_id, user_name, action,
    entity_type, entity_id, entity_name, project_id, previous_project_id, source,
    outcome, changes, request_id, automation_rule_id)
  VALUES (CASE WHEN kind IN ('work_request', 'work_task', 'automation_execution') THEN entity ELSE gen_random_uuid() END,
    1, (SELECT u.id FROM public.users u WHERE u.id = actor), actor,
    (SELECT u.name FROM public.users u WHERE u.id = actor), kind || '.' || event_action,
    kind, CASE WHEN kind = 'work_request' THEN (after_row->>'request_id')::uuid
      WHEN kind = 'work_task' THEN (after_row->>'task_id')::uuid ELSE entity END, left(COALESCE(after_row->>TG_ARGV[1], before_row->>TG_ARGV[1]),255),
    related_project, CASE WHEN old_project IS DISTINCT FROM related_project THEN old_project END,
    event_source, 'succeeded', captured, headers->>'x-projetos-audit-operation', rule_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION application_audit.capture_row() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF to_regclass('public.projects') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('project', 'project_title', 'project_title status_id priority_id risk_id client_id project_manager_id field_manager_id sales_rep_id start_date delivery_date estimated_date scheduled_date completed_date forecast_date is_urgent demo category_id');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.tasks') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('task', 'task_title', 'task_title status_id priority_id task_type_id estimated_date start_date start_time end_date end_time completed_date estimated_hours actual_hours is_milestone project_id');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.clients') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('client', 'client_name', 'client_name short_name city country color');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.project_risk_items') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.project_risk_items
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('risk', 'title', 'title status_id priority_id category_id owner_id identification_date review_date probability impact project_id');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.project_materials') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.project_materials
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('material', '', 'status quantity expected_delivery_date project_id');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.comments') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('comment', '', '');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.automation_rules') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.automation_rules
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('automation_rule', 'name', 'name enabled trigger_type');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.automation_executions') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.automation_executions
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('automation_execution', '', 'rule_id event_type action_count');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.work_request_events') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.work_request_events
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('work_request', '', 'request_id action');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.work_task_events') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.work_task_events
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('work_task', '', 'task_id request_id action');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.api_integrations') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.api_integrations
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('integration', '', 'revoked_at permissions client_ids project_ids rate_limit_per_minute expires_at');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.user_absences') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.user_absences
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('absence', '', 'user_id absence_start_date absence_end_date is_full_day start_time end_time');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.special_days') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.special_days
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('special_day', 'name', 'name date');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.default_tasks') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.default_tasks
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('default_task', 'title', 'title estimated_hours task_type_id');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.app_configuration') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.app_configuration
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('configuration', '', 'app_name theme_name sales_rep_group_id proj_manager_group_id field_manager_group_id task_assignee_group_id');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.notification_settings') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.notification_settings
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('notification_setting', '', 'enabled days_before target_group');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.users
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('user', '', 'approved type');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.calendar_feed_tokens') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.calendar_feed_tokens
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('calendar_subscription', '', 'scope');
  END IF;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['project_status', 'project_category', 'project_risk', 'project_priority', 'project_teams', 'project_partners', 'task_status', 'task_types', 'risk_categories', 'risk_statuses', 'risk_priorities'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row(%L, %L, %L)',
        table_name, 'reference_data', 'name', 'name scale color sort_order');
    END IF;
  END LOOP;
END $$;

DO $install_automation_audit$
BEGIN
IF to_regclass('public.automation_executions') IS NOT NULL THEN
CREATE OR REPLACE FUNCTION public.run_project_status_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  rule_row public.automation_rules%ROWTYPE;
  previous_rule text := COALESCE(current_setting('application_audit.automation_rule', true), '');
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
    PERFORM set_config('application_audit.automation_rule', rule_row.id::text, true);
    action_count := 0;
    FOR action_row IN SELECT value FROM jsonb_array_elements(rule_row.actions) LOOP
      IF action_row->>'type' = 'create_default_tasks' THEN
        IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE project_id = NEW.id AND deleted = false) THEN
          SELECT id INTO default_status FROM public.task_status
            WHERE deleted = false ORDER BY sort_order, id LIMIT 1;
          INSERT INTO public.tasks
            (project_id, task_title, task_description, estimated_hours, actual_hours,
             start_date, start_time, end_date, end_time, estimated_date, notes, status_id, task_type_id)
          SELECT NEW.id, d.title, coalesce(d.description, ''), d.estimated_hours,
                 interval '0 hours', CURRENT_DATE, time '09:00', CURRENT_DATE,
                 time '18:00', CURRENT_DATE,
                 'Gerada automaticamente pela regra de automação.', default_status, d.task_type_id
          FROM public.default_tasks d;
          action_count := action_count + 1;
        END IF;
      ELSIF action_row->>'type' = 'send_notification' THEN
        INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
        SELECT r.user_id, action_row->'params'->>'notificationTitle',
          coalesce(action_row->'params'->>'notificationMessage', ''),
          '/projects?project=' || NEW.id::text,
          'automation:' || rule_row.id::text || ':project:' || NEW.id::text || ':' || NEW.version::text || ':' || r.user_id::text
        FROM notification_internal.recipients('all', NEW.id) r
        ON CONFLICT (event_key) DO NOTHING;
        action_count := action_count + 1;
      END IF;
    END LOOP;
    INSERT INTO public.automation_executions (rule_id, event_type, entity_id, action_count)
      VALUES (rule_row.id, 'project_status_changed', NEW.id, action_count);
  END LOOP;
  PERFORM set_config('application_audit.automation_rule', previous_rule, true);
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.run_task_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  rule_row public.automation_rules%ROWTYPE;
  previous_rule text := COALESCE(current_setting('application_audit.automation_rule', true), '');
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
    PERFORM set_config('application_audit.automation_rule', rule_row.id::text, true);
    action_count := 0;
    FOR action_row IN SELECT value FROM jsonb_array_elements(rule_row.actions) LOOP
      IF action_row->>'type' = 'change_project_status' THEN
        target_status := (action_row->'params'->>'targetStatusId')::uuid;
        IF event_name = 'task_created' OR NOT EXISTS (
          SELECT 1 FROM public.tasks
          WHERE project_id = NEW.project_id AND deleted = false
            AND status_id IS DISTINCT FROM NEW.status_id
        ) THEN
          UPDATE public.projects SET status_id = target_status, version = version + 1
          WHERE id = NEW.project_id AND deleted = false
            AND status_id IS DISTINCT FROM target_status;
          action_count := action_count + 1;
        END IF;
      ELSIF action_row->>'type' = 'send_notification' THEN
        INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
        SELECT r.user_id, action_row->'params'->>'notificationTitle',
          coalesce(action_row->'params'->>'notificationMessage', ''),
          '/projects?project=' || NEW.project_id::text,
          'automation:' || rule_row.id::text || ':task:' || NEW.id::text || ':' || NEW.version::text || ':' || r.user_id::text
        FROM notification_internal.recipients('all', NEW.project_id, NEW.id) r
        ON CONFLICT (event_key) DO NOTHING;
        action_count := action_count + 1;
      END IF;
    END LOOP;
    INSERT INTO public.automation_executions (rule_id, event_type, entity_id, action_count)
      VALUES (rule_row.id, event_name, NEW.id, action_count);
  END LOOP;
  PERFORM set_config('application_audit.automation_rule', previous_rule, true);
  RETURN NEW;
END;
$function$;


END IF;
END
$install_automation_audit$;

INSERT INTO public.audit_logs (id, created_at, user_id, actor_id, user_name, action, entity_type, entity_id, source)
SELECT e.id, e.occurred_at, u.id, e.actor_id, u.name, 'work_request.' || e.action, 'work_request', e.request_id, 'legacy'
FROM public.work_request_events e LEFT JOIN public.users u ON u.id = e.actor_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_logs (id, created_at, user_id, actor_id, user_name, action, entity_type, entity_id, source)
SELECT e.id, e.occurred_at, u.id, e.actor_id, u.name, 'work_task.' || e.action, 'work_task', e.task_id, 'legacy'
FROM public.work_task_events e LEFT JOIN public.users u ON u.id = e.actor_id
ON CONFLICT (id) DO NOTHING;

-- Snapshot each affected relation before the first write, then compare the
-- final membership once. Replace-all updates can delete and reinsert the same
-- members without generating an audit event.
CREATE FUNCTION application_audit.capture_relationship() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  headers jsonb := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb;
  claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  item jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  kind text := TG_ARGV[0];
  parent_id uuid := (item->>TG_ARGV[1])::uuid;
  field text := TG_ARGV[3];
  state_key text := 'application_audit.relation_' || replace(parent_id::text, '-', '') || '_' || field;
  baseline jsonb;
  members jsonb;
  actor uuid;
  row_id uuid;
  related_project uuid;
  label text;
  delta jsonb;
BEGIN
  IF COALESCE(claims->>'role', '') <> 'service_role'
     OR NULLIF(headers->>'x-projetos-audit-operation', '') IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  baseline := NULLIF(current_setting(state_key, true), '')::jsonb;
  IF (TG_WHEN = 'BEFORE' AND baseline IS NOT NULL) OR (TG_WHEN = 'AFTER' AND baseline IS NULL) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  EXECUTE format('SELECT COALESCE(jsonb_agg(%1$I ORDER BY %1$I), ''[]''::jsonb) FROM public.%2$I WHERE %3$I = $1',
    TG_ARGV[2], TG_TABLE_NAME, TG_ARGV[1]) INTO members USING parent_id;

  IF TG_WHEN = 'BEFORE' THEN
    PERFORM set_config(state_key, members::text, true);
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM set_config(state_key, '', true);
  IF members = baseline THEN RETURN NULL; END IF;
  delta := jsonb_build_object(field, jsonb_build_object('before', baseline, 'after', members));

  SELECT a.id INTO row_id FROM public.audit_logs a
  WHERE a.audit_version = 1 AND a.entity_type = kind AND a.entity_id = parent_id
    AND a.request_id = headers->>'x-projetos-audit-operation'
    AND a.source = 'application'
  ORDER BY a.created_at DESC, a.id DESC LIMIT 1;

  IF FOUND THEN
    UPDATE public.audit_logs SET changes = COALESCE(changes, '{}'::jsonb) || delta WHERE id = row_id;
    RETURN NULL;
  END IF;

  IF kind = 'project' THEN
    SELECT p.id, p.project_title INTO related_project, label FROM public.projects p WHERE p.id = parent_id;
  ELSE
    SELECT t.project_id, t.task_title INTO related_project, label FROM public.tasks t WHERE t.id = parent_id;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;

  actor := (headers->>'x-projetos-audit-actor')::uuid;
  INSERT INTO public.audit_logs (audit_version, user_id, actor_id, user_name, action,
    entity_type, entity_id, entity_name, project_id, source, outcome, changes, request_id)
  VALUES (1, (SELECT u.id FROM public.users u WHERE u.id = actor), actor, (SELECT u.name FROM public.users u WHERE u.id = actor),
    kind || '.updated', kind, parent_id, left(label, 255), related_project, 'application', 'succeeded', delta,
    headers->>'x-projetos-audit-operation');
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION application_audit.capture_relationship() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE relation text[];
BEGIN
  FOREACH relation SLICE 1 IN ARRAY ARRAY[
    ARRAY['task_assignees','task','task_id','user_id','assignees'],
    ARRAY['project_priority_link','project','project_id','priority_id','priorities'],
    ARRAY['project_risk_link','project','project_id','risk_id','risks'],
    ARRAY['project_category_link','project','project_id','category_id','categories'],
    ARRAY['project_teams_link','project','project_id','team_id','teams'],
    ARRAY['project_partners_link','project','project_id','partner_id','partners']
  ] LOOP
    IF to_regclass('public.' || relation[1]) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('CREATE TRIGGER snapshot_application_audit BEFORE INSERT OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION application_audit.capture_relationship(%L,%L,%L,%L)',
      relation[1], relation[2], relation[3], relation[4], relation[5]);
    EXECUTE format('CREATE CONSTRAINT TRIGGER merge_application_audit AFTER INSERT OR DELETE ON public.%I
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION application_audit.capture_relationship(%L,%L,%L,%L)',
      relation[1], relation[2], relation[3], relation[4], relation[5]);
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regclass('public.presales_assets') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.presales_assets
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('presales_asset', '', 'request_id media_type');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.presales_document_templates') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.presales_document_templates
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('presales_template', 'code', 'title active sort_order');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.presales_origins') IS NOT NULL THEN
    CREATE TRIGGER capture_application_audit AFTER INSERT OR UPDATE OR DELETE ON public.presales_origins
    FOR EACH ROW EXECUTE FUNCTION application_audit.capture_row('presales_origin', 'code', 'label active sort_order');
  END IF;
END $$;

CREATE FUNCTION public.query_application_audit(
  p_from timestamptz, p_to timestamptz, p_actor uuid, p_entity uuid,
  p_module text, p_action text, p_source text, p_outcome text, p_search text,
  p_cursor_time timestamptz, p_cursor_id uuid, p_limit integer,
  p_project uuid, p_modules text[]
) RETURNS TABLE (
  id uuid, created_at timestamptz, user_id uuid, actor_id uuid, user_name text, action text,
  entity_type text, entity_id uuid, entity_name text, project_id uuid, source text,
  outcome text, request_id text, changes jsonb
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT a.id, a.created_at, a.user_id, a.actor_id, a.user_name,
    a.action, a.entity_type, a.entity_id,
    CASE WHEN p_project IS NOT NULL AND a.action = 'task.moved' THEN NULL ELSE a.entity_name END,
    CASE WHEN p_project IS NULL THEN a.project_id ELSE p_project END, a.source, a.outcome,
    CASE WHEN p_project IS NULL THEN a.request_id END,
    CASE WHEN p_project IS NOT NULL AND a.action = 'task.moved' THEN NULL ELSE a.changes END
  FROM public.audit_logs a
  WHERE a.created_at IS NOT NULL
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at < p_to)
    AND (p_cursor_time IS NULL OR (a.created_at, a.id) < (p_cursor_time, p_cursor_id))
    AND (p_actor IS NULL OR coalesce(a.actor_id, a.user_id) = p_actor)
    AND (p_entity IS NULL OR a.entity_id = p_entity)
    AND (p_module IS NULL OR lower(a.entity_type) = lower(p_module)
      OR lower(a.entity_type) = lower(p_module) || 's'
      OR (p_module = 'integration' AND lower(a.entity_type) = 'api_integrations')
      OR (p_module = 'risk' AND lower(a.entity_type) = 'project_risk_items'))
    AND (p_action IS NULL OR lower(a.action) = lower(p_action))
    AND (p_source IS NULL OR coalesce(a.source, 'legacy') = p_source)
    AND (p_outcome IS NULL OR a.outcome = p_outcome)
    AND (p_project IS NULL OR (a.audit_version = 1
      AND p_project IN (a.project_id, a.previous_project_id)
      AND a.entity_type = ANY(p_modules)))
    AND (p_search IS NULL OR
      strpos(lower(concat_ws(' ', a.action, a.entity_type, a.user_name,
        CASE WHEN p_project IS NULL OR a.action <> 'task.moved' THEN a.entity_name END,
        a.entity_id::text)), lower(p_search)) > 0)
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT least(greatest(p_limit, 1), 201);
$$;

REVOKE ALL ON FUNCTION public.query_application_audit(
  timestamptz,timestamptz,uuid,uuid,text,text,text,text,text,timestamptz,uuid,integer,uuid,text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.query_application_audit(
  timestamptz,timestamptz,uuid,uuid,text,text,text,text,text,timestamptz,uuid,integer,uuid,text[]
) TO service_role;

COMMIT;
