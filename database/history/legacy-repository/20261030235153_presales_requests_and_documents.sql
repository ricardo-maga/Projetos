-- Presales owns its process and document; Tasks remain the execution source.
ALTER TABLE public.work_requests DROP CONSTRAINT IF EXISTS work_requests_kind_check;
ALTER TABLE public.work_requests ADD CONSTRAINT work_requests_kind_check
  CHECK (kind IN ('mechanical_design','presales'));
ALTER TABLE public.work_requests DROP CONSTRAINT IF EXISTS work_requests_status_check;
ALTER TABLE public.work_requests ADD CONSTRAINT work_requests_status_check
  CHECK (status IN ('submitted','accepted','rejected','delivered','suspended','won','lost'));
ALTER TABLE public.work_request_events DROP CONSTRAINT IF EXISTS work_request_events_action_check;
ALTER TABLE public.work_request_events ADD CONSTRAINT work_request_events_action_check
  CHECK (action IN ('create','accept','reject','edit','file','deliver','add_task','assign_task',
    'suspend','resume','won','lost','save_document','save_item','delete_item','publish','new_revision','link_project'));

INSERT INTO public.permissions(code,module,action,description,is_system,is_active) VALUES
 ('presales.read','presales','read','Consultar pedidos Presales',TRUE,TRUE),
 ('presales.create','presales','create','Criar pedidos Presales',TRUE,TRUE),
 ('presales.manage','presales','manage','Gerir pedidos, tarefas e propostas Presales',TRUE,TRUE),
 ('presales.execute','presales','execute','Executar tarefas Presales',TRUE,TRUE),
 ('presales.coordinate','presales','coordinate','Resolver pedidos Presales de outros responsáveis',TRUE,TRUE)
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_active AND p.code IN ('presales.read','presales.create','presales.execute')
  AND r.code IN ('PROJECT_MANAGER','SOLUTIONS','COMMERCIAL','TECHNICIAN','ADMIN')
ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_active AND p.code IN ('presales.manage','presales.coordinate')
  AND r.code IN ('PROJECT_MANAGER','SOLUTIONS','ADMIN')
ON CONFLICT(role_id,permission_id) DO NOTHING;

DO $$ BEGIN
  IF to_regclass('public.task_types') IS NOT NULL THEN
    INSERT INTO public.task_types(id,name,scale,sort_order,deleted)
    VALUES ('33333333-3333-3333-3333-333333333309','Presales',9,9,FALSE)
    ON CONFLICT(id) DO NOTHING;
  END IF;
END $$;

CREATE TABLE public.presales_details (
 request_id uuid PRIMARY KEY REFERENCES public.work_requests(id) ON DELETE RESTRICT,
 technical_requirements text NOT NULL DEFAULT '',
 technical_outcome text NOT NULL DEFAULT '',
 commercial_manager_id uuid REFERENCES public.users(id),
 project_manager_id uuid REFERENCES public.users(id),
 execution_project_id uuid UNIQUE REFERENCES public.projects(id),
 document_draft jsonb NOT NULL DEFAULT '{"schemaVersion":1,"blocks":[]}'::jsonb,
 document_version integer NOT NULL DEFAULT 1 CHECK (document_version > 0),
 document_locked boolean NOT NULL DEFAULT false,
 CONSTRAINT presales_document_shape CHECK (jsonb_typeof(document_draft)='object'
   AND document_draft->>'schemaVersion'='1' AND jsonb_typeof(document_draft->'blocks')='array')
);
CREATE TABLE public.presales_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.presales_details(request_id) ON DELETE RESTRICT,
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
 unit text NOT NULL DEFAULT 'un',
 quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
 unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
 group_label text NOT NULL DEFAULT '',
 sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX presales_items_request_order ON public.presales_items(request_id,sort_order,id);
