-- Contact selectors draw from users, and SQL verifies their current roles.
CREATE FUNCTION public.guard_presales_contacts() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.commercial_manager_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.users u JOIN public.user_roles ur ON ur.user_id=u.id
   JOIN public.roles r ON r.id=ur.role_id
   WHERE u.id=NEW.commercial_manager_id AND u.approved AND NOT u.deleted
     AND u.type<>'External' AND r.is_active AND r.code='COMMERCIAL') THEN
   RAISE EXCEPTION 'Gestor comercial inválido.' USING ERRCODE='22023'; END IF;
 IF NEW.project_manager_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.users u JOIN public.user_roles ur ON ur.user_id=u.id
   JOIN public.roles r ON r.id=ur.role_id
   WHERE u.id=NEW.project_manager_id AND u.approved AND NOT u.deleted
     AND u.type<>'External' AND r.is_active AND r.code='PROJECT_MANAGER') THEN
   RAISE EXCEPTION 'Gestor de projeto inválido.' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_presales_contacts BEFORE INSERT OR UPDATE OF commercial_manager_id,project_manager_id
ON public.presales_details FOR EACH ROW EXECUTE FUNCTION public.guard_presales_contacts();

-- Keep the initial Task instructions derived from the Presales requirements.
CREATE FUNCTION public.sync_presales_initial_task() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE previous_setting text;
BEGIN
 IF NEW.technical_requirements IS NOT DISTINCT FROM OLD.technical_requirements THEN RETURN NEW; END IF;
 previous_setting := current_setting('app.presales_write',true);
 PERFORM set_config('app.presales_write','on',true);
 UPDATE public.tasks t SET task_description=NEW.technical_requirements,version=version+1,updated_at=now()
 FROM public.work_request_tasks wt WHERE wt.task_id=t.id AND wt.request_id=NEW.request_id AND wt.is_initial;
 PERFORM set_config('app.presales_write',coalesce(previous_setting,''),true);
 RETURN NEW;
END $$;
CREATE TRIGGER sync_presales_initial_task AFTER UPDATE OF technical_requirements ON public.presales_details
FOR EACH ROW EXECUTE FUNCTION public.sync_presales_initial_task();

CREATE FUNCTION public.guard_presales_task_estimate() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT NEW.is_initial AND EXISTS (
   SELECT 1 FROM public.work_requests WHERE id=NEW.request_id AND kind='presales')
   AND NEW.estimated_days IS NULL THEN
   RAISE EXCEPTION 'A tarefa Presales exige estimativa.' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_presales_task_estimate BEFORE INSERT OR UPDATE OF estimated_days,is_initial
ON public.work_request_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_presales_task_estimate();
REVOKE ALL ON FUNCTION public.guard_presales_contacts(),public.sync_presales_initial_task(),
  public.guard_presales_task_estimate() FROM PUBLIC,anon,authenticated;
