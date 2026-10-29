-- Mechanical design requests keep their own lifecycle and reuse operational Tasks.
DO $$ BEGIN
  IF to_regclass('public.task_types') IS NOT NULL THEN
    INSERT INTO public.task_types(id,name,scale,sort_order,deleted)
    VALUES('33333333-3333-3333-3333-333333333308','Desenho mecânico',8,8,FALSE)
    ON CONFLICT(id) DO NOTHING;
  END IF;
END $$;
CREATE TABLE public.work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('mechanical_design')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','rejected','delivered')),
  requester_id uuid NOT NULL REFERENCES public.users(id),
  area_owner_id uuid NOT NULL REFERENCES public.users(id),
  project_id uuid REFERENCES public.projects(id),
  planned_start_date date,
  planned_end_date date,
  CONSTRAINT work_request_planned_window CHECK (
    (planned_start_date IS NULL AND planned_end_date IS NULL) OR
    (planned_start_date IS NOT NULL AND planned_end_date IS NOT NULL AND planned_end_date >= planned_start_date)
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  delivered_by uuid REFERENCES public.users(id)
);

CREATE TABLE public.mechanical_design_details (
  request_id uuid PRIMARY KEY REFERENCES public.work_requests(id) ON DELETE RESTRICT,
  instructions text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  file_identifier text NOT NULL DEFAULT '',
  file_revision text NOT NULL DEFAULT ''
);