CREATE TABLE public.presales_document_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.presales_details(request_id) ON DELETE RESTRICT,
 revision_number integer NOT NULL CHECK (revision_number > 0),
 document_snapshot jsonb NOT NULL,
 items_snapshot jsonb NOT NULL,
 contacts_snapshot jsonb NOT NULL,
 published_by uuid NOT NULL REFERENCES public.users(id),
 published_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,revision_number)
);
CREATE FUNCTION public.guard_presales_revision_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 RAISE EXCEPTION 'A revisão publicada é imutável.' USING ERRCODE='42501';
END $$;
CREATE TRIGGER guard_presales_revision_immutable BEFORE UPDATE OR DELETE ON public.presales_document_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_presales_revision_immutable();
ALTER TABLE public.presales_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presales_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presales_document_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presales_details,public.presales_items,public.presales_document_revisions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.presales_details,public.presales_items,public.presales_document_revisions TO service_role;

-- Lock Presales Tasks against the generic task writers; mutation is through the
-- transaction below, which also records the request and task events.
CREATE FUNCTION public.guard_presales_task_write() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='presales')
   AND current_setting('app.presales_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use as ações Presales para alterar esta tarefa.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_presales_task_write BEFORE UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_presales_task_write();
CREATE FUNCTION public.guard_presales_assignees_write() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
 IF EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='presales')
   AND current_setting('app.presales_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use o pedido Presales para atribuir esta tarefa.' USING ERRCODE='42501';
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND EXISTS (
   SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=NEW.task_id AND w.kind='presales')
   AND NOT public.has_permission('presales.execute',NEW.user_id) THEN
   RAISE EXCEPTION 'Utilizador sem permissão de execução Presales.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_presales_assignees_write BEFORE INSERT OR UPDATE OR DELETE ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.guard_presales_assignees_write();
REVOKE ALL ON FUNCTION public.guard_presales_task_write(),public.guard_presales_assignees_write(),public.guard_presales_revision_immutable()
FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.presales_mutate(p_id uuid,p_actor_id uuid,p_expected_version integer,
 p_action text,p_payload jsonb DEFAULT '{}'::jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w public.work_requests%ROWTYPE; actor uuid; v_task_id uuid; task_row public.tasks%ROWTYPE;
 owner uuid; member uuid; members uuid[]; item_id uuid; next_status uuid; next_revision integer;
 document jsonb; block jsonb; referenced_id text; contact_snapshot jsonb;
BEGIN
 actor := public.mechanical_design_actor(p_actor_id);
 IF p_action='create' THEN
   IF NOT public.has_permission('presales.create',actor) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
   IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 2 AND 200 THEN
     RAISE EXCEPTION 'Nome inválido.' USING ERRCODE='22023'; END IF;
   owner := (p_payload->>'ownerId')::uuid;
   IF NOT public.has_permission('presales.manage',owner) OR NOT EXISTS (
     SELECT 1 FROM public.users WHERE id=owner AND approved AND NOT deleted AND type<>'External') THEN
     RAISE EXCEPTION 'Responsável Presales inválido.' USING ERRCODE='22023'; END IF;
   IF p_payload->>'plannedStartDate' IS NULL OR p_payload->>'plannedEndDate' IS NULL OR
      (p_payload->>'plannedEndDate')::date < (p_payload->>'plannedStartDate')::date THEN
     RAISE EXCEPTION 'Prazo inválido.' USING ERRCODE='22023'; END IF;
   INSERT INTO public.work_requests(id,kind,title,requester_id,area_owner_id,planned_start_date,planned_end_date)
   VALUES(p_id,'presales',btrim(p_payload->>'title'),actor,owner,
     (p_payload->>'plannedStartDate')::date,(p_payload->>'plannedEndDate')::date);
   INSERT INTO public.presales_details(request_id,technical_requirements,technical_outcome,commercial_manager_id,project_manager_id)
   VALUES(p_id,coalesce(p_payload->>'requirements',''),coalesce(p_payload->>'outcome',''),
     nullif(p_payload->>'commercialManagerId','')::uuid,nullif(p_payload->>'projectManagerId','')::uuid);
   v_task_id := gen_random_uuid();
   INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
   VALUES(v_task_id,NULL,'Preparação técnica: ' || btrim(p_payload->>'title'),coalesce(p_payload->>'requirements',''),
     '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333309'::uuid,1,actor,actor,FALSE);
   INSERT INTO public.work_request_tasks(request_id,task_id,is_initial) VALUES(p_id,v_task_id,TRUE);
   INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,'create',actor);
   RETURN 1;
 END IF;
 SELECT * INTO w FROM public.work_requests WHERE id=p_id AND kind='presales' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Presales inexistente.' USING ERRCODE='P0002'; END IF;
 IF w.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
 IF p_action='task_action' THEN
   v_task_id := (p_payload->>'taskId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks wt WHERE wt.request_id=p_id AND wt.task_id=v_task_id) THEN
     RAISE EXCEPTION 'Tarefa inválida.' USING ERRCODE='22023'; END IF;
   SELECT * INTO task_row FROM public.tasks WHERE id=v_task_id AND NOT deleted FOR UPDATE;
   IF task_row.version<>(p_payload->>'taskVersion')::integer OR w.status<>'accepted' THEN
     RAISE EXCEPTION 'Tarefa alterada ou pedido não aceite.' USING ERRCODE='40001'; END IF;
   IF p_payload->>'taskAction'='reopen' THEN
     IF actor<>w.area_owner_id OR NOT public.has_permission('presales.manage',actor)
       OR length(btrim(coalesce(p_payload->>'reason','')))<5
       OR task_row.status_id::text<>'99999999-9999-9999-9999-999999999903' THEN
       RAISE EXCEPTION 'Reabertura inválida.' USING ERRCODE='42501'; END IF;
     next_status := '99999999-9999-9999-9999-999999999902'::uuid;
   ELSE
     IF NOT public.has_permission('presales.execute',actor) OR NOT EXISTS(
       SELECT 1 FROM public.task_assignees ta WHERE ta.task_id=v_task_id AND ta.user_id=actor) THEN
       RAISE EXCEPTION 'Técnico não atribuído.' USING ERRCODE='42501'; END IF;
     CASE p_payload->>'taskAction'
       WHEN 'start' THEN IF task_row.status_id::text='99999999-9999-9999-9999-999999999901' THEN next_status:='99999999-9999-9999-9999-999999999902'::uuid; END IF;
       WHEN 'block' THEN IF task_row.status_id::text='99999999-9999-9999-9999-999999999902' THEN next_status:='99999999-9999-9999-9999-999999999904'::uuid; END IF;
       WHEN 'resume' THEN IF task_row.status_id::text='99999999-9999-9999-9999-999999999904' THEN next_status:='99999999-9999-9999-9999-999999999902'::uuid; END IF;
       WHEN 'complete' THEN IF task_row.status_id::text IN ('99999999-9999-9999-9999-999999999902','99999999-9999-9999-9999-999999999904') THEN next_status:='99999999-9999-9999-9999-999999999903'::uuid; END IF;
     END CASE;
     IF next_status IS NULL THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
   END IF;
   PERFORM set_config('app.presales_write','on',true);
   UPDATE public.tasks SET status_id=next_status,version=version+1,updated_by=actor,updated_at=now(),
     completed_date=CASE WHEN p_payload->>'taskAction'='complete' THEN current_date
       WHEN p_payload->>'taskAction'='reopen' THEN NULL ELSE completed_date END WHERE id=v_task_id;
   INSERT INTO public.work_task_events(task_id,request_id,action,actor_id,reason)
   VALUES(v_task_id,p_id,p_payload->>'taskAction',actor,p_payload->>'reason');
 ELSE
   IF NOT public.has_permission('presales.manage',actor) OR
      (actor<>w.area_owner_id AND NOT public.has_permission('presales.coordinate',actor)) THEN
     RAISE EXCEPTION 'Sem permissão para gerir Presales.' USING ERRCODE='42501'; END IF;
   CASE p_action
     WHEN 'accept' THEN
       IF w.status<>'submitted' THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       members := ARRAY(SELECT jsonb_array_elements_text(p_payload->'assigneeIds')::uuid);
       IF coalesce(array_length(members,1),0)=0 OR (p_payload->>'estimatedDays')::numeric NOT BETWEEN 0.5 AND 999
         OR (p_payload->>'estimatedDays')::numeric*2<>trunc((p_payload->>'estimatedDays')::numeric*2) THEN
         RAISE EXCEPTION 'Atribuição e estimativa obrigatórias.' USING ERRCODE='22023'; END IF;
       SELECT wt.task_id INTO v_task_id FROM public.work_request_tasks wt WHERE wt.request_id=p_id AND wt.is_initial;
       UPDATE public.work_request_tasks SET estimated_days=(p_payload->>'estimatedDays')::numeric WHERE task_id=v_task_id;
       PERFORM set_config('app.presales_write','on',true);
       FOREACH member IN ARRAY members LOOP
         IF NOT public.has_permission('presales.execute',member) OR NOT EXISTS(
           SELECT 1 FROM public.users WHERE id=member AND approved AND NOT deleted AND type<>'External') THEN
           RAISE EXCEPTION 'Executor inválido.' USING ERRCODE='22023'; END IF;
         INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task_id,member) ON CONFLICT DO NOTHING;
       END LOOP;
       UPDATE public.tasks SET version=version+1,updated_by=actor,updated_at=now() WHERE id=v_task_id;
       UPDATE public.work_requests SET status='accepted' WHERE id=p_id;
     WHEN 'edit' THEN
       IF w.status NOT IN ('submitted','accepted','suspended') THEN RAISE EXCEPTION 'Pedido fechado.' USING ERRCODE='22023'; END IF;
       IF (p_payload->>'plannedEndDate')::date < (p_payload->>'plannedStartDate')::date THEN
         RAISE EXCEPTION 'Prazo inválido.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET title=btrim(p_payload->>'title'),
         planned_start_date=(p_payload->>'plannedStartDate')::date,planned_end_date=(p_payload->>'plannedEndDate')::date WHERE id=p_id;
       UPDATE public.presales_details SET technical_requirements=coalesce(p_payload->>'requirements',''),
         technical_outcome=coalesce(p_payload->>'outcome',''),
         commercial_manager_id=nullif(p_payload->>'commercialManagerId','')::uuid,
         project_manager_id=nullif(p_payload->>'projectManagerId','')::uuid WHERE request_id=p_id;
     WHEN 'suspend' THEN
       IF w.status<>'accepted' THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status='suspended' WHERE id=p_id;
     WHEN 'resume' THEN
       IF w.status<>'suspended' THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status='accepted' WHERE id=p_id;
     WHEN 'won' THEN
       IF w.status NOT IN ('accepted','suspended') THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status=p_action,delivered_by=actor,delivered_at=now() WHERE id=p_id;
     WHEN 'lost' THEN
       IF w.status NOT IN ('accepted','suspended') THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status=p_action,delivered_by=actor,delivered_at=now() WHERE id=p_id;
     WHEN 'add_task' THEN
       IF w.status<>'accepted' THEN RAISE EXCEPTION 'Pedido não aceite.' USING ERRCODE='22023'; END IF;
       v_task_id := gen_random_uuid();
       INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
       VALUES(v_task_id,NULL,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),
         '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333309'::uuid,1,actor,actor,FALSE);
       INSERT INTO public.work_request_tasks(request_id,task_id,estimated_days)
       VALUES(p_id,v_task_id,(p_payload->>'estimatedDays')::numeric);
       members := ARRAY(SELECT jsonb_array_elements_text(p_payload->'assigneeIds')::uuid);
       IF coalesce(array_length(members,1),0)=0 THEN RAISE EXCEPTION 'Executor obrigatório.' USING ERRCODE='22023'; END IF;
       PERFORM set_config('app.presales_write','on',true);
       FOREACH member IN ARRAY members LOOP
         IF NOT public.has_permission('presales.execute',member) THEN RAISE EXCEPTION 'Executor inválido.' USING ERRCODE='22023'; END IF;
         INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task_id,member) ON CONFLICT DO NOTHING;
       END LOOP;
     WHEN 'assign_task' THEN
       IF w.status<>'accepted' THEN RAISE EXCEPTION 'Pedido não aceite.' USING ERRCODE='22023'; END IF;
       v_task_id := (p_payload->>'taskId')::uuid;
       IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks wt WHERE wt.request_id=p_id AND wt.task_id=v_task_id) THEN
         RAISE EXCEPTION 'Tarefa inválida.' USING ERRCODE='22023'; END IF;
       members := ARRAY(SELECT jsonb_array_elements_text(p_payload->'assigneeIds')::uuid);
       IF coalesce(array_length(members,1),0)=0 THEN RAISE EXCEPTION 'Executor obrigatório.' USING ERRCODE='22023'; END IF;
       PERFORM set_config('app.presales_write','on',true);
       DELETE FROM public.task_assignees WHERE task_id=v_task_id;
       FOREACH member IN ARRAY members LOOP
         IF NOT public.has_permission('presales.execute',member) THEN RAISE EXCEPTION 'Executor inválido.' USING ERRCODE='22023'; END IF;
         INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task_id,member) ON CONFLICT DO NOTHING;
       END LOOP;
       UPDATE public.tasks SET version=version+1,updated_by=actor,updated_at=now() WHERE id=v_task_id;
     WHEN 'save_document' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'Crie uma nova revisão antes de alterar o documento.' USING ERRCODE='22023'; END IF;
       document := p_payload->'document';
       IF jsonb_typeof(document)<>'object' OR document->>'schemaVersion'<>'1'
         OR jsonb_typeof(document->'blocks')<>'array' OR jsonb_array_length(document->'blocks')>100
         OR length(document::text)>250000 THEN RAISE EXCEPTION 'Documento inválido.' USING ERRCODE='22023'; END IF;
       UPDATE public.presales_details SET document_draft=document,document_version=document_version+1 WHERE request_id=p_id;
     WHEN 'save_item' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'Crie uma nova revisão antes de alterar as linhas.' USING ERRCODE='22023'; END IF;
       item_id := coalesce((p_payload->>'id')::uuid,gen_random_uuid());
       IF EXISTS(SELECT 1 FROM public.presales_items WHERE id=item_id AND request_id<>p_id) THEN
         RAISE EXCEPTION 'Linha pertence a outro pedido.' USING ERRCODE='42501'; END IF;
       IF (p_payload->>'quantity')::numeric<=0 OR (p_payload->>'unitPrice')::numeric<0 THEN
         RAISE EXCEPTION 'Linha inválida.' USING ERRCODE='22023'; END IF;
       INSERT INTO public.presales_items(id,request_id,title,unit,quantity,unit_price,group_label,sort_order)
       VALUES(item_id,p_id,btrim(p_payload->>'title'),coalesce(p_payload->>'unit','un'),
         (p_payload->>'quantity')::numeric,(p_payload->>'unitPrice')::numeric,
         coalesce(p_payload->>'groupLabel',''),coalesce((p_payload->>'sortOrder')::integer,0))
       ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,unit=EXCLUDED.unit,quantity=EXCLUDED.quantity,
         unit_price=EXCLUDED.unit_price,group_label=EXCLUDED.group_label,sort_order=EXCLUDED.sort_order
       WHERE public.presales_items.request_id=p_id;
     WHEN 'delete_item' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'Crie uma nova revisão antes de alterar as linhas.' USING ERRCODE='22023'; END IF;
       DELETE FROM public.presales_items WHERE id=(p_payload->>'id')::uuid AND request_id=p_id;
       IF NOT FOUND THEN RAISE EXCEPTION 'Linha inexistente.' USING ERRCODE='P0002'; END IF;
     WHEN 'publish' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'A revisão atual já foi publicada.' USING ERRCODE='22023'; END IF;
       SELECT document_draft INTO document FROM public.presales_details WHERE request_id=p_id;
       FOR block IN SELECT value FROM jsonb_array_elements(document->'blocks') LOOP
         IF block->>'type'='item_summary' THEN
           FOR referenced_id IN SELECT jsonb_array_elements_text(block->'itemIds') LOOP
             IF NOT EXISTS(SELECT 1 FROM public.presales_items WHERE id=referenced_id::uuid AND request_id=p_id) THEN
               RAISE EXCEPTION 'O documento refere uma linha inexistente.' USING ERRCODE='22023'; END IF;
           END LOOP;
         END IF;
       END LOOP;
       SELECT coalesce(max(revision_number),0)+1 INTO next_revision
       FROM public.presales_document_revisions WHERE request_id=p_id;
       SELECT jsonb_build_object('commercialManager',jsonb_build_object('id',c.id,'name',c.name,'email',c.email),
         'projectManager',jsonb_build_object('id',m.id,'name',m.name,'email',m.email)) INTO contact_snapshot
       FROM public.presales_details d LEFT JOIN public.users c ON c.id=d.commercial_manager_id
       LEFT JOIN public.users m ON m.id=d.project_manager_id WHERE d.request_id=p_id;
       INSERT INTO public.presales_document_revisions(request_id,revision_number,document_snapshot,items_snapshot,contacts_snapshot,published_by)
       SELECT p_id,next_revision,document,
         coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'unit',i.unit,
           'quantity',i.quantity,'unitPrice',i.unit_price,'groupLabel',i.group_label,'sortOrder',i.sort_order,
           'total',round(i.quantity*i.unit_price,2)) ORDER BY i.sort_order,i.id)
           FROM public.presales_items i WHERE i.request_id=p_id),'[]'::jsonb),contact_snapshot,actor;
       UPDATE public.presales_details SET document_locked=TRUE WHERE request_id=p_id;
     WHEN 'new_revision' THEN
       IF NOT (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'A revisão atual ainda está em edição.' USING ERRCODE='22023'; END IF;
       SELECT document_snapshot INTO document FROM public.presales_document_revisions
         WHERE request_id=p_id ORDER BY revision_number DESC LIMIT 1;
       UPDATE public.presales_details SET document_draft=document,document_locked=FALSE,
         document_version=document_version+1 WHERE request_id=p_id;
     WHEN 'link_project' THEN
       IF w.status<>'won' OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=(p_payload->>'projectId')::uuid AND NOT deleted) THEN
         RAISE EXCEPTION 'Projeto de execução inválido.' USING ERRCODE='22023'; END IF;
       UPDATE public.presales_details SET execution_project_id=(p_payload->>'projectId')::uuid WHERE request_id=p_id;
     ELSE RAISE EXCEPTION 'Operação inválida.' USING ERRCODE='22023';
   END CASE;
   INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,p_action,actor);
 END IF;
 UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_id;
 RETURN p_expected_version+1;
