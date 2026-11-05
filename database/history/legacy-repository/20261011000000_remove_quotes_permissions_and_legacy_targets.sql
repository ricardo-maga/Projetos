-- Finalizes retirement of the global quotes/BOM subsystem.
-- project_materials and its materials:* permissions remain in use.
BEGIN;

DELETE FROM public.role_permissions rp
USING public.permissions p
WHERE rp.permission_id = p.id
  AND p.code IN ('quotes:read', 'quotes:write', 'quotes:delete');

DELETE FROM public.permissions
WHERE code IN ('quotes:read', 'quotes:write', 'quotes:delete');

CREATE OR REPLACE FUNCTION public.write_legacy_batch(p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE c jsonb; t text; row_data jsonb; cols text; vals text; assignments text;
  existing_version bigint; expected bigint; saved_version bigint; result jsonb := '[]';
  tables constant text[] := ARRAY['user_groups','project_status','project_category','project_risk','project_priority',
    'project_teams','project_partners','task_status','task_types','users','app_configuration',
    'risk_categories','risk_statuses','risk_priorities','ticket_statuses','project_materials','project_risk_items',
    'comments','user_absences','equipment','special_days','default_tasks',
    'notifications','automation_rules','tickets'];
BEGIN
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) > 4000 THEN
    RAISE EXCEPTION 'Invalid legacy batch' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_changes) x
    GROUP BY x->>'table_name', x->'row'->>'id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate legacy rows' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_changes) ORDER BY value->>'table_name', value->'row'->>'id' LOOP
    t := c->>'table_name'; row_data := c->'row';
    IF t IS NULL OR NOT t = ANY(tables) OR jsonb_typeof(row_data) IS DISTINCT FROM 'object'
      OR row_data->>'id' IS NULL OR row_data ? 'sync_version' THEN
      RAISE EXCEPTION 'Forbidden legacy target' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(t || ':' || (row_data->>'id'), 0));
    EXECUTE format('SELECT sync_version FROM public.%I WHERE id = $1 FOR UPDATE', t)
      INTO existing_version USING (row_data->>'id')::uuid;
    expected := (c->>'expected_version')::bigint;
    IF existing_version IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Concurrent legacy modification' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(p_changes)
    ORDER BY array_position(tables, value->>'table_name'), value->'row'->>'id' LOOP
    t := c->>'table_name'; row_data := c->'row'; expected := (c->>'expected_version')::bigint;
    SELECT string_agg(format('%I', key), ',' ORDER BY key),
      string_agg(format('r.%I', key), ',' ORDER BY key),
      string_agg(format('%I = r.%I', key, key), ',' ORDER BY key) FILTER (WHERE key <> 'id')
    INTO cols, vals, assignments FROM jsonb_object_keys(row_data) key;
    IF expected IS NULL THEN
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r RETURNING sync_version', t, cols, vals, t)
        INTO saved_version USING row_data;
    ELSE
      EXECUTE format('UPDATE public.%I target SET %s FROM jsonb_populate_record(NULL::public.%I, $1) r WHERE target.id = r.id AND target.sync_version = $2 RETURNING target.sync_version', t, assignments, t)
        INTO saved_version USING row_data, expected;
      IF saved_version IS NULL THEN RAISE EXCEPTION 'Concurrent legacy modification' USING ERRCODE = '40001'; END IF;
    END IF;
    result := result || jsonb_build_array(jsonb_build_object('table_name', t, 'id', row_data->>'id', 'sync_version', saved_version));
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.write_legacy_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_legacy_batch(jsonb) TO service_role;

COMMIT;
