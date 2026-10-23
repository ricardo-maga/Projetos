-- Read-only calendar subscriptions. Only server routes may access these hashes.
CREATE TABLE public.calendar_feed_tokens (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('mine', 'all')),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_feed_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_feed_tokens TO service_role;

-- One bounded database request for the current feed size; the API pages beyond 500 rows.
-- The server checks the token, active profile and calendar:read before calling this RPC.
CREATE FUNCTION public.list_calendar_feed_events(p_scope TEXT, p_user_id UUID)
RETURNS TABLE (
  task_id UUID, project_id UUID, task_title TEXT,
  start_date DATE, end_date DATE, estimated_date DATE,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, version INTEGER,
  client_id UUID, client_name TEXT, install_project_no TEXT,
  project_updated_at TIMESTAMPTZ, client_updated_at TIMESTAMPTZ,
  assignees JSONB
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT t.id, t.project_id, t.task_title,
    t.start_date, t.end_date, t.estimated_date,
    t.created_at, t.updated_at, t.version,
    p.client_id, c.client_name, p.install_project_no,
    p.updated_at, c.updated_at,
    COALESCE(a.assignees, '[]'::jsonb)
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
$function$;

REVOKE ALL ON FUNCTION public.list_calendar_feed_events(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_calendar_feed_events(TEXT, UUID) TO service_role;
