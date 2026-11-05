-- Changing a project's client clears its inherited default site only when the
-- caller did not explicitly select a site for the new client. Explicit task
-- overrides must be resolved first to avoid silent loss of task locations.
CREATE OR REPLACE FUNCTION public.validate_project_site() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      IF EXISTS (
        SELECT 1 FROM public.tasks t JOIN public.client_sites s ON s.id=t.execution_site_id
        WHERE t.project_id=NEW.id AND NOT t.deleted
          AND s.client_id IS DISTINCT FROM NEW.client_id
      ) THEN RAISE EXCEPTION 'Resolva primeiro as instalações das tarefas.' USING ERRCODE='23514'; END IF;
      IF NEW.default_site_id IS NOT DISTINCT FROM OLD.default_site_id THEN
        NEW.default_site_id:=NULL;
      END IF;
    END IF;
  END IF;
  IF NEW.default_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_sites s WHERE s.id=NEW.default_site_id
      AND s.client_id=NEW.client_id AND NOT s.deleted
  ) THEN RAISE EXCEPTION 'Instalação predefinida não pertence ao cliente ativo.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.prevent_site_soft_delete_in_use() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.deleted AND NOT OLD.deleted AND (
    EXISTS (SELECT 1 FROM public.projects WHERE default_site_id=NEW.id AND NOT deleted)
    OR EXISTS (SELECT 1 FROM public.tasks WHERE execution_site_id=NEW.id AND NOT deleted)
  ) THEN RAISE EXCEPTION 'A instalação está associada a projetos ou tarefas ativos.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prevent_site_soft_delete_before_update BEFORE UPDATE OF deleted
ON public.client_sites FOR EACH ROW EXECUTE FUNCTION public.prevent_site_soft_delete_in_use();
REVOKE ALL ON FUNCTION public.prevent_site_soft_delete_in_use() FROM PUBLIC,anon,authenticated;

;