END $$;
REVOKE ALL ON FUNCTION public.presales_mutate(uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.presales_mutate(uuid,uuid,integer,text,jsonb) TO service_role;

-- Generic task notifications and automations already find work_request_tasks.
-- Route Presales recipients to the correct component instead of mechanical design.
CREATE OR REPLACE FUNCTION notification_internal.task_assignment_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.notification_settings%ROWTYPE; t public.tasks%ROWTYPE; w public.work_requests%ROWTYPE; destination text;
BEGIN
 SELECT * INTO s FROM public.notification_settings WHERE type='task_allocation' AND enabled;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO t FROM public.tasks WHERE id=NEW.task_id AND NOT deleted;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT wr.* INTO w FROM public.work_request_tasks wt JOIN public.work_requests wr ON wr.id=wt.request_id WHERE wt.task_id=NEW.task_id;
 destination := CASE WHEN w.kind='presales' THEN '/projects?tab=presales&request='||w.id::text
   WHEN w.kind='mechanical_design' THEN '/projects?tab=mechanical-design&request='||w.id::text
   WHEN t.project_id IS NOT NULL THEN '/projects?project='||t.project_id::text END;
 IF destination IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(user_id,title,message,link_url,event_key)
 SELECT r.user_id,'Tarefa atribuída: '||t.task_title,'Foi atribuída a tarefa "'||t.task_title||'".',destination,
   'task_allocation:'||NEW.task_id||':'||NEW.user_id||':'||txid_current()||':'||r.user_id
 FROM notification_internal.recipients(s.target_group,t.project_id,NEW.task_id) r
 WHERE s.target_group<>'allocated' OR r.user_id=NEW.user_id
 ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION notification_internal.run_mechanical_design_task_rules(
 p_task_id uuid,p_event text,p_from_status uuid,p_to_status uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w public.work_requests%ROWTYPE; rule_row public.automation_rules%ROWTYPE; action_row jsonb;
 action_count integer; destination text;
BEGIN
 SELECT wr.* INTO w FROM public.work_request_tasks wt JOIN public.work_requests wr ON wr.id=wt.request_id
 JOIN public.tasks t ON t.id=wt.task_id WHERE wt.task_id=p_task_id AND t.project_id IS NULL AND NOT t.deleted;
 IF NOT FOUND THEN RETURN; END IF;
 destination := '/projects?tab='||CASE w.kind WHEN 'presales' THEN 'presales' ELSE 'mechanical-design' END||'&request='||w.id;
 FOR rule_row IN SELECT * FROM public.automation_rules WHERE enabled AND NOT deleted AND trigger_type=p_event
   AND (p_event='task_created' OR nullif(trigger_condition->>'toStatusId','') IS NULL OR trigger_condition->>'toStatusId'=p_to_status::text)
   AND (p_event='task_created' OR nullif(trigger_condition->>'fromStatusId','') IS NULL OR trigger_condition->>'fromStatusId'=p_from_status::text)
   ORDER BY created_at,id LOOP
   action_count:=0;
   FOR action_row IN SELECT value FROM jsonb_array_elements(rule_row.actions) LOOP
     IF action_row->>'type'='send_notification' THEN
       INSERT INTO public.notifications(user_id,title,message,link_url)
       SELECT u.id,action_row->'params'->>'notificationTitle',
         coalesce(action_row->'params'->>'notificationMessage',''),destination
       FROM public.users u WHERE NOT u.deleted;
       action_count:=action_count+1;
     END IF;
   END LOOP;
   INSERT INTO public.automation_executions(rule_id,event_type,entity_id,action_count)
   VALUES(rule_row.id,p_event,p_task_id,action_count);
 END LOOP;
END $$;

CREATE FUNCTION notification_internal.generate_presales_due(p_today date DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE added integer;
BEGIN
 INSERT INTO public.notifications(user_id,title,message,link_url,event_key)
 SELECT r.user_id,CASE WHEN w.planned_end_date<p_today THEN 'Presales em atraso: '
   WHEN w.planned_end_date=p_today THEN 'Presales vence hoje: ' ELSE 'Prazo Presales: ' END||w.title,
   'Data limite: '||to_char(w.planned_end_date,'DD/MM/YYYY'),'/projects?tab=presales&request='||w.id,
   'task_due_date:presales:'||w.id||':'||w.planned_end_date||':'||
   CASE WHEN w.planned_end_date<p_today THEN 'overdue' WHEN w.planned_end_date=p_today THEN 'today' ELSE 'before' END||':'||r.user_id
 FROM public.work_requests w JOIN public.notification_settings s ON s.type='task_due_date' AND s.enabled
 CROSS JOIN LATERAL (
   SELECT u.id AS user_id FROM public.users u WHERE u.approved AND NOT u.deleted AND u.type<>'External'
    AND (s.target_group='all' OR (s.target_group='managers' AND u.id=w.area_owner_id)
      OR (s.target_group='allocated' AND EXISTS(SELECT 1 FROM public.work_request_tasks wt
        JOIN public.task_assignees ta ON ta.task_id=wt.task_id WHERE wt.request_id=w.id AND ta.user_id=u.id)))
 ) r
 WHERE w.kind='presales' AND w.status IN ('submitted','accepted','suspended')
   AND (w.planned_end_date=p_today OR w.planned_end_date=p_today-1
     OR (s.days_before>0 AND w.planned_end_date=p_today+s.days_before))
 ON CONFLICT(event_key) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 RETURN added;
END $$;
REVOKE ALL ON FUNCTION notification_internal.generate_presales_due(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION notification_internal.generate_presales_due(date) TO service_role;
SELECT cron.schedule('presales-notification-due-daily','0 7 * * *','SELECT notification_internal.generate_presales_due();');

-- Existing design triggers were originally written for the only request kind.
-- Scope them before Presales starts writing through the shared link tables.
CREATE OR REPLACE FUNCTION public.guard_mechanical_design_task_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF EXISTS(SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='mechanical_design')
   AND current_setting('app.mechanical_design_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use as ações do pedido de desenho para alterar esta tarefa.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_mechanical_design_assignees_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
 IF EXISTS(SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='mechanical_design')
   AND current_setting('app.mechanical_design_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use o pedido de desenho para atribuir esta tarefa.' USING ERRCODE='42501'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND EXISTS(
   SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=NEW.task_id AND w.kind='mechanical_design')
   AND NOT public.has_permission('mechanical_design.execute',NEW.user_id) THEN
   RAISE EXCEPTION 'O técnico não tem permissão para executar desenho mecânico.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_mechanical_design_manager_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
 SELECT area_owner_id INTO v_owner FROM public.work_requests WHERE id=NEW.request_id AND kind='mechanical_design';
 IF v_owner IS NULL THEN RETURN NEW; END IF;
 IF NEW.action IN ('file','deliver') THEN
   IF NOT public.has_permission('mechanical_design.execute',NEW.actor_id) THEN
     RAISE EXCEPTION 'Sem permissão para executar desenho mecânico.' USING ERRCODE='42501'; END IF;
   RETURN NEW;
 END IF;
 IF NEW.action NOT IN ('accept','reject','edit','add_task','assign_task') THEN RETURN NEW; END IF;
 IF NOT public.is_mechanical_design_manager(NEW.actor_id)
   OR NOT public.has_permission('mechanical_design.manage',NEW.actor_id)
   OR (NEW.actor_id<>v_owner AND NOT public.has_permission('mechanical_design.coordinate',NEW.actor_id)) THEN
   RAISE EXCEPTION 'Sem permissão para gerir este pedido de desenho.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_mechanical_design_reopen() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id=NEW.request_id AND kind='mechanical_design') THEN RETURN NEW; END IF;
 IF NEW.action='reopen' THEN
   IF NOT public.is_mechanical_design_manager(NEW.actor_id)
      OR NOT public.has_permission('mechanical_design.manage',NEW.actor_id) THEN
     RAISE EXCEPTION 'A reabertura exige o gestor responsável com permissão de gestão.' USING ERRCODE='42501'; END IF;
 ELSIF NEW.action IN ('start','block','resume','complete') THEN
   IF NOT public.has_permission('mechanical_design.execute',NEW.actor_id) THEN
     RAISE EXCEPTION 'Sem permissão para executar desenho mecânico.' USING ERRCODE='42501'; END IF;
 ELSIF NEW.action='assign' THEN
   IF NOT public.has_permission('mechanical_design.manage',NEW.actor_id) THEN
     RAISE EXCEPTION 'Sem permissão para atribuir desenho mecânico.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
