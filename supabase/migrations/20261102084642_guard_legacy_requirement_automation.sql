-- Avoid duplicating model tasks where the legacy automation may already have run.
CREATE OR REPLACE FUNCTION public.mutate_project_task_requirement(
  p_project_id uuid, p_requirement_id uuid, p_actor_id uuid,
  p_expected_version integer, p_action text, p_task_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  project_row public.projects%ROWTYPE;
  requirement_row public.project_task_requirements%ROWTYPE;
  state_row public.project_task_requirement_state%ROWTYPE;
  template_row public.default_tasks%ROWTYPE;
  next_task_id uuid;
  initial_status uuid;
BEGIN
  IF NOT public.has_permission('planning_center.write', p_actor_id)
     OR NOT public.has_permission('tasks:write', p_actor_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerir requisitos de tarefas.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO project_row FROM public.projects WHERE id=p_project_id AND NOT deleted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Projeto inexistente.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO requirement_row FROM public.project_task_requirements
    WHERE id=p_requirement_id AND active FOR SHARE;
  IF NOT FOUND OR NOT (
    project_row.category_id=requirement_row.category_id OR EXISTS (
      SELECT 1 FROM public.project_category_link WHERE project_id=p_project_id
        AND category_id=requirement_row.category_id)
  ) THEN RAISE EXCEPTION 'Requisito não aplicável ao projeto.' USING ERRCODE='22023'; END IF;
  IF requirement_row.necessity='conditional' AND NOT (
    (requirement_row.condition_code='install_project_no' AND nullif(btrim(project_row.install_project_no),'') IS NOT NULL)
    OR (requirement_row.condition_code='sf_opportunity_no' AND nullif(btrim(project_row.sf_opportunity_no),'') IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Condição do requisito não satisfeita.' USING ERRCODE='22023'; END IF;
  SELECT * INTO state_row FROM public.project_task_requirement_state
    WHERE project_id=p_project_id AND requirement_id=p_requirement_id FOR UPDATE;
  IF p_action='instantiate' AND state_row.task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks WHERE id=state_row.task_id AND NOT deleted) THEN
    RETURN jsonb_build_object('taskId',state_row.task_id,'version',state_row.version,'waived',false);
  END IF;
  IF coalesce(state_row.version,0)<>p_expected_version THEN
    RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001';
  END IF;
  IF p_action='instantiate' THEN
    IF state_row.waived THEN RAISE EXCEPTION 'Retire primeiro a dispensa.' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.automation_rules WHERE enabled IS TRUE AND deleted IS FALSE
      AND trigger_type='project_status_changed' AND actions @> '[{"type":"create_default_tasks"}]'::jsonb)
      AND EXISTS (SELECT 1 FROM public.tasks WHERE project_id=p_project_id AND NOT deleted) THEN
      RAISE EXCEPTION 'Associe uma tarefa existente antes de criar: há automatismo legado de modelos ativo.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO template_row FROM public.default_tasks WHERE id=requirement_row.default_task_id;
    SELECT id INTO initial_status FROM public.task_status WHERE NOT deleted
      ORDER BY sort_order,id LIMIT 1;
    IF initial_status IS NULL THEN RAISE EXCEPTION 'Estado inicial de tarefa indisponível.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.tasks(project_id,task_title,task_description,estimated_hours,actual_hours,
      task_type_id,status_id,created_by,updated_by)
    VALUES(p_project_id,template_row.title,coalesce(template_row.description,''),
      template_row.estimated_hours,interval '0 hours',template_row.task_type_id,
      initial_status,p_actor_id,p_actor_id) RETURNING id INTO next_task_id;
  ELSIF p_action='link' THEN
    IF p_task_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tasks WHERE id=p_task_id
      AND project_id=p_project_id AND NOT deleted) THEN
      RAISE EXCEPTION 'Tarefa inválida para este projeto.' USING ERRCODE='22023';
    END IF;
    next_task_id:=p_task_id;
  ELSIF p_action='waive' THEN
    IF state_row.task_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tasks
      WHERE id=state_row.task_id AND NOT deleted) THEN
      RAISE EXCEPTION 'A tarefa existente não pode ser dispensada.' USING ERRCODE='22023';
    END IF;
    IF length(btrim(coalesce(p_reason,'')))<10 THEN
      RAISE EXCEPTION 'Justificação com pelo menos 10 caracteres obrigatória.' USING ERRCODE='22023';
    END IF;
  ELSIF p_action<>'clear' THEN
    RAISE EXCEPTION 'Ação inválida.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.project_task_requirement_state
    (project_id,requirement_id,task_id,waived,reason,updated_by)
  VALUES(p_project_id,p_requirement_id,next_task_id,p_action='waive',
    CASE WHEN p_action='waive' THEN btrim(p_reason) ELSE NULL END,p_actor_id)
  ON CONFLICT(project_id,requirement_id) DO UPDATE SET
    task_id=EXCLUDED.task_id,waived=EXCLUDED.waived,reason=EXCLUDED.reason,
    version=public.project_task_requirement_state.version+1,
    updated_by=EXCLUDED.updated_by,updated_at=now()
  RETURNING * INTO state_row;
  INSERT INTO public.project_task_requirement_events
    (project_id,requirement_id,task_id,action,reason,actor_id)
  VALUES(p_project_id,p_requirement_id,next_task_id,p_action,p_reason,p_actor_id);
  RETURN jsonb_build_object('taskId',state_row.task_id,'version',state_row.version,
    'waived',state_row.waived);
END $$;
