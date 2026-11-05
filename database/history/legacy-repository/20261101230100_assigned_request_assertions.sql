-- Transactional smoke test: the nested exception rolls back all test records.
DO $$
DECLARE actor uuid; manager_role uuid; v_request_id uuid:=gen_random_uuid(); v_task_id uuid;
BEGIN
 SELECT u.id INTO actor FROM public.users u WHERE u.approved AND NOT u.deleted AND u.type<>'External' ORDER BY u.id LIMIT 1;
 SELECT r.id INTO manager_role FROM public.roles r WHERE r.code='PROJECT_MANAGER' AND r.is_active LIMIT 1;
 IF actor IS NULL OR manager_role IS NULL THEN RAISE EXCEPTION 'Active manager required for request assertions.'; END IF;
 BEGIN
  INSERT INTO public.user_roles(user_id,role_id) VALUES(actor,manager_role) ON CONFLICT DO NOTHING;
  PERFORM public.presales_mutate_v2(v_request_id,actor,NULL,'create',jsonb_build_object(
    'title','Verificação Presales','ownerId',actor,'plannedStartDate',current_date,
    'plannedEndDate',current_date+1,'originCode','email','opportunitySf','SF-TEST'));
  IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id=v_request_id AND status='accepted') THEN
    RAISE EXCEPTION 'Assigned Presales was not activated.'; END IF;
  SELECT wt.task_id INTO v_task_id FROM public.work_request_tasks wt WHERE wt.request_id=v_request_id AND wt.is_initial;
  IF NOT EXISTS(SELECT 1 FROM public.task_assignees WHERE task_id=v_task_id AND user_id=actor) THEN
    RAISE EXCEPTION 'Initial task was not assigned.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.presales_details WHERE request_id=v_request_id AND process_number>0
    AND origin_code='email' AND opportunity_sf='SF-TEST') THEN RAISE EXCEPTION 'Presales metadata missing.'; END IF;
  PERFORM public.presales_mutate_v2(v_request_id,actor,1,'task_action',jsonb_build_object(
    'taskId',v_task_id,'taskVersion',1,'taskAction','start'));
  RAISE EXCEPTION 'request assertion rollback' USING ERRCODE='PT001';
 EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
 END;
END $$;
