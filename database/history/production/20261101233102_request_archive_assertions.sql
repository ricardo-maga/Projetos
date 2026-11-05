DO $$
DECLARE actor uuid; manager_role uuid; v_request_id uuid:=gen_random_uuid(); v_task_id uuid;
BEGIN
 SELECT u.id INTO actor FROM public.users u WHERE u.approved AND NOT u.deleted AND u.type<>'External' ORDER BY u.id LIMIT 1;
 SELECT r.id INTO manager_role FROM public.roles r WHERE r.code='PROJECT_MANAGER' AND r.is_active LIMIT 1;
 IF actor IS NULL OR manager_role IS NULL THEN RAISE EXCEPTION 'Active manager required for archive assertions.'; END IF;
 BEGIN
  INSERT INTO public.user_roles(user_id,role_id) VALUES(actor,manager_role) ON CONFLICT DO NOTHING;
  PERFORM public.presales_mutate_v2(v_request_id,actor,NULL,'create',jsonb_build_object(
    'title','Verificação eliminação','ownerId',actor,'plannedStartDate',current_date,
    'plannedEndDate',current_date+1));
  SELECT wt.task_id INTO v_task_id FROM public.work_request_tasks wt WHERE wt.request_id=v_request_id AND wt.is_initial;
  PERFORM public.archive_work_request(v_request_id,actor,1);
  IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id=v_request_id AND deleted_at IS NOT NULL) OR
     NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=v_task_id AND deleted) THEN
    RAISE EXCEPTION 'Archive did not hide request and task.';
  END IF;
  RAISE EXCEPTION 'archive assertion rollback' USING ERRCODE='PT001';
 EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
 END;
END $$;

;