CREATE TABLE public.work_request_tasks (
  request_id uuid NOT NULL REFERENCES public.work_requests(id) ON DELETE RESTRICT,
  task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE RESTRICT,
  is_initial boolean NOT NULL DEFAULT false,
  estimated_days numeric(6,1) CHECK (estimated_days BETWEEN 0.5 AND 999 AND estimated_days * 2 = trunc(estimated_days * 2)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX work_request_initial_task_unique ON public.work_request_tasks(request_id) WHERE is_initial;
CREATE INDEX work_request_tasks_request_idx ON public.work_request_tasks(request_id);
CREATE INDEX work_requests_owner_status_idx ON public.work_requests(area_owner_id, status, created_at DESC);
CREATE INDEX work_requests_project_idx ON public.work_requests(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE public.work_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL REFERENCES public.work_requests(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('start','block','resume','complete','reopen','assign')),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_task_events_task_idx ON public.work_task_events(task_id, occurred_at DESC);

CREATE TABLE public.work_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.work_requests(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('create','accept','reject','edit','file','deliver','add_task','assign_task')),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_request_events_request_idx ON public.work_request_events(request_id,occurred_at DESC);

ALTER TABLE public.work_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mechanical_design_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_request_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_request_events ENABLE ROW LEVEL SECURITY;

-- New records are read through the authenticated server API. Direct Data API
-- access is denied, including to approved External profiles.
REVOKE ALL ON public.work_requests, public.mechanical_design_details,
  public.work_request_tasks, public.work_task_events, public.work_request_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_requests, public.mechanical_design_details,
  public.work_request_tasks, public.work_task_events, public.work_request_events TO service_role;
GRANT ALL ON public.work_requests, public.mechanical_design_details,
  public.work_request_tasks, public.work_task_events, public.work_request_events TO service_role;

CREATE FUNCTION public.mechanical_design_actor(p_actor_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_profile_id uuid;
BEGIN
  SELECT id INTO v_profile_id FROM public.users
  WHERE id = p_actor_id AND approved IS TRUE AND deleted IS FALSE AND type <> 'External';
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Utilizador não autorizado.' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_profile_id AND (auth_user_id = auth.uid() OR id = auth.uid())
  ) THEN RAISE EXCEPTION 'Identidade inválida.' USING ERRCODE = '42501'; END IF;
  RETURN v_profile_id;
END; $$;
REVOKE ALL ON FUNCTION public.mechanical_design_actor(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_mechanical_design_request(
  p_id uuid, p_actor_id uuid, p_owner_id uuid, p_title text,
  p_instructions text DEFAULT '', p_deliverables text DEFAULT '', p_project_id uuid DEFAULT NULL,
  p_planned_start_date date DEFAULT NULL, p_planned_end_date date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid; v_task_id uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'Título inválido.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_owner_id AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
    RAISE EXCEPTION 'Responsável inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id=p_project_id AND deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Projeto inválido.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.work_requests(id,kind,title,requester_id,area_owner_id,project_id,planned_start_date,planned_end_date)
  VALUES (p_id,'mechanical_design',btrim(p_title),v_actor,p_owner_id,p_project_id,p_planned_start_date,p_planned_end_date);
  INSERT INTO public.mechanical_design_details(request_id,instructions,deliverables)
  VALUES (p_id,coalesce(p_instructions,''),coalesce(p_deliverables,''));
  v_task_id := gen_random_uuid();
  INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
  VALUES (v_task_id,p_project_id,'Desenvolvimento: ' || btrim(p_title),'',
    '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333308'::uuid,1,v_actor,v_actor,FALSE);
  INSERT INTO public.work_request_tasks(request_id,task_id,is_initial) VALUES (p_id,v_task_id,TRUE);
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,'create',v_actor);
  RETURN p_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_mechanical_design_request(uuid,uuid,uuid,text,text,text,uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_mechanical_design_request(uuid,uuid,uuid,text,text,text,uuid,date,date) TO authenticated, service_role;

CREATE FUNCTION public.manage_mechanical_design_request(
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
     AND NOT public.has_permission('projects:write', v_actor) THEN
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
REVOKE ALL ON FUNCTION public.manage_mechanical_design_request(uuid,uuid,integer,text,uuid[],text,text,text,text,numeric,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_mechanical_design_request(uuid,uuid,integer,text,uuid[],text,text,text,text,numeric,date,date) TO authenticated, service_role;

CREATE FUNCTION public.add_mechanical_design_task(
  p_request_id uuid,p_actor_id uuid,p_expected_version integer,p_title text,
  p_description text DEFAULT '',p_assignee_ids uuid[] DEFAULT ARRAY[]::uuid[],p_estimated_days numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_task uuid; v_uid uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF v_request.status <> 'accepted' OR (v_actor <> v_request.area_owner_id AND NOT public.has_permission('projects:write',v_actor)) THEN
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
REVOKE ALL ON FUNCTION public.add_mechanical_design_task(uuid,uuid,integer,text,text,uuid[],numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_mechanical_design_task(uuid,uuid,integer,text,text,uuid[],numeric) TO authenticated, service_role;

CREATE FUNCTION public.mechanical_design_task_action(
  p_request_id uuid,p_task_id uuid,p_actor_id uuid,p_expected_task_version integer,
  p_action text,p_reason text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid; v_request public.work_requests%ROWTYPE; v_task public.tasks%ROWTYPE; v_next uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'accepted' THEN RAISE EXCEPTION 'Pedido não aceite.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks WHERE request_id=p_request_id AND task_id=p_task_id) THEN
    RAISE EXCEPTION 'Tarefa não pertence ao pedido.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_task FROM public.tasks WHERE id=p_task_id AND deleted IS NOT TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_task.version <> p_expected_task_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF p_action='reopen' THEN
    IF v_actor <> v_request.area_owner_id OR length(btrim(coalesce(p_reason,''))) < 5
      OR v_task.status_id::text <> '99999999-9999-9999-9999-999999999903' THEN
      RAISE EXCEPTION 'Reabertura exige responsável, tarefa concluída e justificação.' USING ERRCODE='42501';
    END IF;
    v_next := '99999999-9999-9999-9999-999999999902'::uuid;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.task_assignees WHERE task_id=p_task_id AND user_id=v_actor) THEN
      RAISE EXCEPTION 'Técnico não atribuído.' USING ERRCODE='42501';
    END IF;
    IF p_action='start' AND v_task.status_id::text='99999999-9999-9999-9999-999999999901' THEN
      v_next := '99999999-9999-9999-9999-999999999902'::uuid;
    ELSIF p_action='block' AND v_task.status_id::text='99999999-9999-9999-9999-999999999902' THEN
      v_next := '99999999-9999-9999-9999-999999999904'::uuid;
    ELSIF p_action='resume' AND v_task.status_id::text='99999999-9999-9999-9999-999999999904' THEN
      v_next := '99999999-9999-9999-9999-999999999902'::uuid;
    ELSIF p_action='complete' AND v_task.status_id::text IN
      ('99999999-9999-9999-9999-999999999902','99999999-9999-9999-9999-999999999904') THEN
      v_next := '99999999-9999-9999-9999-999999999903'::uuid;
    ELSE RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
  END IF;
  PERFORM set_config('app.mechanical_design_write','on',true);
  UPDATE public.tasks SET status_id=v_next,version=version+1,updated_by=v_actor,updated_at=now(),
    completed_date=CASE WHEN p_action='complete' THEN current_date WHEN p_action='reopen' THEN NULL ELSE completed_date END
    WHERE id=p_task_id;
  INSERT INTO public.work_task_events(task_id,request_id,action,actor_id,reason)
  VALUES(p_task_id,p_request_id,p_action,v_actor,p_reason);
  RETURN p_expected_task_version+1;
END; $$;
REVOKE ALL ON FUNCTION public.mechanical_design_task_action(uuid,uuid,uuid,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mechanical_design_task_action(uuid,uuid,uuid,integer,text,text) TO authenticated, service_role;

-- Existing generic task RPCs must not bypass the request lifecycle.
CREATE FUNCTION public.guard_mechanical_design_task_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_task_id uuid;
BEGIN
  v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  IF EXISTS (SELECT 1 FROM public.work_request_tasks WHERE task_id=v_task_id)
     AND current_setting('app.mechanical_design_write',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use as ações do pedido de desenho para alterar esta tarefa.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_mechanical_design_task BEFORE UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_mechanical_design_task_write();
REVOKE ALL ON FUNCTION public.guard_mechanical_design_task_write() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_mechanical_design_assignees_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_task_id uuid;
BEGIN
  v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  IF EXISTS (SELECT 1 FROM public.work_request_tasks WHERE task_id=v_task_id)
     AND current_setting('app.mechanical_design_write',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use o pedido de desenho para atribuir esta tarefa.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_mechanical_design_assignees BEFORE INSERT OR UPDATE OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.guard_mechanical_design_assignees_write();
REVOKE ALL ON FUNCTION public.guard_mechanical_design_assignees_write() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.assign_mechanical_design_task(
  p_request_id uuid,p_task_id uuid,p_actor_id uuid,p_expected_version integer,p_assignee_ids uuid[]
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_uid uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF v_request.status <> 'accepted' OR (v_actor <> v_request.area_owner_id AND NOT public.has_permission('projects:write',v_actor)) THEN
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
REVOKE ALL ON FUNCTION public.assign_mechanical_design_task(uuid,uuid,uuid,integer,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_mechanical_design_task(uuid,uuid,uuid,integer,uuid[]) TO authenticated, service_role;
