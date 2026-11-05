-- The area owner is an active user with the existing PROJECT_MANAGER role.
-- Additional roles are respected through the canonical user_roles relation.
CREATE FUNCTION public.is_mechanical_design_manager(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE u.id = p_user_id AND u.approved IS TRUE AND u.deleted IS FALSE
      AND u.type <> 'External' AND r.code = 'PROJECT_MANAGER' AND r.is_active IS TRUE
  );
$$;
REVOKE ALL ON FUNCTION public.is_mechanical_design_manager(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_mechanical_design_manager(uuid) TO service_role;

-- Existing requests need explicit reassignment if an owner does not meet the rule.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.work_requests w WHERE w.kind = 'mechanical_design'
    AND NOT public.is_mechanical_design_manager(w.area_owner_id)) THEN
    RAISE EXCEPTION 'Existing mechanical design request has an ineligible owner.' USING ERRCODE = '23514';
  END IF;
END $$;

CREATE FUNCTION public.guard_mechanical_design_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.kind = 'mechanical_design' AND NOT public.is_mechanical_design_manager(NEW.area_owner_id) THEN
    RAISE EXCEPTION 'O responsável pelo desenho deve ser um gestor de projeto ativo.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_mechanical_design_owner
BEFORE INSERT OR UPDATE OF area_owner_id ON public.work_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_mechanical_design_owner();
REVOKE ALL ON FUNCTION public.guard_mechanical_design_owner() FROM PUBLIC, anon, authenticated;

-- Management RPCs record the event in the same transaction. Rejecting the event
-- rolls back the preceding request/task changes as well.
CREATE FUNCTION public.guard_mechanical_design_manager_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.action NOT IN ('accept','reject','edit','add_task','assign_task') THEN RETURN NEW; END IF;
  SELECT area_owner_id INTO v_owner FROM public.work_requests
    WHERE id = NEW.request_id AND kind = 'mechanical_design';
  IF v_owner IS NULL OR NOT public.is_mechanical_design_manager(NEW.actor_id)
     OR (NEW.actor_id <> v_owner AND NOT public.has_permission('projects:write', NEW.actor_id)) THEN
    RAISE EXCEPTION 'A gestão do desenho exige um gestor de projeto autorizado.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_mechanical_design_manager_event
BEFORE INSERT ON public.work_request_events
FOR EACH ROW EXECUTE FUNCTION public.guard_mechanical_design_manager_event();
REVOKE ALL ON FUNCTION public.guard_mechanical_design_manager_event() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_mechanical_design_reopen() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.action = 'reopen' AND NOT public.is_mechanical_design_manager(NEW.actor_id) THEN
    RAISE EXCEPTION 'A reabertura exige o gestor de projeto responsável.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_mechanical_design_reopen
BEFORE INSERT ON public.work_task_events
FOR EACH ROW EXECUTE FUNCTION public.guard_mechanical_design_reopen();
REVOKE ALL ON FUNCTION public.guard_mechanical_design_reopen() FROM PUBLIC, anon, authenticated;
