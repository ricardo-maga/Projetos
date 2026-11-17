-- Run after task_planned_date_clear migration; caller owns transaction/rollback.
CREATE FUNCTION pg_temp.patch_planned(v_id uuid, v_version integer, v_date date, v_update boolean)
RETURNS jsonb LANGUAGE sql AS $$ SELECT public.update_task_atomic(v_id, v_version, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_date, NULL, NULL, NULL, NULL, NULL, NULL, false, false, false, NULL, false, v_update); $$;
DO $$
DECLARE fixture_id uuid := gen_random_uuid(); result jsonb; current_version integer;
BEGIN
  INSERT INTO public.tasks(id, task_title, estimated_date, start_date, end_date)
  VALUES(fixture_id, 'QA planned date rollback', '2026-11-17', '2026-11-18', '2026-11-19');
  result := pg_temp.patch_planned(fixture_id, 1, NULL, false);
  ASSERT result->>'estimated_date' = '2026-11-17', 'Omission changed planned date';
  result := pg_temp.patch_planned(fixture_id, 2, NULL, true);
  ASSERT result->>'estimated_date' IS NULL, 'Clear failed';
  ASSERT result->>'start_date' = '2026-11-18' AND result->>'end_date' = '2026-11-19', 'Execution changed';
  ASSERT (result->>'version')::integer = 3, 'Version increment mismatch';
  result := pg_temp.patch_planned(fixture_id, 3, '2026-11-20', true);
  ASSERT result->>'estimated_date' = '2026-11-20', 'Date replacement failed';
  -- Legacy short call retains its defaults and NULL means preserve.
  result := public.update_task_atomic(p_id => fixture_id, p_expected_version => 4, p_estimated_date => NULL);
  ASSERT result->>'estimated_date' = '2026-11-20', 'Legacy call changed date';
  result := public.update_task_atomic(fixture_id, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, false, false, NULL, false);
  ASSERT result->>'estimated_date' = '2026-11-20', 'Legacy priority wrapper changed date';
  ASSERT NOT has_function_privilege('authenticated', 'public.update_task_atomic(uuid,integer,uuid,text,text,text,interval,interval,date,time without time zone,date,time without time zone,date,date,text,text,boolean,uuid,uuid[],boolean,boolean,boolean,uuid,boolean,boolean)', 'EXECUTE'), 'RPC exposed to authenticated';
  ASSERT NOT has_function_privilege('anon', 'public.update_task_atomic(uuid,integer,uuid,text,text,text,interval,interval,date,time without time zone,date,time without time zone,date,date,text,text,boolean,uuid,uuid[],boolean,boolean,boolean,uuid,boolean,boolean)', 'EXECUTE'), 'RPC exposed to anon';
  BEGIN
    PERFORM pg_temp.patch_planned(fixture_id, 1, NULL, true);
    RAISE EXCEPTION 'Stale version accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM = 'Stale version accepted' THEN RAISE; END IF;
  END;
  SELECT version INTO current_version FROM public.tasks WHERE tasks.id = fixture_id;
  ASSERT current_version = 6, 'Conflict changed row';
END $$;
