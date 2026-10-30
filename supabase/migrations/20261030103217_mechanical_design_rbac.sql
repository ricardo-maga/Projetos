-- Mechanical design participates in the configurable RBAC catalogue.
INSERT INTO public.permissions(code,module,action,description,is_system,is_active)
VALUES
  ('mechanical_design.read','mechanical_design','read','Consultar pedidos e tarefas de desenho mecânico',TRUE,TRUE),
  ('mechanical_design.create','mechanical_design','create','Criar pedidos de desenho mecânico',TRUE,TRUE),
  ('mechanical_design.manage','mechanical_design','manage','Aceitar, recusar, editar e atribuir pedidos de desenho',TRUE,TRUE),
  ('mechanical_design.execute','mechanical_design','execute','Executar tarefas e confirmar entregas de desenho',TRUE,TRUE),
  ('mechanical_design.coordinate','mechanical_design','coordinate','Resolver pedidos de desenho atribuídos a outro gestor',TRUE,TRUE)
ON CONFLICT(code) DO UPDATE SET module=EXCLUDED.module,action=EXCLUDED.action,
  description=EXCLUDED.description,is_active=TRUE,deprecated_at=NULL,updated_at=now();

-- Every current internal team role can see and submit requests. The Super
-- Administrator can subsequently change these grants in Funções e permissões.
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT DISTINCT ur.role_id,p.id FROM public.user_roles ur
JOIN public.users u ON u.id=ur.user_id AND u.approved IS TRUE AND u.deleted IS FALSE AND u.type <> 'External'
JOIN public.roles r ON r.id=ur.role_id AND r.is_active IS TRUE
JOIN public.permissions p ON p.code IN ('mechanical_design.read','mechanical_design.create')
ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_active IS TRUE AND r.code IN ('PROJECT_MANAGER','TECHNICIAN','SOLUTIONS','ADMIN','SUPER_ADMIN')
  AND p.code='mechanical_design.execute'
ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_active IS TRUE AND r.code='PROJECT_MANAGER'
  AND p.code IN ('mechanical_design.manage','mechanical_design.coordinate')
ON CONFLICT(role_id,permission_id) DO NOTHING;

-- Every RPC writes its event in the same transaction. These guards make the
-- new catalogue authoritative even if a server route accidentally skips it.
CREATE OR REPLACE FUNCTION public.guard_mechanical_design_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.kind = 'mechanical_design' THEN
    IF NOT public.is_mechanical_design_manager(NEW.area_owner_id) THEN
      RAISE EXCEPTION 'O responsável pelo desenho deve ser um gestor de projeto ativo.' USING ERRCODE = '22023';
    END IF;
    IF TG_OP='INSERT' AND NOT public.has_permission('mechanical_design.create',NEW.requester_id) THEN
      RAISE EXCEPTION 'Sem permissão para criar pedidos de desenho.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_mechanical_design_manager_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.action IN ('file','deliver') THEN
    IF NOT public.has_permission('mechanical_design.execute',NEW.actor_id) THEN
      RAISE EXCEPTION 'Sem permissão para executar desenho mecânico.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.action NOT IN ('accept','reject','edit','add_task','assign_task') THEN RETURN NEW; END IF;
  SELECT area_owner_id INTO v_owner FROM public.work_requests
    WHERE id=NEW.request_id AND kind='mechanical_design';
  IF v_owner IS NULL OR NOT public.is_mechanical_design_manager(NEW.actor_id)
     OR NOT public.has_permission('mechanical_design.manage',NEW.actor_id)
     OR (NEW.actor_id <> v_owner AND NOT public.has_permission('mechanical_design.coordinate',NEW.actor_id)) THEN
    RAISE EXCEPTION 'Sem permissão para gerir este pedido de desenho.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_mechanical_design_reopen() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.action='reopen' THEN
    IF NOT public.is_mechanical_design_manager(NEW.actor_id)
       OR NOT public.has_permission('mechanical_design.manage',NEW.actor_id) THEN
      RAISE EXCEPTION 'A reabertura exige o gestor responsável com permissão de gestão.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.action IN ('start','block','resume','complete') THEN
    IF NOT public.has_permission('mechanical_design.execute',NEW.actor_id) THEN
      RAISE EXCEPTION 'Sem permissão para executar desenho mecânico.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.action='assign' THEN
    IF NOT public.has_permission('mechanical_design.manage',NEW.actor_id) THEN
      RAISE EXCEPTION 'Sem permissão para atribuir desenho mecânico.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_mechanical_design_assignees_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_task_id uuid;
