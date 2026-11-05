DO $$
DECLARE actor uuid; manager_role uuid; customer uuid; v_request_id uuid:=gen_random_uuid();
BEGIN
 SELECT id INTO actor FROM public.users WHERE approved AND NOT deleted AND type<>'External' ORDER BY id LIMIT 1;
 SELECT id INTO manager_role FROM public.roles WHERE code='PROJECT_MANAGER' AND is_active LIMIT 1;
 SELECT id INTO customer FROM public.clients WHERE NOT deleted ORDER BY id LIMIT 1;
 IF actor IS NULL OR manager_role IS NULL OR customer IS NULL THEN
   RAISE EXCEPTION 'Basic registry assertions require an active user, manager role and client.'; END IF;
 BEGIN
  INSERT INTO public.user_roles(user_id,role_id) VALUES(actor,manager_role) ON CONFLICT DO NOTHING;
  PERFORM public.presales_registry_mutate(v_request_id,actor,NULL,'create',jsonb_build_object(
    'title','Processo Presales de verificação','clientId',customer,'description','Pedido técnico',
    'projectManagerId',actor,'status','accepted','potentialValue',100));
  IF EXISTS(SELECT 1 FROM public.work_request_tasks WHERE request_id=v_request_id) THEN
    RAISE EXCEPTION 'Basic registry created an execution task.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.presales_details WHERE request_id=v_request_id AND client_id=customer
    AND request_description='Pedido técnico' AND potential_value=100 AND process_number>0) THEN
    RAISE EXCEPTION 'Basic process data missing.'; END IF;
  PERFORM public.presales_registry_mutate(v_request_id,actor,1,'edit',jsonb_build_object(
    'title','Processo Presales de verificação','clientId',customer,'description','Pedido atualizado',
    'projectManagerId',actor,'status','won','saleValue',80,'saleDate',current_date));
  IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id=v_request_id AND version=2 AND status='won') THEN
    RAISE EXCEPTION 'Basic process update failed.'; END IF;
  RAISE EXCEPTION 'registry assertion rollback' USING ERRCODE='PT001';
 EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
 END;
END $$;

;
