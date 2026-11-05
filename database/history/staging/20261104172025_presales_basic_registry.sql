ALTER TABLE public.presales_details ADD COLUMN client_id uuid REFERENCES public.clients(id);
ALTER TABLE public.presales_details ADD COLUMN request_description text NOT NULL DEFAULT '';
ALTER TABLE public.presales_details ADD COLUMN started_on date;
ALTER TABLE public.presales_details ADD COLUMN completed_on date;
ALTER TABLE public.presales_details ADD COLUMN potential_value numeric(14,2) CHECK (potential_value IS NULL OR potential_value>=0);
ALTER TABLE public.presales_details ADD COLUMN sale_date date;
ALTER TABLE public.presales_details ADD COLUMN sale_value numeric(14,2) CHECK (sale_value IS NULL OR sale_value>=0);
ALTER TABLE public.presales_details ADD CONSTRAINT presales_basic_dates CHECK (
  completed_on IS NULL OR started_on IS NULL OR completed_on>=started_on);
CREATE INDEX presales_details_client_idx ON public.presales_details(client_id) WHERE client_id IS NOT NULL;

CREATE FUNCTION public.presales_registry_mutate(p_id uuid,p_actor_id uuid,p_expected_version integer,p_action text,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; owner uuid; current_row public.work_requests%ROWTYPE; client uuid; priority uuid;
  commercial uuid; manager uuid; next_status text;
BEGIN
 actor:=public.mechanical_design_actor(p_actor_id);
 IF p_action NOT IN ('create','edit') THEN RAISE EXCEPTION 'Ação inválida.' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 2 AND 200 OR
    length(coalesce(p_payload->>'description',''))>10000 THEN RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE='22023'; END IF;
 client:=nullif(p_payload->>'clientId','')::uuid;
 priority:=nullif(p_payload->>'priorityId','')::uuid;
 commercial:=nullif(p_payload->>'commercialManagerId','')::uuid;
 manager:=nullif(p_payload->>'projectManagerId','')::uuid;
 IF client IS NULL OR NOT EXISTS(SELECT 1 FROM public.clients WHERE id=client AND NOT deleted) THEN
   RAISE EXCEPTION 'Cliente inválido.' USING ERRCODE='22023'; END IF;
 IF priority IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_priority WHERE id=priority AND NOT deleted) THEN
   RAISE EXCEPTION 'Prioridade inválida.' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'originCode','') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.presales_origins WHERE code=p_payload->>'originCode' AND active) THEN
   RAISE EXCEPTION 'Origem inválida.' USING ERRCODE='22023'; END IF;
 IF (p_payload->>'completedOn')::date < (p_payload->>'startedOn')::date THEN
   RAISE EXCEPTION 'Data de conclusão anterior ao início.' USING ERRCODE='22023'; END IF;
 IF (p_payload->>'potentialValue')::numeric<0 OR (p_payload->>'saleValue')::numeric<0 THEN
   RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='22023'; END IF;
 next_status:=coalesce(p_payload->>'status','accepted');
 IF next_status NOT IN ('accepted','suspended','won','lost') THEN RAISE EXCEPTION 'Estado inválido.' USING ERRCODE='22023'; END IF;
 IF p_action='create' THEN
   IF NOT public.has_permission('presales.create',actor) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
   owner:=coalesce(manager,actor);
   IF NOT public.has_permission('presales.manage',owner) THEN RAISE EXCEPTION 'Gestor de projeto inválido.' USING ERRCODE='22023'; END IF;
   INSERT INTO public.work_requests(id,kind,title,status,requester_id,area_owner_id)
     VALUES(p_id,'presales',btrim(p_payload->>'title'),next_status,actor,owner);
   INSERT INTO public.presales_details(request_id) VALUES(p_id);
 ELSE
   SELECT * INTO current_row FROM public.work_requests WHERE id=p_id AND kind='presales' AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Processo inexistente.' USING ERRCODE='P0002'; END IF;
   IF current_row.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
   IF NOT public.has_permission('presales.manage',actor) OR
     (current_row.area_owner_id<>actor AND NOT public.has_permission('presales.coordinate',actor)) THEN
     RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
   owner:=coalesce(manager,current_row.area_owner_id);
   IF NOT public.has_permission('presales.manage',owner) THEN RAISE EXCEPTION 'Gestor de projeto inválido.' USING ERRCODE='22023'; END IF;
   UPDATE public.work_requests SET title=btrim(p_payload->>'title'),status=next_status,
     area_owner_id=owner,version=version+1,updated_at=now() WHERE id=p_id;
 END IF;
 UPDATE public.presales_details SET client_id=client,request_description=coalesce(p_payload->>'description',''),
   origin_code=nullif(p_payload->>'originCode',''),priority_id=priority,
   commercial_manager_id=commercial,project_manager_id=manager,
   started_on=nullif(p_payload->>'startedOn','')::date,completed_on=nullif(p_payload->>'completedOn','')::date,
   potential_value=nullif(p_payload->>'potentialValue','')::numeric,
   sale_date=nullif(p_payload->>'saleDate','')::date,sale_value=nullif(p_payload->>'saleValue','')::numeric
   WHERE request_id=p_id;
 RETURN CASE WHEN p_action='create' THEN 1 ELSE p_expected_version+1 END;
END $$;
REVOKE ALL ON FUNCTION public.presales_registry_mutate(uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.presales_registry_mutate(uuid,uuid,integer,text,jsonb) TO service_role;

;
