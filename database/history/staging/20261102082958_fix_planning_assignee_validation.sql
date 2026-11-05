-- Correct ambiguous assignee identifier in the applied planning RPC.
CREATE OR REPLACE FUNCTION public.plan_task_blocks(
  p_task_id uuid, p_expected_version integer, p_actor_id uuid,
  p_assignee_ids uuid[], p_blocks jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
  uid uuid;
  block_row record;
  first_date date;
BEGIN
  IF NOT public.has_permission('planning_center.write', p_actor_id)
     OR NOT public.has_permission('tasks:write', p_actor_id)
     OR NOT public.has_permission('calendar:write', p_actor_id) THEN
    RAISE EXCEPTION 'Sem permissão para planear tarefas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO task_row FROM public.tasks WHERE id = p_task_id AND deleted IS NOT TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa inexistente.' USING ERRCODE = 'P0002'; END IF;
  IF task_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.work_request_tasks WHERE task_id = p_task_id) THEN
    RAISE EXCEPTION 'Esta tarefa exige o fluxo próprio do pedido.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_blocks) <> 'array' OR p_assignee_ids IS NULL THEN
    RAISE EXCEPTION 'Plano inválido.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_assignee_ids) AS candidate(user_id) GROUP BY candidate.user_id HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM unnest(p_assignee_ids) AS candidate(user_id) LEFT JOIN public.users u ON u.id = candidate.user_id
                WHERE candidate.user_id IS NULL OR u.id IS NULL OR u.deleted IS TRUE OR u.approved IS NOT TRUE) THEN
    RAISE EXCEPTION 'Responsável inválido ou repetido.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_blocks) AS b(user_id uuid, plan_date date, day_half text)
    WHERE b.user_id IS NULL OR b.plan_date IS NULL OR b.day_half NOT IN ('am','pm')
      OR b.day_half IS NULL OR NOT (b.user_id = ANY(p_assignee_ids))
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_blocks) AS b(user_id uuid, plan_date date, day_half text)
    GROUP BY b.user_id, b.plan_date, b.day_half HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Blocos inválidos ou repetidos.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_blocks) AS b(user_id uuid, plan_date date, day_half text)
    JOIN public.user_absences a ON a.user_id = b.user_id
      AND b.plan_date BETWEEN a.absence_start_date AND a.absence_end_date
    WHERE coalesce(a.is_full_day, true)
  ) THEN RAISE EXCEPTION 'Responsável ausente num dos blocos.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_blocks) AS b(user_id uuid, plan_date date, day_half text)
    JOIN public.task_plan_blocks existing ON existing.user_id = b.user_id
      AND existing.plan_date = b.plan_date AND existing.day_half = b.day_half
    JOIN public.tasks occupied ON occupied.id = existing.task_id AND occupied.deleted IS NOT TRUE
    WHERE existing.task_id <> p_task_id
  ) THEN RAISE EXCEPTION 'Já existe trabalho no mesmo meio-dia.' USING ERRCODE = '23514'; END IF;
  SELECT min(b.plan_date) INTO first_date
  FROM jsonb_to_recordset(p_blocks) AS b(user_id uuid, plan_date date, day_half text);
  PERFORM set_config('app.explicit_task_plan', 'on', true);
  UPDATE public.tasks SET estimated_date = first_date, version = version + 1,
    updated_by = p_actor_id, updated_at = now() WHERE id = p_task_id RETURNING * INTO task_row;
  DELETE FROM public.task_assignees WHERE task_id = p_task_id;
  FOREACH uid IN ARRAY p_assignee_ids LOOP
    INSERT INTO public.task_assignees(task_id, user_id) VALUES (p_task_id, uid);
  END LOOP;
  DELETE FROM public.task_plan_blocks WHERE task_id = p_task_id;
  FOR block_row IN SELECT * FROM jsonb_to_recordset(p_blocks)
      AS b(user_id uuid, plan_date date, day_half text) LOOP
    INSERT INTO public.task_plan_blocks(task_id, user_id, plan_date, day_half)
    VALUES(p_task_id, block_row.user_id, block_row.plan_date, block_row.day_half);
  END LOOP;
  RETURN to_jsonb(task_row);
END $$;


;
