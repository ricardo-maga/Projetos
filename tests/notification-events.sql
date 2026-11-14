-- Run in a transaction after the notification migration; always roll back fixtures.
DO $$
DECLARE actor uuid; project uuid; comment_id uuid; request_id uuid; status5 uuid; before_count integer; after_count integer;
BEGIN
 SELECT id INTO STRICT actor FROM public.users WHERE approved AND NOT deleted AND type IS DISTINCT FROM 'External'
   AND lower(email)<>'ricardo75@gmail.com' AND public.is_mechanical_design_manager(id)
   AND public.has_permission('mechanical_design.create',id) LIMIT 1;
 SELECT id INTO STRICT project FROM public.projects WHERE NOT deleted LIMIT 1;
 UPDATE public.notification_settings SET enabled=true,target_group='managers' WHERE type IN ('project_comment','project_closed','mechanical_design_assignment','mechanical_design_result','mechanical_design_due_date');
 UPDATE public.projects SET project_manager_id=actor,field_manager_id=actor WHERE id=project;
 INSERT INTO public.comments(project_id,author_id,comment) VALUES(project,actor,'Teste transacional fictício') RETURNING id INTO comment_id;
 IF (SELECT count(*) FROM public.notifications WHERE event_key LIKE 'project_comment:'||comment_id||':%')<>1 THEN
   RAISE EXCEPTION 'Comment manager recipient mismatch'; END IF;
 UPDATE public.notification_settings SET enabled=false WHERE type='project_comment';
 INSERT INTO public.comments(project_id,author_id,comment) VALUES(project,actor,'Teste desativado') RETURNING id INTO comment_id;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE event_key LIKE 'project_comment:'||comment_id||':%') THEN
   RAISE EXCEPTION 'Disabled comment emitted'; END IF;
 INSERT INTO public.project_status(name,scale) VALUES('Teste concluído',5) RETURNING id INTO status5;
 UPDATE public.projects SET status_id=NULL WHERE id=project;
 UPDATE public.projects SET status_id=status5 WHERE id=project;
 SELECT count(*) INTO before_count FROM public.notifications WHERE event_key LIKE 'project_closed:'||project||':%';
 IF before_count<>1 THEN RAISE EXCEPTION 'Level 5 notification missing'; END IF;
 UPDATE public.projects SET status_id=status5 WHERE id=project;
 SELECT count(*) INTO after_count FROM public.notifications WHERE event_key LIKE 'project_closed:'||project||':%';
 IF before_count<>after_count THEN RAISE EXCEPTION 'Unchanged status emitted twice'; END IF;
 INSERT INTO public.work_requests(kind,title,requester_id,area_owner_id,planned_start_date,planned_end_date)
 VALUES('mechanical_design','Teste mecânico fictício',actor,actor,current_date,current_date) RETURNING id INTO request_id;
 IF (SELECT count(*) FROM public.notifications WHERE event_key LIKE 'mechanical_design_assignment:'||request_id||':%')<>1 THEN
   RAISE EXCEPTION 'Mechanical creation missing'; END IF;
 UPDATE public.work_requests SET status='delivered' WHERE id=request_id;
 IF (SELECT count(*) FROM public.notifications WHERE event_key LIKE 'mechanical_design_result:'||request_id||':%')<>1 THEN
   RAISE EXCEPTION 'Mechanical result missing'; END IF;
 UPDATE public.work_requests SET status='accepted' WHERE id=request_id;
 PERFORM notification_internal.generate_mechanical_design_due(current_date);
 IF (SELECT count(*) FROM public.notifications WHERE event_key LIKE 'mechanical_design_due_date:'||request_id||':%')<>1 THEN
   RAISE EXCEPTION 'Independent mechanical due notification missing'; END IF;
END $$;
