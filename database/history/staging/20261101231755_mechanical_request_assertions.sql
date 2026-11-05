DO $$
DECLARE actor uuid; manager_role uuid; v_request_id uuid:=gen_random_uuid(); v_task_id uuid;
BEGIN
 SELECT u.id INTO actor FROM public.users u WHERE u.approved AND NOT u.deleted AND u.type<>'External' ORDER BY u.id LIMIT 1;
 SELECT r.id INTO manager_role FROM public.roles r WHERE r.code='PROJECT_MANAGER' AND r.is_active LIMIT 1;
 IF actor IS NULL OR manager_role IS NULL THEN RAISE EXCEPTION 'Active manager required for design assertions.'; END IF;
 BEGIN
  INSERT INTO public.user_roles(user_id,role_id) VALUES(actor,manager_role) ON CONFLICT DO NOTHING;
  PERFORM public.create_mechanical_design_request(v_request_id,actor,actor,'Verificação desenho',
    'Desenhar','Ficheiro de revisão',NULL,current_date,current_date+1);
  IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id=v_request_id AND status='accepted') THEN
    RAISE EXCEPTION 'Assigned design request was not activated.'; END IF;
  SELECT wt.task_id INTO v_task_id FROM public.work_request_tasks wt WHERE wt.request_id=v_request_id AND wt.is_initial;
  IF NOT EXISTS(SELECT 1 FROM public.task_assignees WHERE task_id=v_task_id AND user_id=actor) THEN
    RAISE EXCEPTION 'Design initial task not assigned.'; END IF;
  PERFORM public.mechanical_design_task_action(v_request_id,v_task_id,actor,1,'start',NULL);
  RAISE EXCEPTION 'design assertion rollback' USING ERRCODE='PT001';
 EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
 END;
END $$;

;
