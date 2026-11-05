-- Exercise the actual RPC and triggers while rolling every test write back.
DO $$
DECLARE actor uuid; manager_role uuid; v_request_id uuid:=gen_random_uuid(); task_id uuid;
 item_id uuid:=gen_random_uuid();
BEGIN
 SELECT u.id INTO actor FROM public.users u
 WHERE u.approved AND NOT u.deleted AND u.type<>'External' ORDER BY u.id LIMIT 1;
 SELECT r.id INTO manager_role FROM public.roles r WHERE r.code='PROJECT_MANAGER' AND r.is_active LIMIT 1;
 IF actor IS NULL OR manager_role IS NULL THEN
   RAISE EXCEPTION 'Presales verification requires an active team user and manager role.';
 END IF;
 BEGIN
   INSERT INTO public.user_roles(user_id,role_id) VALUES(actor,manager_role) ON CONFLICT DO NOTHING;
   IF NOT public.has_permission('presales.manage',actor) OR NOT public.has_permission('presales.execute',actor) THEN
     RAISE EXCEPTION 'Presales manager grants are incomplete.';
   END IF;
   PERFORM public.presales_mutate(v_request_id,actor,NULL,'create',jsonb_build_object(
     'title','Verificação transacional Presales','ownerId',actor,
     'plannedStartDate',current_date,'plannedEndDate',current_date+7,
     'requirements','Preparar solução técnica'));
   IF (SELECT count(*) FROM public.work_request_tasks wt WHERE wt.request_id=v_request_id AND wt.is_initial)<>1 THEN
     RAISE EXCEPTION 'Presales must create exactly one initial Task.'; END IF;
   SELECT wt.task_id INTO task_id FROM public.work_request_tasks wt WHERE wt.request_id=v_request_id AND wt.is_initial;
   PERFORM public.presales_mutate(v_request_id,actor,1,'accept',jsonb_build_object(
     'assigneeIds',jsonb_build_array(actor),'estimatedDays',0.5));
   PERFORM public.presales_mutate(v_request_id,actor,2,'task_action',jsonb_build_object(
     'taskId',task_id,'taskVersion',2,'taskAction','start'));
   PERFORM public.presales_mutate(v_request_id,actor,3,'save_item',jsonb_build_object(
     'id',item_id,'title','Peças e serviço','unit','un','quantity',2,'unitPrice',25,
     'groupLabel','Intervenção','sortOrder',1));
   PERFORM public.presales_mutate(v_request_id,actor,4,'save_document',jsonb_build_object('document',
     jsonb_build_object('schemaVersion',1,'blocks',jsonb_build_array(
       jsonb_build_object('id',gen_random_uuid(),'type','rich_text','title','Descrição','content','<p>Solução técnica</p>'),
       jsonb_build_object('id',gen_random_uuid(),'type','item_summary','title','Intervenção XPTO',
         'displayLabel','Intervenção XPTO','itemIds',jsonb_build_array(item_id))))));
   PERFORM public.presales_mutate(v_request_id,actor,5,'publish','{}'::jsonb);
   IF (SELECT count(*) FROM public.presales_document_revisions WHERE request_id=v_request_id)<>1 THEN
     RAISE EXCEPTION 'Published revision missing.'; END IF;
   BEGIN
     UPDATE public.presales_document_revisions SET revision_number=99 WHERE request_id=v_request_id;
     RAISE EXCEPTION 'Published revision was editable.';
   EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
   END;
   PERFORM public.presales_mutate(v_request_id,actor,6,'new_revision','{}'::jsonb);
   IF (SELECT document_locked FROM public.presales_details WHERE request_id=v_request_id) THEN
     RAISE EXCEPTION 'New revision did not unlock draft.'; END IF;
   RAISE EXCEPTION 'Presales verification rollback' USING ERRCODE='PT001';
 EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
 END;
END $$;
