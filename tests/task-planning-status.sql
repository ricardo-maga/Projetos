BEGIN;

CREATE FUNCTION pg_temp.patch_task_planning(
  task_id uuid, expected_version integer, planning_status text, execution_status uuid DEFAULT NULL,
  execution_hours interval DEFAULT NULL
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.update_task_atomic(
    task_id, expected_version, NULL, NULL, execution_status::text, NULL, NULL, execution_hours,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, false, false,
    NULL, false, false, planning_status
  );
$$;

DO $$
DECLARE
  task_id uuid := gen_random_uuid();
  legacy_id uuid := gen_random_uuid();
  pending uuid := (SELECT id FROM public.task_status WHERE scale = 1 AND deleted IS NOT TRUE ORDER BY id LIMIT 1);
  running uuid := (SELECT id FROM public.task_status WHERE scale = 2 AND deleted IS NOT TRUE ORDER BY id LIMIT 1);
  task jsonb;
BEGIN
  IF pending IS NULL OR running IS NULL THEN RAISE EXCEPTION 'Missing fixture task statuses'; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.headers', jsonb_build_object(
    'x-projetos-audit-operation', task_id::text,
    'x-projetos-audit-actor', gen_random_uuid()::text
  )::text, true);

  task := public.create_task_atomic(p_id => legacy_id, p_task_title => 'Planeamento QA - antiga');
  IF task->>'planning_status' IS DISTINCT FROM 'planned' THEN RAISE EXCEPTION 'Missing legacy default'; END IF;

  task := public.create_task_atomic(
    task_id, NULL, 'Planeamento QA - reserva', pending::text, NULL, interval '4 hours', NULL,
    NULL, NULL, NULL, NULL, current_date, NULL, '', NULL, false, NULL, '{}'::uuid[], NULL, 'provisional'
  );
  IF task->>'planning_status' IS DISTINCT FROM 'provisional' OR task->>'estimated_hours' IS DISTINCT FROM '04:00:00' THEN
    RAISE EXCEPTION 'Invalid provisional create result';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.list_calendar_feed_events_v2('all', NULL) AS feed
    WHERE feed.task_id = (task->>'id')::uuid AND feed.planning_status = 'provisional') THEN
    RAISE EXCEPTION 'Subscription did not return provisional task';
  END IF;

  task := public.update_task_atomic(p_id => task_id, p_expected_version => 1, p_task_title => 'Planeamento QA - editada');
  IF task->>'planning_status' IS DISTINCT FROM 'provisional' THEN RAISE EXCEPTION 'Legacy edit cleared planning'; END IF;

  BEGIN
    PERFORM pg_temp.patch_task_planning(task_id, 2, NULL, running);
    RAISE EXCEPTION 'Execution status accepted before confirmation';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM pg_temp.patch_task_planning(task_id, 2, 'planned', NULL, interval '1 hour');
    RAISE EXCEPTION 'Confirmation and execution accepted in one operation';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM pg_temp.patch_task_planning(task_id, 1, 'planned');
    RAISE EXCEPTION 'Stale confirmation accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Conflito de concorrência%' THEN RAISE; END IF;
  END;

  task := pg_temp.patch_task_planning(task_id, 2, 'planned');
  IF task->>'planning_status' IS DISTINCT FROM 'planned' OR (task->>'version')::integer <> 3 THEN
    RAISE EXCEPTION 'Invalid confirmation result';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.audit_logs AS log
    WHERE log.entity_id = (task->>'id')::uuid
      AND log.changes #>> '{planning_status,before}' = 'provisional'
      AND log.changes #>> '{planning_status,after}' = 'planned') THEN
    RAISE EXCEPTION 'Confirmation absent from audit history';
  END IF;

  task := pg_temp.patch_task_planning(task_id, 3, NULL, running, interval '1 hour');
  IF task->>'actual_hours' IS DISTINCT FROM '01:00:00' THEN RAISE EXCEPTION 'Execution failed after confirmation'; END IF;

  BEGIN
    PERFORM pg_temp.patch_task_planning(task_id, 4, 'provisional', pending, interval '0');
    RAISE EXCEPTION 'Execution history allowed a downgrade';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$$;

ROLLBACK;
