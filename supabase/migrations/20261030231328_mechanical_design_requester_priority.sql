ALTER TABLE public.mechanical_design_details
  ADD COLUMN requested_for_id uuid REFERENCES public.users(id),
  ADD COLUMN priority_id uuid REFERENCES public.project_priority(id);
CREATE INDEX mechanical_design_details_requested_for_idx ON public.mechanical_design_details(requested_for_id) WHERE requested_for_id IS NOT NULL;
CREATE INDEX mechanical_design_details_priority_idx ON public.mechanical_design_details(priority_id) WHERE priority_id IS NOT NULL;

CREATE FUNCTION public.save_mechanical_design_requester_priority(
  p_request_id uuid, p_requested_for_id uuid, p_priority_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_requested_for_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=p_requested_for_id AND deleted IS FALSE
  ) THEN RAISE EXCEPTION 'Requisitante inválido.' USING ERRCODE='22023'; END IF;
  IF p_priority_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_priority WHERE id=p_priority_id AND deleted IS FALSE
  ) THEN RAISE EXCEPTION 'Prioridade inválida.' USING ERRCODE='22023'; END IF;
  UPDATE public.mechanical_design_details
    SET requested_for_id=p_requested_for_id, priority_id=p_priority_id
    WHERE request_id=p_request_id;
END; $$;
REVOKE ALL ON FUNCTION public.save_mechanical_design_requester_priority(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_mechanical_design_requester_priority(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.create_mechanical_design_request_v3(
  p_id uuid,p_actor_id uuid,p_owner_id uuid,p_title text,
  p_instructions text,p_deliverables text,p_project_id uuid,
  p_planned_start_date date,p_planned_end_date date,
  p_usage_text text,p_project_status_id uuid,p_other_manager_ids uuid[],
  p_requested_for_id uuid,p_priority_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_mechanical_design_request_v2(
    p_id,p_actor_id,p_owner_id,p_title,p_instructions,p_deliverables,p_project_id,
    p_planned_start_date,p_planned_end_date,p_usage_text,p_project_status_id,p_other_manager_ids);
  PERFORM public.save_mechanical_design_requester_priority(v_id,p_requested_for_id,p_priority_id);
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_mechanical_design_request_v3(uuid,uuid,uuid,text,text,text,uuid,date,date,text,uuid,uuid[],uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mechanical_design_request_v3(uuid,uuid,uuid,text,text,text,uuid,date,date,text,uuid,uuid[],uuid,uuid) TO service_role;

CREATE FUNCTION public.edit_mechanical_design_request_v3(
  p_id uuid,p_actor_id uuid,p_expected_version integer,
  p_instructions text,p_deliverables text,p_file_identifier text,p_file_revision text,
  p_planned_start_date date,p_planned_end_date date,p_usage_text text,
  p_project_status_id uuid,p_other_manager_ids uuid[],p_requested_for_id uuid,p_priority_id uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_version integer;
BEGIN
  v_version := public.edit_mechanical_design_request_v2(
    p_id,p_actor_id,p_expected_version,p_instructions,p_deliverables,p_file_identifier,
    p_file_revision,p_planned_start_date,p_planned_end_date,p_usage_text,p_project_status_id,p_other_manager_ids);
  PERFORM public.save_mechanical_design_requester_priority(p_id,p_requested_for_id,p_priority_id);
  RETURN v_version;
END; $$;
REVOKE ALL ON FUNCTION public.edit_mechanical_design_request_v3(uuid,uuid,integer,text,text,text,text,date,date,text,uuid,uuid[],uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_mechanical_design_request_v3(uuid,uuid,integer,text,text,text,text,date,date,text,uuid,uuid[],uuid,uuid) TO service_role;
