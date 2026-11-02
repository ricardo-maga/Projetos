-- Staging only. Run the whole script in one connection; it ends with ROLLBACK.
-- No existing user is modified or used for login. An active user id is used only
-- as a foreign-key reference for the temporary allocation.
BEGIN;
SET LOCAL statement_timeout = '15s';
CREATE TEMP TABLE integrity_results (scenario text, passed boolean) ON COMMIT DROP;

DO $test$
DECLARE
  v_user uuid;
  v_project uuid := gen_random_uuid();
  v_task uuid := gen_random_uuid();
  v_allocation uuid := gen_random_uuid();
  v_blocked boolean := false;
BEGIN
  SELECT id INTO v_user FROM public.users
  WHERE deleted IS NOT TRUE AND lower(coalesce(email, '')) <> 'ricardo75@gmail.com'
  ORDER BY id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'No eligible FK reference in staging'; END IF;

  INSERT INTO public.tasks (id, project_id, task_title, deleted)
  VALUES (v_task, NULL, 'Integrity rollback test', false);
  INSERT INTO integrity_results VALUES ('nullable_task_project',
    EXISTS (SELECT 1 FROM public.tasks WHERE id = v_task AND project_id IS NULL));
  DELETE FROM public.tasks WHERE id = v_task;
  INSERT INTO integrity_results VALUES ('delete_task_without_allocation',
    NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = v_task));

  INSERT INTO public.projects (id, project_title, deleted)
  VALUES (v_project, 'Integrity rollback test', false);
  DELETE FROM public.projects WHERE id = v_project;
  INSERT INTO integrity_results VALUES ('delete_project_without_tasks',
    NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project));

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, project_id, task_title, deleted)
  VALUES (v_task, NULL, 'Integrity rollback allocation', false);
  INSERT INTO public.planning_allocations
    (id, task_id, resource_id, date, start_time, end_time, status)
  VALUES (v_allocation, v_task, v_user, '2099-12-31', '00:00', '00:01', 'CONFIRMED');
  BEGIN
    DELETE FROM public.tasks WHERE id = v_task;
  EXCEPTION WHEN foreign_key_violation THEN
    v_blocked := true;
  END;
  INSERT INTO integrity_results VALUES ('delete_task_with_allocation_blocked', v_blocked);

  v_project := gen_random_uuid();
  v_task := gen_random_uuid();
  INSERT INTO public.projects (id, project_title, deleted)
  VALUES (v_project, 'Integrity rollback dependency', false);
  INSERT INTO public.tasks (id, project_id, task_title, deleted)
  VALUES (v_task, v_project, 'Integrity rollback dependent task', false);
  v_blocked := false;
  BEGIN
    PERFORM public.delete_project_transaction(v_project, 1, NULL);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_blocked := SQLERRM LIKE '%tarefas ativas%';
  END;
  INSERT INTO integrity_results VALUES ('project_rpc_blocks_active_task',
    v_blocked AND EXISTS (SELECT 1 FROM public.projects WHERE id = v_project AND deleted IS NOT TRUE));
END
$test$;

SELECT scenario, passed FROM integrity_results ORDER BY scenario;
ROLLBACK;
