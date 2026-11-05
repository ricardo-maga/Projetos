-- Assignment is the work authorization; a separate acceptance step is unnecessary.
CREATE SEQUENCE public.presales_process_number_seq;
ALTER TABLE public.presales_details ADD COLUMN process_number bigint UNIQUE DEFAULT nextval('public.presales_process_number_seq');
CREATE TABLE public.presales_origins (
 code text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
 label text NOT NULL UNIQUE,
 sort_order integer NOT NULL,
 active boolean NOT NULL DEFAULT true
);
INSERT INTO public.presales_origins(code,label,sort_order) VALUES
 ('email','Email',1),('phone','Telefone',2),('whatsapp','Whatsapp',3),
 ('in_person','Pessoalmente',4),('other','Outro',5);
ALTER TABLE public.presales_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presales_origins FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.presales_origins TO service_role;
ALTER TABLE public.presales_details ADD COLUMN origin_code text REFERENCES public.presales_origins(code);
ALTER TABLE public.presales_details ADD COLUMN priority_id uuid REFERENCES public.project_priority(id);
ALTER TABLE public.presales_details ADD COLUMN opportunity_sf text NOT NULL DEFAULT '' CHECK (length(opportunity_sf)<=300);
ALTER SEQUENCE public.presales_process_number_seq OWNED BY public.presales_details.process_number;
ALTER TABLE public.presales_details ADD CONSTRAINT presales_process_number_positive CHECK (process_number > 0);
ALTER TABLE public.work_requests ADD COLUMN deleted_at timestamptz;
CREATE INDEX work_requests_active_kind_idx ON public.work_requests(kind,created_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE public.presales_document_templates (
  code text PRIMARY KEY CHECK (code IN ('basic','normal','advanced')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  markdown text NOT NULL CHECK (length(markdown)<=50000),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.presales_document_templates(code,title,markdown) VALUES
 ('basic','Proposta básica',E'# {{titulo}}\n\n{{seccoes}}\n\n{{resumo_material_servicos}}'),
 ('normal','Proposta normal',E'# {{titulo}}\n\n## Enquadramento\n{{requisitos}}\n\n## Solução proposta\n{{seccoes}}\n\n## Materiais e serviços\n{{resumo_material_servicos}}'),
 ('advanced','Proposta avançada',E'# {{titulo}}\n\n## Enquadramento e requisitos\n{{requisitos}}\n\n## Solução técnica\n{{seccoes}}\n\n## Materiais e serviços\n{{resumo_material_servicos}}\n\n## Validação\n{{validacao}}');
ALTER TABLE public.presales_document_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presales_document_templates FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.presales_document_templates TO service_role;
ALTER TABLE public.work_requests DROP CONSTRAINT work_request_planned_window;
ALTER TABLE public.work_requests ADD CONSTRAINT work_request_planned_window CHECK (
  (planned_start_date IS NULL AND planned_end_date IS NULL) OR
  (planned_start_date IS NOT NULL AND planned_end_date IS NOT NULL AND
    (kind <> 'presales' OR planned_end_date > planned_start_date) AND
    (kind = 'presales' OR planned_end_date >= planned_start_date))
);
CREATE FUNCTION public.activate_assigned_work_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE request_row public.work_requests%ROWTYPE;
BEGIN
  IF NOT NEW.is_initial THEN RETURN NEW; END IF;
  SELECT * INTO request_row FROM public.work_requests WHERE id=NEW.request_id FOR UPDATE;
  IF request_row.kind NOT IN ('presales','mechanical_design') THEN RETURN NEW; END IF;
  IF request_row.kind='presales' THEN
    PERFORM set_config('app.presales_write','on',true);
  ELSE
    PERFORM set_config('app.mechanical_design_write','on',true);
  END IF;
  IF public.has_permission(request_row.kind || '.execute',request_row.area_owner_id) THEN
    INSERT INTO public.task_assignees(task_id,user_id) VALUES(NEW.task_id,request_row.area_owner_id)
      ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.work_requests SET status='accepted' WHERE id=NEW.request_id AND status='submitted';
  RETURN NEW;
END $$;

CREATE FUNCTION public.archive_work_request(p_id uuid,p_actor_id uuid,p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE request_row public.work_requests%ROWTYPE; task_row record; permission_prefix text;
BEGIN
  SELECT * INTO request_row FROM public.work_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR request_row.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF request_row.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  permission_prefix:=request_row.kind;
  IF request_row.kind NOT IN ('presales','mechanical_design') OR
     NOT public.has_permission(permission_prefix || '.manage',p_actor_id) OR
     (request_row.area_owner_id<>p_actor_id AND NOT public.has_permission(permission_prefix || '.coordinate',p_actor_id)) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.work_request_tasks wt JOIN public.tasks t ON t.id=wt.task_id
    WHERE wt.request_id=p_id AND t.status_id::text<>'99999999-9999-9999-9999-999999999901') THEN
    RAISE EXCEPTION 'Há tarefas iniciadas; não é possível eliminar o pedido.' USING ERRCODE='22023';
  END IF;
  IF request_row.kind='presales' THEN PERFORM set_config('app.presales_write','on',true);
  ELSE PERFORM set_config('app.mechanical_design_write','on',true); END IF;
  UPDATE public.tasks SET deleted=TRUE,version=version+1,updated_by=p_actor_id,updated_at=now()
    WHERE id IN (SELECT task_id FROM public.work_request_tasks WHERE request_id=p_id);
  UPDATE public.work_requests SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=p_id;
  RETURN p_expected_version+1;
END $$;
REVOKE ALL ON FUNCTION public.archive_work_request(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.archive_work_request(uuid,uuid,integer) TO service_role;
CREATE FUNCTION public.presales_mutate_v2(p_id uuid,p_actor_id uuid,p_expected_version integer,p_action text,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result_version integer; origin_value text; priority_value uuid;
BEGIN
  IF p_action IN ('create','edit') THEN
    origin_value:=nullif(p_payload->>'originCode','');
    priority_value:=nullif(p_payload->>'priorityId','')::uuid;
    IF origin_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.presales_origins WHERE code=origin_value AND active) THEN
      RAISE EXCEPTION 'Origem Presales inválida.' USING ERRCODE='22023';
    END IF;
    IF priority_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_priority WHERE id=priority_value AND NOT deleted) THEN
      RAISE EXCEPTION 'Prioridade inválida.' USING ERRCODE='22023';
    END IF;
    IF length(coalesce(p_payload->>'opportunitySf',''))>300 THEN RAISE EXCEPTION 'Oportunidade SF demasiado longa.' USING ERRCODE='22023'; END IF;
  END IF;
  result_version:=public.presales_mutate(p_id,p_actor_id,p_expected_version,p_action,p_payload);
  IF p_action IN ('create','edit') THEN
    UPDATE public.presales_details SET origin_code=origin_value,priority_id=priority_value,
      opportunity_sf=coalesce(p_payload->>'opportunitySf','') WHERE request_id=p_id;
  END IF;
  RETURN result_version;
END $$;
REVOKE ALL ON FUNCTION public.presales_mutate_v2(uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.presales_mutate_v2(uuid,uuid,integer,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_presales_task_estimate() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER activate_assigned_work_request AFTER INSERT ON public.work_request_tasks
FOR EACH ROW EXECUTE FUNCTION public.activate_assigned_work_request();
REVOKE ALL ON FUNCTION public.activate_assigned_work_request() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE row_record record;
BEGIN
  FOR row_record IN SELECT w.id,w.kind,w.area_owner_id,wt.task_id FROM public.work_requests w
    JOIN public.work_request_tasks wt ON wt.request_id=w.id AND wt.is_initial
    WHERE w.kind IN ('presales','mechanical_design') AND w.status='submitted'
  LOOP
    IF row_record.kind='presales' THEN PERFORM set_config('app.presales_write','on',true);
    ELSE PERFORM set_config('app.mechanical_design_write','on',true); END IF;
    IF public.has_permission(row_record.kind || '.execute',row_record.area_owner_id) THEN
      INSERT INTO public.task_assignees(task_id,user_id) VALUES(row_record.task_id,row_record.area_owner_id)
        ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.work_requests SET status='accepted' WHERE id=row_record.id;
  END LOOP;
END $$;

;