BEGIN
  v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  IF EXISTS(SELECT 1 FROM public.work_request_tasks WHERE task_id=v_task_id)
     AND current_setting('app.mechanical_design_write',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use o pedido de desenho para atribuir esta tarefa.' USING ERRCODE='42501';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM public.work_request_tasks WHERE task_id=NEW.task_id)
     AND NOT public.has_permission('mechanical_design.execute',NEW.user_id) THEN
    RAISE EXCEPTION 'O técnico não tem permissão para executar desenho mecânico.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

-- Replace the former Projects permission fallback with the dedicated
-- cross-owner coordination permission. Function signatures and grants stay intact.
CREATE OR REPLACE FUNCTION public.manage_mechanical_design_request(
  p_id uuid, p_actor_id uuid, p_expected_version integer, p_action text,
  p_assignee_ids uuid[] DEFAULT NULL, p_instructions text DEFAULT NULL,
  p_deliverables text DEFAULT NULL, p_file_identifier text DEFAULT NULL,
  p_file_revision text DEFAULT NULL, p_estimated_days numeric DEFAULT NULL,
  p_planned_start_date date DEFAULT NULL,p_planned_end_date date DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_uid uuid; v_initial_task uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE = 'P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE = '40001'; END IF;
  IF p_action NOT IN ('deliver','file') AND v_actor <> v_request.area_owner_id
     AND NOT public.has_permission('mechanical_design.coordinate', v_actor) THEN
    RAISE EXCEPTION 'Apenas o responsável da área pode gerir o pedido.' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'accept' AND v_request.status = 'submitted' THEN
    IF coalesce(array_length(p_assignee_ids,1),0) = 0 THEN RAISE EXCEPTION 'Indique um desenhador.' USING ERRCODE = '22023'; END IF;
    IF v_request.planned_start_date IS NULL OR v_request.planned_end_date IS NULL THEN
      RAISE EXCEPTION 'Defina o prazo previsto antes de aceitar.' USING ERRCODE='22023';
    END IF;
    IF p_estimated_days IS NULL OR p_estimated_days NOT BETWEEN 0.5 AND 999 OR p_estimated_days * 2 <> trunc(p_estimated_days * 2) THEN
      RAISE EXCEPTION 'Estimativa em meios dias obrigatória.' USING ERRCODE='22023';
    END IF;
    SELECT task_id INTO v_initial_task FROM public.work_request_tasks WHERE request_id=p_id AND is_initial;
    UPDATE public.work_request_tasks SET estimated_days=p_estimated_days WHERE task_id=v_initial_task;
    PERFORM set_config('app.mechanical_design_write','on',true);
    FOREACH v_uid IN ARRAY p_assignee_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=v_uid AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
        RAISE EXCEPTION 'Desenhador inválido.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_initial_task,v_uid) ON CONFLICT DO NOTHING;
    END LOOP;
    UPDATE public.tasks SET version=version+1,updated_by=v_actor,updated_at=now() WHERE id=v_initial_task;
    UPDATE public.work_requests SET status='accepted',version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'reject' AND v_request.status = 'submitted' THEN
    UPDATE public.work_requests SET status='rejected',version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'edit' AND v_request.status IN ('submitted','accepted') THEN
    UPDATE public.mechanical_design_details SET instructions=coalesce(p_instructions,instructions),
      deliverables=coalesce(p_deliverables,deliverables),
      file_identifier=coalesce(p_file_identifier,file_identifier),
      file_revision=coalesce(p_file_revision,file_revision) WHERE request_id=p_id;
    UPDATE public.work_requests SET planned_start_date=coalesce(p_planned_start_date,planned_start_date),
      planned_end_date=coalesce(p_planned_end_date,planned_end_date),version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'file' AND v_request.status = 'accepted' THEN
    IF NOT EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id=wt.task_id
      WHERE wt.request_id=p_id AND ta.user_id=v_actor) THEN
      RAISE EXCEPTION 'Apenas um desenhador atribuído pode registar a entrega.' USING ERRCODE='42501';
    END IF;
    IF btrim(coalesce(p_file_identifier,''))='' OR btrim(coalesce(p_file_revision,''))='' THEN
      RAISE EXCEPTION 'Indique ficheiro e revisão.' USING ERRCODE='22023';
    END IF;
    UPDATE public.mechanical_design_details SET file_identifier=p_file_identifier,file_revision=p_file_revision WHERE request_id=p_id;
    UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'deliver' AND v_request.status = 'accepted' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mechanical_design_details WHERE request_id=p_id
      AND btrim(file_identifier) <> '' AND btrim(file_revision) <> '') THEN
      RAISE EXCEPTION 'Indique ficheiro e revisão antes da entrega.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.tasks t ON t.id=wt.task_id
      WHERE wt.request_id=p_id AND (t.deleted IS TRUE OR t.status_id::text <> '99999999-9999-9999-9999-999999999903')) THEN
      RAISE EXCEPTION 'Conclua todas as tarefas antes da entrega.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id=wt.task_id
      WHERE wt.request_id=p_id AND ta.user_id=v_actor) THEN
      RAISE EXCEPTION 'A entrega deve ser confirmada por um desenhador atribuído.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.work_requests SET status='delivered',delivered_by=v_actor,delivered_at=now(),
      version=version+1,updated_at=now() WHERE id=p_id;
  ELSE
    RAISE EXCEPTION 'Transição inválida.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,p_action,v_actor);
  RETURN p_expected_version+1;
