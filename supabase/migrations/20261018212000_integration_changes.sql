-- Stable, scoped change feed for external read-only integrations.
CREATE OR REPLACE FUNCTION public.list_integration_changes(
  p_kind text,
  p_client_ids uuid[],
  p_project_ids uuid[],
  p_project_id uuid,
  p_since timestamptz,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
RETURNS TABLE(id uuid, changed_at timestamptz, deleted boolean, data jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_kind NOT IN ('projects', 'tasks') OR p_limit < 1 OR p_limit > 100
    OR p_since IS NULL OR (p_cursor_at IS NULL) <> (p_cursor_id IS NULL)
    OR (cardinality(p_client_ids) + cardinality(p_project_ids)) = 0 THEN
    RAISE EXCEPTION 'Invalid integration changes request' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'projects' THEN
    RETURN QUERY
    SELECT p.id, COALESCE(p.updated_at, p.created_at), p.deleted,
      CASE WHEN p.deleted THEN NULL ELSE to_jsonb(p) END
    FROM public.projects p
    WHERE (p.client_id = ANY(p_client_ids) OR p.id = ANY(p_project_ids))
      AND ((p_cursor_at IS NULL AND COALESCE(p.updated_at, p.created_at) > p_since)
        OR (p_cursor_at IS NOT NULL AND
          (COALESCE(p.updated_at, p.created_at), p.id) > (p_cursor_at, p_cursor_id)))
    ORDER BY COALESCE(p.updated_at, p.created_at), p.id
    LIMIT p_limit + 1;
  ELSE
    IF p_project_id IS NULL THEN
      RAISE EXCEPTION 'projectId required for tasks' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT t.id, COALESCE(t.updated_at, t.created_at), t.deleted,
      CASE WHEN t.deleted THEN NULL ELSE to_jsonb(t) END
    FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.project_id = p_project_id
      AND (p.client_id = ANY(p_client_ids) OR p.id = ANY(p_project_ids))
      AND ((p_cursor_at IS NULL AND COALESCE(t.updated_at, t.created_at) > p_since)
        OR (p_cursor_at IS NOT NULL AND
          (COALESCE(t.updated_at, t.created_at), t.id) > (p_cursor_at, p_cursor_id)))
    ORDER BY COALESCE(t.updated_at, t.created_at), t.id
    LIMIT p_limit + 1;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.list_integration_changes(text,uuid[],uuid[],uuid,timestamptz,timestamptz,uuid,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_integration_changes(text,uuid[],uuid[],uuid,timestamptz,timestamptz,uuid,integer)
  TO service_role;
