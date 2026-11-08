-- Reusable client facilities; client.location remains only indicative text.
CREATE TABLE public.client_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  address text,
  region text,
  deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,name)
);
CREATE INDEX client_sites_active_client_idx ON public.client_sites(client_id) WHERE NOT deleted;
ALTER TABLE public.client_sites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_sites FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.client_sites TO service_role;

ALTER TABLE public.projects ADD COLUMN default_site_id uuid REFERENCES public.client_sites(id);
ALTER TABLE public.tasks ADD COLUMN execution_location_kind text NOT NULL DEFAULT 'inherit'
  CHECK (execution_location_kind IN ('inherit','site','company','remote','unknown'));
ALTER TABLE public.tasks ADD COLUMN execution_site_id uuid REFERENCES public.client_sites(id);
ALTER TABLE public.tasks ADD CONSTRAINT task_site_mode_check CHECK
  ((execution_location_kind='site' AND execution_site_id IS NOT NULL) OR
   (execution_location_kind<>'site' AND execution_site_id IS NULL));
CREATE INDEX tasks_execution_site_idx ON public.tasks(execution_site_id) WHERE execution_site_id IS NOT NULL;

CREATE FUNCTION public.validate_client_site() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id=NEW.client_id AND NOT deleted) THEN
    RAISE EXCEPTION 'Cliente inexistente ou eliminado.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'A instalação não pode mudar de cliente.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_client_site_before_write BEFORE INSERT OR UPDATE OF client_id
ON public.client_sites FOR EACH ROW EXECUTE FUNCTION public.validate_client_site();

CREATE FUNCTION public.validate_project_site() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.default_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_sites s WHERE s.id=NEW.default_site_id
      AND s.client_id=NEW.client_id AND NOT s.deleted
  ) THEN RAISE EXCEPTION 'Instalação predefinida não pertence ao cliente ativo.' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id AND EXISTS (
      SELECT 1 FROM public.tasks t JOIN public.client_sites s ON s.id=t.execution_site_id
      WHERE t.project_id=NEW.id AND s.client_id IS DISTINCT FROM NEW.client_id
    ) THEN RAISE EXCEPTION 'As instalações das tarefas não pertencem ao novo cliente.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_project_site_before_write BEFORE INSERT OR UPDATE OF client_id,default_site_id
ON public.projects FOR EACH ROW EXECUTE FUNCTION public.validate_project_site();

CREATE FUNCTION public.validate_task_site() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.execution_location_kind='site' AND NOT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.client_sites s ON s.client_id=p.client_id
    WHERE p.id=NEW.project_id AND NOT p.deleted AND s.id=NEW.execution_site_id AND NOT s.deleted
  ) THEN RAISE EXCEPTION 'A instalação da tarefa não pertence ao cliente do projeto.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_task_site_before_write BEFORE INSERT OR UPDATE OF project_id,execution_location_kind,execution_site_id
ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.validate_task_site();
REVOKE ALL ON FUNCTION public.validate_client_site(),public.validate_project_site(),
  public.validate_task_site() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.set_task_execution_location(
  p_task_id uuid,p_expected_version integer,p_actor_id uuid,p_kind text,p_site_id uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row public.tasks%ROWTYPE;
BEGIN
  IF NOT public.has_permission('planning_center.write',p_actor_id)
    OR NOT public.has_permission('tasks:write',p_actor_id) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  SELECT * INTO row FROM public.tasks WHERE id=p_task_id AND NOT deleted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa inexistente.' USING ERRCODE='P0002'; END IF;
  IF row.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.work_request_tasks WHERE task_id=p_task_id) THEN
    RAISE EXCEPTION 'Use o fluxo do pedido especial.' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('inherit','site','company','remote','unknown') OR
     (p_kind='site') IS DISTINCT FROM (p_site_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Local inválido.' USING ERRCODE='22023'; END IF;
  UPDATE public.tasks SET execution_location_kind=p_kind,execution_site_id=p_site_id,
    version=version+1,updated_by=p_actor_id,updated_at=now()
    WHERE id=p_task_id RETURNING version INTO row.version;
  RETURN row.version;
END $$;
REVOKE ALL ON FUNCTION public.set_task_execution_location(uuid,integer,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_execution_location(uuid,integer,uuid,text,uuid)
  TO service_role;

CREATE FUNCTION public.set_project_default_site(
  p_project_id uuid,p_expected_version integer,p_actor_id uuid,p_site_id uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row public.projects%ROWTYPE;
BEGIN
  IF NOT public.has_permission('planning_center.write',p_actor_id)
    OR NOT public.has_permission('projects:write',p_actor_id) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  SELECT * INTO row FROM public.projects WHERE id=p_project_id AND NOT deleted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Projeto inexistente.' USING ERRCODE='P0002'; END IF;
  IF row.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  UPDATE public.projects SET default_site_id=p_site_id,version=version+1,
    updated_by=p_actor_id,updated_at=now() WHERE id=p_project_id RETURNING version INTO row.version;
  RETURN row.version;
END $$;
REVOKE ALL ON FUNCTION public.set_project_default_site(uuid,integer,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_default_site(uuid,integer,uuid,uuid)
  TO service_role;