END; $$;

CREATE OR REPLACE FUNCTION public.add_mechanical_design_task(
  p_request_id uuid,p_actor_id uuid,p_expected_version integer,p_title text,
  p_description text DEFAULT '',p_assignee_ids uuid[] DEFAULT ARRAY[]::uuid[],p_estimated_days numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_task uuid; v_uid uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF v_request.status <> 'accepted' OR (v_actor <> v_request.area_owner_id AND NOT public.has_permission('mechanical_design.coordinate',v_actor)) THEN
    RAISE EXCEPTION 'Sem permissão para acrescentar tarefas.' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Título inválido.' USING ERRCODE='22023'; END IF;
  IF p_estimated_days IS NULL OR p_estimated_days NOT BETWEEN 0.5 AND 999 OR p_estimated_days * 2 <> trunc(p_estimated_days * 2) THEN
    RAISE EXCEPTION 'Estimativa em meios dias obrigatória.' USING ERRCODE='22023';
  END IF;
  v_task := gen_random_uuid();
  INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
  VALUES(v_task,v_request.project_id,btrim(p_title),coalesce(p_description,''),
    '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333308'::uuid,1,v_actor,v_actor,FALSE);
  INSERT INTO public.work_request_tasks(request_id,task_id,estimated_days) VALUES(p_request_id,v_task,p_estimated_days);
  PERFORM set_config('app.mechanical_design_write','on',true);
  FOREACH v_uid IN ARRAY coalesce(p_assignee_ids,ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_uid AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
      RAISE EXCEPTION 'Desenhador inválido.' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task,v_uid) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_request_id;
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_request_id,'add_task',v_actor);
  RETURN v_task;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_mechanical_design_task(
  p_request_id uuid,p_task_id uuid,p_actor_id uuid,p_expected_version integer,p_assignee_ids uuid[]
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_uid uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF v_request.status <> 'accepted' OR (v_actor <> v_request.area_owner_id AND NOT public.has_permission('mechanical_design.coordinate',v_actor)) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks WHERE request_id=p_request_id AND task_id=p_task_id) THEN
    RAISE EXCEPTION 'Tarefa não pertence ao pedido.' USING ERRCODE='22023';
  END IF;
  IF coalesce(array_length(p_assignee_ids,1),0)=0 THEN RAISE EXCEPTION 'Indique um desenhador.' USING ERRCODE='22023'; END IF;
  FOREACH v_uid IN ARRAY p_assignee_ids LOOP
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_uid AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
      RAISE EXCEPTION 'Desenhador inválido.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  PERFORM set_config('app.mechanical_design_write','on',true);
  DELETE FROM public.task_assignees WHERE task_id=p_task_id;
  FOREACH v_uid IN ARRAY p_assignee_ids LOOP
    INSERT INTO public.task_assignees(task_id,user_id) VALUES(p_task_id,v_uid) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.tasks SET version=version+1,updated_by=v_actor,updated_at=now() WHERE id=p_task_id;
  UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_request_id;
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_request_id,'assign_task',v_actor);
  INSERT INTO public.work_task_events(task_id,request_id,action,actor_id) VALUES(p_task_id,p_request_id,'assign',v_actor);
  RETURN p_expected_version+1;
END; $$;
