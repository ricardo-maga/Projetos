-- Keep both RPCs private to the server's service credential.
CREATE FUNCTION public.consume_rate_limits(p_limits jsonb)
RETURNS TABLE(bucket text, success boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requested record;
  current_window private.rate_limit_windows%ROWTYPE;
  ts timestamptz := now();
BEGIN
  IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'array' THEN
    RAISE EXCEPTION 'Invalid quota batch' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_limits) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Invalid quota batch size' USING ERRCODE = '22023';
  END IF;
  FOR requested IN
    SELECT q.bucket, q.max_requests, q.window_seconds, COALESCE(q.cost, 1) AS cost
    FROM jsonb_to_recordset(p_limits) AS q(bucket text, max_requests integer, window_seconds integer, cost integer)
    ORDER BY q.bucket
  LOOP
    IF requested.bucket IS NULL OR requested.bucket !~ '^[0-9a-f]{64}$'
       OR requested.max_requests IS NULL OR requested.max_requests NOT BETWEEN 1 AND 1000000
       OR requested.window_seconds IS NULL OR requested.window_seconds NOT BETWEEN 1 AND 3600
       OR requested.cost NOT BETWEEN 1 AND requested.max_requests THEN
      RAISE EXCEPTION 'Invalid quota parameters' USING ERRCODE = '22023';
    END IF;
    INSERT INTO private.rate_limit_windows AS w (bucket, window_started_at, request_count, updated_at)
    VALUES (requested.bucket, ts, requested.cost, ts)
    ON CONFLICT ON CONSTRAINT rate_limit_windows_pkey DO UPDATE SET
      window_started_at = CASE WHEN w.window_started_at + make_interval(secs => requested.window_seconds) <= ts
        THEN ts ELSE w.window_started_at END,
      request_count = CASE WHEN w.window_started_at + make_interval(secs => requested.window_seconds) <= ts
        THEN requested.cost ELSE LEAST(w.request_count::bigint + requested.cost, 2147483647)::integer END,
      updated_at = ts
    RETURNING w.* INTO current_window;
    RETURN QUERY SELECT requested.bucket, current_window.request_count <= requested.max_requests,
      greatest(requested.max_requests - current_window.request_count, 0),
      current_window.window_started_at + make_interval(secs => requested.window_seconds);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limits(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limits(jsonb) TO service_role;

CREATE FUNCTION public.api_actor_context(p_auth_user_id uuid, p_permission text, p_include_permissions boolean)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH profile AS (
    SELECT id, auth_user_id, name, email, role_id, is_admin, type, approved, deleted
    FROM public.users
    WHERE auth_user_id = p_auth_user_id
  ), active_roles AS (
    SELECT DISTINCT r.id, r.code, r.name
    FROM profile AS p
    JOIN public.user_roles AS ur ON ur.user_id = p.id
    JOIN public.roles AS r ON r.id = ur.role_id AND r.is_active IS TRUE
    WHERE p.approved IS TRUE AND p.deleted IS NOT TRUE AND p.type IS DISTINCT FROM 'External'
  )
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM profile AS p),
    'roles', COALESCE((SELECT jsonb_agg(r ORDER BY r.id) FROM active_roles AS r), '[]'::jsonb),
    'allowed', CASE WHEN p_permission IS NULL THEN NULL
      ELSE public.has_permission(p_permission, p_auth_user_id) END,
    'permissions', CASE WHEN p_include_permissions THEN COALESCE((
      SELECT jsonb_agg(DISTINCT p.code ORDER BY p.code)
      FROM active_roles AS r
      JOIN public.role_permissions AS rp ON rp.role_id = r.id
      JOIN public.permissions AS p ON p.id = rp.permission_id AND p.is_active IS TRUE
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
$$;

REVOKE ALL ON FUNCTION public.api_actor_context(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_actor_context(uuid, text, boolean) TO service_role;

-- Subtransactions retain the current per-line result whilst rolling back both writes on failure.
CREATE FUNCTION public.import_project_csv_rows(p_actor uuid, p_rows jsonb, p_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  actor record;
  row_data record;
  status_id uuid;
  category_id uuid;
  client_id uuid;
  can_read_clients boolean;
  can_write_clients boolean;
  client_created boolean;
  imported integer := 0;
  new_clients integer := 0;
  errors text[] := ARRAY[]::text[];
BEGIN
  SELECT u.id, u.auth_user_id, u.name INTO actor
  FROM public.users AS u WHERE u.id = p_actor
    AND u.approved IS TRUE AND u.deleted IS NOT TRUE AND u.type IS DISTINCT FROM 'External';
  IF NOT FOUND OR actor.auth_user_id IS NULL OR NOT public.has_permission('projects.write', actor.auth_user_id) THEN
    RAISE EXCEPTION 'Import forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Invalid import input' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'Invalid import size' USING ERRCODE = '22023';
  END IF;
  can_read_clients := public.has_permission('clients.read', actor.auth_user_id);
  can_write_clients := public.has_permission('clients.write', actor.auth_user_id);
  SELECT s.id INTO status_id FROM public.project_status AS s
    WHERE s.deleted IS FALSE ORDER BY s.sort_order, s.id LIMIT 1;
  SELECT c.id INTO category_id FROM public.project_category AS c
    WHERE c.deleted IS FALSE ORDER BY c.sort_order, c.id LIMIT 1;

  IF can_read_clients OR can_write_clients THEN
    PERFORM pg_advisory_xact_lock(keys.lock_id)
    FROM (
      SELECT DISTINCT hashtextextended('project-import:' || (item->>'client_key'), 0) AS lock_id
      FROM jsonb_array_elements(p_rows) AS item
      WHERE item->>'error' IS NULL
      ORDER BY 1
    ) AS keys;
  END IF;
  FOR row_data IN SELECT * FROM jsonb_to_recordset(p_rows)
    AS r(line integer, title text, client text, client_key text, starts_on date, ip text, sf text, error text)
  LOOP
    IF row_data.error IS NOT NULL THEN
      errors := array_append(errors, format('Linha %s: %s', row_data.line, row_data.error));
      CONTINUE;
    END IF;
    IF category_id IS NULL THEN
      errors := array_append(errors, format('Linha %s: Selecione pelo menos uma categoria.', row_data.line));
      CONTINUE;
    END IF;
    BEGIN
      client_id := NULL;
      client_created := FALSE;
      IF can_read_clients THEN
        SELECT c.id INTO client_id FROM public.clients AS c
        WHERE c.deleted IS FALSE AND (
          regexp_replace(lower(normalize(c.client_name, NFD)), '[^a-z0-9]', '', 'g') = row_data.client_key
          OR regexp_replace(lower(normalize(c.short_name, NFD)), '[^a-z0-9]', '', 'g') = row_data.client_key
        )
        ORDER BY c.id LIMIT 1;
      END IF;
      -- An actor without clients.read can reuse only clients created in this import.
      IF client_id IS NULL AND can_write_clients THEN
        SELECT c.id INTO client_id FROM public.clients AS c
        WHERE c.id = md5(p_batch::text || ':' || row_data.client_key)::uuid AND c.deleted IS FALSE;
      END IF;
      IF client_id IS NULL AND NOT can_write_clients THEN
        errors := array_append(errors, format('Linha %s: Cliente inexistente e sem permissão para o criar.', row_data.line));
        CONTINUE;
      END IF;
      IF client_id IS NULL THEN
        INSERT INTO public.clients (id, client_name, short_name, color, deleted, version, created_by, updated_by)
        VALUES (md5(p_batch::text || ':' || row_data.client_key)::uuid, row_data.client, row_data.client,
          '#3b82f6', false, 1, p_actor, p_actor) RETURNING id INTO client_id;
        client_created := TRUE;
      END IF;
      PERFORM public.create_project_transaction(
        gen_random_uuid(), false, client_id, row_data.title, 'Importado por CSV',
        status_id, p_actor, NULL, NULL, row_data.starts_on, NULL, NULL, NULL,
        row_data.ip, row_data.sf, '', 0, '', '', '', '', '', p_actor, false, NULL, NULL,
        ARRAY[category_id], ARRAY[]::uuid[], ARRAY[]::uuid[], NULL
      );
      imported := imported + 1;
      new_clients := new_clients + CASE WHEN client_created THEN 1 ELSE 0 END;
    EXCEPTION WHEN data_exception OR integrity_constraint_violation OR raise_exception THEN
      errors := array_append(errors, format('Linha %s: Não foi possível importar o projeto.', row_data.line));
    END;
  END LOOP;
  INSERT INTO public.audit_logs (audit_version, actor_id, user_id, user_name, action, entity_type, entity_id,
    source, outcome, request_id, changes)
  VALUES (1, p_actor, p_actor, actor.name, 'project_import.completed', 'project_import', p_batch,
    'application', CASE WHEN cardinality(errors) = 0 THEN 'succeeded'
      WHEN imported > 0 THEN 'partial' ELSE 'failed' END,
    COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb->>'x-projetos-audit-operation', p_batch::text),
    jsonb_build_object('imported', jsonb_build_object('after', imported), 'failed',
      jsonb_build_object('after', cardinality(errors)), 'clients_created', jsonb_build_object('after', new_clients)));
  RETURN jsonb_build_object('success', imported, 'failed', cardinality(errors), 'errors', errors, 'batchId', p_batch);
END;
$$;

REVOKE ALL ON FUNCTION public.import_project_csv_rows(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_project_csv_rows(uuid, jsonb, uuid) TO service_role;
