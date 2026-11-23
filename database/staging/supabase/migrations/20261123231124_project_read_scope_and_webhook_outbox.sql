-- The RPC owner can read only through RLS. Authenticated still has no table grant.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'projetos_project_reader') THEN
    CREATE ROLE projetos_project_reader NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT projetos_project_reader TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT USAGE, CREATE ON SCHEMA public TO projetos_project_reader;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO projetos_project_reader;
GRANT SELECT ON public.projects, public.project_teams_link, public.project_partners_link,
  public.project_category_link, public.project_priority_link, public.project_risk_link TO projetos_project_reader;
CREATE POLICY scoped_projects_read ON public.projects FOR SELECT TO projetos_project_reader
  USING (deleted IS FALSE AND (SELECT public.has_permission('projects.read', NULL)));
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['project_teams_link','project_partners_link','project_category_link',
    'project_priority_link','project_risk_link'] LOOP
    EXECUTE format('CREATE POLICY scoped_project_links_read ON public.%I FOR SELECT TO projetos_project_reader ' ||
      'USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id))', relation);
  END LOOP;
END $$;

CREATE FUNCTION public.scoped_project_detail(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT to_jsonb(p) || jsonb_build_object(
    'teams', ARRAY(SELECT l.team_id FROM public.project_teams_link l WHERE l.project_id = p.id ORDER BY l.team_id),
    'partners', ARRAY(SELECT l.partner_id FROM public.project_partners_link l WHERE l.project_id = p.id ORDER BY l.partner_id),
    'categories', ARRAY(SELECT l.category_id FROM public.project_category_link l WHERE l.project_id = p.id ORDER BY l.category_id),
    'priorities', ARRAY(SELECT l.priority_id FROM public.project_priority_link l WHERE l.project_id = p.id),
    'risks', ARRAY(SELECT l.risk_id FROM public.project_risk_link l WHERE l.project_id = p.id)
  )
  FROM public.projects p WHERE p.id = p_id;
$$;
ALTER FUNCTION public.scoped_project_detail(uuid) OWNER TO projetos_project_reader;
REVOKE CREATE ON SCHEMA public FROM projetos_project_reader;
REVOKE ALL ON FUNCTION public.scoped_project_detail(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scoped_project_detail(uuid) TO authenticated;

CREATE INDEX projects_active_created_id_idx ON public.projects (created_at DESC, id DESC) WHERE deleted IS FALSE;

-- Only approved destinations have access to signed notifications; credentials never go in HTTP headers.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE private.webhook_allowed_hosts (
  host text PRIMARY KEY CHECK (host ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$')
);
CREATE TABLE private.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  host text NOT NULL REFERENCES private.webhook_allowed_hosts(host),
  path text NOT NULL CHECK (path ~ '^(/[a-zA-Z0-9_.~%-]+)*/?$'),
  signing_secret text NOT NULL CHECK (char_length(signing_secret) >= 32),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE private.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  resource_id uuid NOT NULL,
  project_id uuid,
  client_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.webhook_deliveries (
  event_id uuid NOT NULL REFERENCES private.domain_events(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES private.webhook_subscriptions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','delivered','dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt timestamptz NOT NULL DEFAULT now(),
  request_id bigint,
  PRIMARY KEY (event_id, subscription_id)
);
CREATE INDEX webhook_deliveries_due_idx ON private.webhook_deliveries (next_attempt)
  WHERE state IN ('pending', 'sent');
ALTER TABLE private.webhook_allowed_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.webhook_allowed_hosts, private.webhook_subscriptions, private.domain_events, private.webhook_deliveries
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.capture_domain_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  event_id uuid;
  v_project_id uuid;
  v_client_id uuid;
  suffix text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.webhook_subscriptions WHERE active) THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
  suffix := CASE WHEN TG_OP = 'INSERT' THEN 'created' WHEN TG_OP = 'DELETE' THEN 'deleted'
    WHEN TG_OP = 'UPDATE' AND (row_data->>'deleted')::boolean IS TRUE
      AND (to_jsonb(OLD)->>'deleted')::boolean IS DISTINCT FROM TRUE THEN 'deleted' ELSE 'updated' END;
  IF TG_TABLE_NAME = 'projects' THEN
    v_project_id := (row_data->>'id')::uuid;
    v_client_id := (row_data->>'client_id')::uuid;
  ELSE
    v_project_id := (row_data->>'project_id')::uuid;
    SELECT p.client_id INTO v_client_id FROM public.projects p WHERE p.id = v_project_id;
  END IF;
  INSERT INTO private.domain_events(event_type, resource_id, project_id, client_id)
    VALUES (TG_ARGV[0] || '.' || suffix, (row_data->>'id')::uuid, v_project_id, v_client_id)
    RETURNING id INTO event_id;
  INSERT INTO private.webhook_deliveries (event_id, subscription_id)
    SELECT event_id, s.id FROM private.webhook_subscriptions s
    JOIN public.api_integrations i ON i.id = s.integration_id
    WHERE s.active AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (TG_TABLE_NAME || ':read') = ANY(i.permissions)
      AND (v_project_id = ANY(i.project_ids) OR v_client_id = ANY(i.client_ids));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_domain_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER webhook_project_event AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.capture_domain_event('project');
CREATE TRIGGER webhook_task_event AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION private.capture_domain_event('task');

CREATE FUNCTION private.dispatch_webhook_events()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  delivery record;
  response_status integer;
  request_body jsonb;
  request_time text;
  signature text;
BEGIN
  FOR delivery IN
    SELECT d.*, s.host, s.path, s.signing_secret, s.active AND i.revoked_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (split_part(e.event_type, '.', 1) || 's:read') = ANY(i.permissions)
      AND (e.project_id = ANY(i.project_ids) OR e.client_id = ANY(i.client_ids)) AS authorized,
      e.event_type, e.resource_id, e.project_id, e.occurred_at
    FROM private.webhook_deliveries d
    JOIN private.webhook_subscriptions s ON s.id = d.subscription_id
    LEFT JOIN public.api_integrations i ON i.id = s.integration_id
    JOIN private.domain_events e ON e.id = d.event_id
    WHERE d.state IN ('pending', 'sent') AND d.next_attempt <= now()
    ORDER BY d.next_attempt LIMIT 50 FOR UPDATE OF d SKIP LOCKED
  LOOP
    IF delivery.authorized IS DISTINCT FROM TRUE THEN
      UPDATE private.webhook_deliveries SET state = 'dead'
        WHERE event_id = delivery.event_id AND subscription_id = delivery.subscription_id;
      CONTINUE;
    END IF;
    IF delivery.state = 'sent' THEN
      SELECT status_code INTO response_status FROM net._http_response WHERE id = delivery.request_id LIMIT 1;
      UPDATE private.webhook_deliveries
      SET state = CASE WHEN response_status BETWEEN 200 AND 299 THEN 'delivered'
        WHEN delivery.attempts >= 6 THEN 'dead' ELSE 'pending' END,
        next_attempt = now() + make_interval(secs => 60 * power(2, greatest(0, delivery.attempts - 1)))
      WHERE event_id = delivery.event_id AND subscription_id = delivery.subscription_id;
      CONTINUE;
    END IF;
    request_body := jsonb_build_object('id', delivery.event_id, 'type', delivery.event_type,
      'resourceId', delivery.resource_id, 'projectId', delivery.project_id, 'occurredAt', delivery.occurred_at);
    request_time := floor(extract(epoch FROM now()))::bigint::text;
    signature := encode(extensions.hmac(request_time || '.' || request_body::text, delivery.signing_secret, 'sha256'), 'hex');
    UPDATE private.webhook_deliveries SET state = 'sent', attempts = delivery.attempts + 1,
      next_attempt = now() + interval '2 minutes',
      request_id = net.http_post(url := 'https://' || delivery.host || delivery.path, body := request_body,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Id', delivery.event_id,
          'X-Webhook-Timestamp', request_time, 'X-Webhook-Signature', 'sha256=' || signature),
        timeout_milliseconds := 5000)
    WHERE event_id = delivery.event_id AND subscription_id = delivery.subscription_id;
  END LOOP;
  DELETE FROM private.domain_events WHERE occurred_at < now() - interval '7 days';
END;
$$;
REVOKE ALL ON FUNCTION private.dispatch_webhook_events() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('projetos-webhook-events-v1', '* * * * *', 'SELECT private.dispatch_webhook_events()');
