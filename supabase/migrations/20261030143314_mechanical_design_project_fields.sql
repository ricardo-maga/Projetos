-- Project-style metadata belongs to the design request, never to its linked project.
ALTER TABLE public.mechanical_design_details
  ADD COLUMN usage_text text NOT NULL DEFAULT '' CHECK (length(usage_text) <= 10000),
  ADD COLUMN project_status_id uuid REFERENCES public.project_status(id);

CREATE TABLE public.mechanical_design_other_managers (
  request_id uuid NOT NULL REFERENCES public.mechanical_design_details(request_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (request_id, user_id)
);
CREATE INDEX mechanical_design_other_managers_user_idx
  ON public.mechanical_design_other_managers(user_id);
ALTER TABLE public.mechanical_design_other_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mechanical_design_other_managers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mechanical_design_other_managers TO service_role;

CREATE FUNCTION public.save_mechanical_design_project_fields(
  p_request_id uuid, p_owner_id uuid, p_usage_text text,
  p_project_status_id uuid, p_other_manager_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_manager_id uuid;
BEGIN
  IF length(coalesce(p_usage_text, '')) > 10000 THEN
    RAISE EXCEPTION 'Utilização demasiado extensa.' USING ERRCODE = '22023';
  END IF;
  IF p_project_status_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_status WHERE id = p_project_status_id AND deleted IS FALSE
  ) THEN
    RAISE EXCEPTION 'Estado do projeto inválido.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_other_manager_ids, 1), 0) > 30 THEN
    RAISE EXCEPTION 'Número excessivo de intervenientes.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_manager_id IN ARRAY coalesce(p_other_manager_ids, ARRAY[]::uuid[]) LOOP
    IF v_manager_id = p_owner_id OR NOT public.is_mechanical_design_manager(v_manager_id) THEN
      RAISE EXCEPTION 'Outro interveniente deve ser gestor de projeto ativo e distinto do responsável.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE public.mechanical_design_details
    SET usage_text = coalesce(p_usage_text, ''), project_status_id = p_project_status_id
    WHERE request_id = p_request_id;
  UPDATE public.mechanical_design_other_managers SET active = false WHERE request_id = p_request_id;
  INSERT INTO public.mechanical_design_other_managers(request_id, user_id, active)
    SELECT p_request_id, manager.user_id, true FROM unnest(coalesce(p_other_manager_ids, ARRAY[]::uuid[])) AS manager(user_id)
    ON CONFLICT (request_id, user_id) DO UPDATE SET active = true;
END; $$;
REVOKE ALL ON FUNCTION public.save_mechanical_design_project_fields(uuid,uuid,text,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_mechanical_design_project_fields(uuid,uuid,text,uuid,uuid[]) TO service_role;

-- The existing RPC remains available to an in-flight old deployment. The new
-- wrapper keeps request, initial Task and new metadata in one transaction.
CREATE FUNCTION public.create_mechanical_design_request_v2(
  p_id uuid, p_actor_id uuid, p_owner_id uuid, p_title text,
  p_instructions text, p_deliverables text, p_project_id uuid,
  p_planned_start_date date, p_planned_end_date date,
  p_usage_text text, p_project_status_id uuid, p_other_manager_ids uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_planned_start_date IS NULL THEN
    RAISE EXCEPTION 'Início previsto obrigatório.' USING ERRCODE = '22023';
  END IF;
  v_id := public.create_mechanical_design_request(
    p_id, p_actor_id, p_owner_id, p_title, p_instructions, p_deliverables,
    p_project_id, p_planned_start_date, p_planned_end_date
  );
  PERFORM public.save_mechanical_design_project_fields(
    v_id, p_owner_id, p_usage_text, p_project_status_id, p_other_manager_ids
  );
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_mechanical_design_request_v2(uuid,uuid,uuid,text,text,text,uuid,date,date,text,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mechanical_design_request_v2(uuid,uuid,uuid,text,text,text,uuid,date,date,text,uuid,uuid[]) TO service_role;

CREATE FUNCTION public.edit_mechanical_design_request_v2(
  p_id uuid, p_actor_id uuid, p_expected_version integer,
  p_instructions text, p_deliverables text, p_file_identifier text,
  p_file_revision text, p_planned_start_date date, p_planned_end_date date,
  p_usage_text text, p_project_status_id uuid, p_other_manager_ids uuid[]
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_version integer; v_owner_id uuid;
BEGIN
  IF p_planned_start_date IS NULL THEN
    RAISE EXCEPTION 'Início previsto obrigatório.' USING ERRCODE = '22023';
  END IF;
  v_version := public.manage_mechanical_design_request(
    p_id, p_actor_id, p_expected_version, 'edit', NULL,
    p_instructions, p_deliverables, p_file_identifier, p_file_revision,
    NULL, p_planned_start_date, p_planned_end_date
  );
  SELECT area_owner_id INTO v_owner_id FROM public.work_requests WHERE id = p_id;
  PERFORM public.save_mechanical_design_project_fields(
    p_id, v_owner_id, p_usage_text, p_project_status_id, p_other_manager_ids
  );
  RETURN v_version;
END; $$;
REVOKE ALL ON FUNCTION public.edit_mechanical_design_request_v2(uuid,uuid,integer,text,text,text,text,date,date,text,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_mechanical_design_request_v2(uuid,uuid,integer,text,text,text,text,date,date,text,uuid,uuid[]) TO service_role;
