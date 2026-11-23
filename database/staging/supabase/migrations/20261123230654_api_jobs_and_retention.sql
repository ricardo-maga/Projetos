CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE public.api_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('project_import', 'audit_export')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'succeeded', 'failed')),
  payload jsonb NOT NULL,
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
CREATE INDEX api_jobs_queue_idx ON public.api_jobs (created_at, id) WHERE status = 'queued';
CREATE INDEX api_jobs_expiry_idx ON public.api_jobs (expires_at);
ALTER TABLE public.api_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.api_jobs TO service_role;

CREATE TABLE public.api_job_chunks (
  job_id uuid NOT NULL REFERENCES public.api_jobs(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  rows jsonb NOT NULL,
  PRIMARY KEY (job_id, ordinal)
);
ALTER TABLE public.api_job_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_job_chunks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.api_job_chunks TO service_role;

CREATE FUNCTION private.prepare_audit_export(p_job public.api_jobs, p_actor_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  filters jsonb := p_job.payload;
  cursor_time timestamptz;
  cursor_id uuid;
  batch jsonb;
  row_count integer;
  total integer := 0;
  chunks integer := 0;
BEGIN
  LOOP
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC, a.id DESC), count(*)
    INTO batch, row_count
    FROM public.query_application_audit(
      (filters->>'from')::timestamptz, COALESCE((filters->>'to')::timestamptz, p_job.created_at),
      (filters->>'actor')::uuid, (filters->>'entity')::uuid, filters->>'module', filters->>'action',
      filters->>'source', filters->>'outcome', filters->>'search',
      cursor_time, cursor_id, 200, NULL, NULL
    ) AS a;
    EXIT WHEN row_count = 0;
    total := total + row_count;
    IF total > 10000 THEN RAISE EXCEPTION 'audit_export_row_limit' USING ERRCODE = 'PT422'; END IF;
    -- Store individual events so the download can stream without loading the full export.
    INSERT INTO public.api_job_chunks (job_id, ordinal, rows)
    SELECT p_job.id, chunks + item.ordinality, item.value
    FROM jsonb_array_elements(batch) WITH ORDINALITY AS item;
    chunks := chunks + row_count;
    EXIT WHEN row_count < 200;
    cursor_time := (batch->(-1)->>'created_at')::timestamptz;
    cursor_id := (batch->(-1)->>'id')::uuid;
  END LOOP;
  INSERT INTO public.audit_logs (audit_version, user_id, actor_id, user_name, action, entity_type,
    source, outcome, request_id, changes)
  VALUES (1, p_job.actor_id, p_job.actor_id, p_actor_name, 'audit.export_prepared', 'audit',
    'application', 'succeeded', p_job.request_id, jsonb_build_object(
      'filters', jsonb_build_object('after', (filters - 'search') ||
        jsonb_build_object('searchApplied', filters ? 'search')),
      'row_count', jsonb_build_object('after', total)
    ));
  RETURN jsonb_build_object('count', total);
END;
$$;
REVOKE ALL ON FUNCTION private.prepare_audit_export(public.api_jobs, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.process_api_job(p_job_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job public.api_jobs;
  actor record;
  output jsonb;
  failure text;
BEGIN
  SELECT * INTO job FROM public.api_jobs
  WHERE status = 'queued' AND expires_at > now() AND (p_job_id IS NULL OR id = p_job_id)
  ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT u.auth_user_id, u.name INTO actor FROM public.users AS u
  WHERE u.id = job.actor_id AND u.approved IS TRUE AND u.deleted IS NOT TRUE AND u.type IS DISTINCT FROM 'External';
  IF NOT FOUND OR actor.auth_user_id IS NULL OR NOT public.has_permission(
    CASE job.kind WHEN 'project_import' THEN 'projects.write' ELSE 'admin.access' END, actor.auth_user_id
  ) THEN
    failure := 'ACCESS_DENIED';
  ELSE
    BEGIN
      PERFORM set_config('request.headers', jsonb_build_object(
        'x-projetos-audit-actor', job.actor_id, 'x-projetos-audit-operation', job.request_id
      )::text, true);
      IF job.kind = 'project_import' THEN
        output := public.import_project_csv_rows(job.actor_id, job.payload, job.id);
      ELSE
        output := private.prepare_audit_export(job, actor.name);
      END IF;
    EXCEPTION WHEN SQLSTATE 'PT422' THEN
      failure := 'AUDIT_ROW_LIMIT';
    WHEN OTHERS THEN
      RAISE LOG 'API job % failed with %', job.id, SQLSTATE;
      failure := 'PROCESSING_FAILED';
    END;
  END IF;
  UPDATE public.api_jobs SET status = CASE WHEN failure IS NULL THEN 'succeeded' ELSE 'failed' END,
    result = output, error_code = failure, payload = '{}'::jsonb WHERE id = job.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.process_api_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_api_job(uuid) TO service_role;

CREATE FUNCTION private.purge_expired_api_state()
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  DELETE FROM public.api_jobs WHERE expires_at <= now();
  DELETE FROM private.rate_limit_windows WHERE updated_at < now() - interval '1 day';
  DELETE FROM public.api_idempotency WHERE COALESCE(completed_at, claimed_at) < now() - interval '7 days';
$$;
REVOKE ALL ON FUNCTION private.purge_expired_api_state() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('projetos-api-jobs-v1', '* * * * *', 'SELECT public.process_api_job()');
SELECT cron.schedule('projetos-api-retention-v1', '31 3 * * *', 'SELECT private.purge_expired_api_state()');
