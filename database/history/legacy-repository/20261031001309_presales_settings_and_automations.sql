INSERT INTO public.notification_settings(type,name,enabled,days_before,target_group) VALUES
 ('presales_assignment','Novo pedido Presales',TRUE,0,'managers'),
 ('presales_due_date','Prazo do pedido Presales',TRUE,2,'allocated'),
 ('presales_result','Resultado Presales',TRUE,0,'managers')
ON CONFLICT(type) DO NOTHING;

CREATE FUNCTION notification_internal.presales_recipients(p_group text,p_request uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u.id FROM public.users u JOIN public.work_requests w ON w.id=p_request
 WHERE u.approved AND NOT u.deleted AND u.type<>'External'
   AND (p_group='all' OR (p_group='managers' AND u.id=w.area_owner_id)
     OR (p_group='allocated' AND EXISTS (
       SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id=wt.task_id
       WHERE wt.request_id=w.id AND ta.user_id=u.id)))
$$;
REVOKE ALL ON FUNCTION notification_internal.presales_recipients(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION notification_internal.generate_presales_due(p_today date DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE added integer;
BEGIN
 INSERT INTO public.notifications(user_id,title,message,link_url,event_key)
 SELECT r.user_id,CASE WHEN w.planned_end_date<p_today THEN 'Presales em atraso: '
   WHEN w.planned_end_date=p_today THEN 'Presales vence hoje: ' ELSE 'Prazo Presales: ' END||w.title,
   'Data limite: '||to_char(w.planned_end_date,'DD/MM/YYYY'),'/projects?tab=presales&request='||w.id,
   'presales_due_date:'||w.id||':'||w.planned_end_date||':'||
   CASE WHEN w.planned_end_date<p_today THEN 'overdue' WHEN w.planned_end_date=p_today THEN 'today' ELSE 'before' END||':'||r.user_id
 FROM public.work_requests w JOIN public.notification_settings s ON s.type='presales_due_date' AND s.enabled
 CROSS JOIN LATERAL notification_internal.presales_recipients(s.target_group,w.id) r
 WHERE w.kind='presales' AND w.status IN ('submitted','accepted','suspended')
   AND (w.planned_end_date=p_today OR w.planned_end_date=p_today-1
     OR (s.days_before>0 AND w.planned_end_date=p_today+s.days_before))
 ON CONFLICT(event_key) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 RETURN added;
END $$;

CREATE FUNCTION notification_internal.presales_request_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.notification_settings%ROWTYPE; rule_row public.automation_rules%ROWTYPE;
 action_row jsonb; event_name text; action_count integer; destination text;
BEGIN
 IF NEW.kind<>'presales' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN event_name:='presales_created';
 ELSIF OLD.status IS DISTINCT FROM NEW.status THEN event_name:='presales_status_changed';
 ELSE RETURN NEW; END IF;
 destination := '/projects?tab=presales&request='||NEW.id;
 SELECT * INTO s FROM public.notification_settings
   WHERE type=CASE WHEN event_name='presales_created' THEN 'presales_assignment' ELSE 'presales_result' END AND enabled;
 IF FOUND AND (event_name='presales_created' OR NEW.status IN ('suspended','won','lost')) THEN
   INSERT INTO public.notifications(user_id,title,message,link_url,event_key)
   SELECT r.user_id,
     CASE WHEN event_name='presales_created' THEN 'Novo Presales: ' ELSE 'Resultado Presales: ' END||NEW.title,
     CASE WHEN event_name='presales_created' THEN 'Foi criado um pedido Presales.'
       ELSE 'O pedido passou para '||NEW.status||'.' END,
     destination,s.type||':'||NEW.id||':'||NEW.status||':'||txid_current()||':'||r.user_id
   FROM notification_internal.presales_recipients(s.target_group,NEW.id) r
   ON CONFLICT(event_key) DO NOTHING;
 END IF;
 FOR rule_row IN SELECT * FROM public.automation_rules
   WHERE enabled AND NOT deleted AND trigger_type=event_name
     AND (event_name='presales_created' OR nullif(trigger_condition->>'toPresalesStatus','') IS NULL
       OR trigger_condition->>'toPresalesStatus'=NEW.status)
   ORDER BY created_at,id LOOP
   action_count:=0;
   FOR action_row IN SELECT value FROM jsonb_array_elements(rule_row.actions) LOOP
     IF action_row->>'type'='send_notification' THEN
       INSERT INTO public.notifications(user_id,title,message,link_url)
       SELECT u.id,action_row->'params'->>'notificationTitle',
         coalesce(action_row->'params'->>'notificationMessage',''),destination
       FROM public.users u WHERE NOT u.deleted;
       action_count:=action_count+1;
     END IF;
   END LOOP;
   INSERT INTO public.automation_executions(rule_id,event_type,entity_id,action_count)
   VALUES(rule_row.id,event_name,NEW.id,action_count);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER presales_request_event AFTER INSERT OR UPDATE OF status ON public.work_requests
FOR EACH ROW EXECUTE FUNCTION notification_internal.presales_request_event();
REVOKE ALL ON FUNCTION notification_internal.presales_request_event() FROM PUBLIC,anon,authenticated;
