-- Independent settings; existing notification and automation settings are preserved.
INSERT INTO public.notification_settings(type,name,enabled,days_before,target_group) VALUES
 ('project_comment','Novo comentÃ¡rio no projeto',true,0,'allocated'),
 ('project_closed','Projeto concluÃ­do/cancelado (nÃ­vel 5)',true,0,'allocated'),
 ('mechanical_design_assignment','Novo pedido de projeto mecÃ¢nico',true,0,'allocated'),
 ('mechanical_design_due_date','Prazo do projeto mecÃ¢nico',true,3,'allocated'),
 ('mechanical_design_result','Resultado do projeto mecÃ¢nico',true,0,'allocated')
ON CONFLICT(type) DO NOTHING;

CREATE OR REPLACE FUNCTION notification_internal.project_activity_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.projects%ROWTYPE; s public.notification_settings%ROWTYPE; notice_type text; notice_message text;
BEGIN
 IF TG_TABLE_NAME='comments' THEN
   SELECT * INTO p FROM public.projects WHERE id=NEW.project_id AND NOT deleted;
   IF NOT FOUND THEN RETURN NEW; END IF;
   notice_type := 'project_comment';
   notice_message := 'Foi adicionado um comentÃ¡rio: ' || left(NEW.comment,500);
 ELSE
   IF NEW.deleted OR NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN RETURN NEW; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.project_status WHERE id=NEW.status_id AND scale=5 AND NOT deleted)
     THEN RETURN NEW; END IF;
   p := NEW;
   notice_type := 'project_closed';
   notice_message := 'O projeto foi concluÃ­do/cancelado (nÃ­vel 5).';
 END IF;
 SELECT * INTO s FROM public.notification_settings WHERE type=notice_type AND enabled;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(user_id,title,message,link_url,event_key)
 SELECT u.id, s.name || ': ' || p.project_title, notice_message, '/projects?project=' || p.id,
   notice_type || ':' || NEW.id || ':' || txid_current() || ':' || u.id
 FROM public.users u
 WHERE u.approved IS TRUE AND u.deleted IS FALSE AND u.type IS DISTINCT FROM 'External'
 AND (s.target_group='all'
   OR (s.target_group='managers' AND u.id IN (p.project_manager_id,p.field_manager_id))
   OR (s.target_group='allocated' AND (u.id IN (p.project_manager_id,p.field_manager_id)
     OR EXISTS(SELECT 1 FROM public.tasks t JOIN public.task_assignees ta ON ta.task_id=t.id
       WHERE t.project_id=p.id AND NOT t.deleted AND ta.user_id=u.id))))
 ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION notification_internal.project_activity_notice() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER project_comment_notice AFTER INSERT ON public.comments
 FOR EACH ROW EXECUTE FUNCTION notification_internal.project_activity_notice();
CREATE TRIGGER project_closed_notice AFTER UPDATE OF status_id ON public.projects
 FOR EACH ROW EXECUTE FUNCTION notification_internal.project_activity_notice();

CREATE OR REPLACE FUNCTION notification_internal.mechanical_design_request_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.notification_settings%ROWTYPE; notice_type text;
BEGIN
 IF NEW.kind<>'mechanical_design' OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN notice_type := 'mechanical_design_assignment';
 ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('delivered','rejected','suspended','won','lost') THEN
   notice_type := 'mechanical_design_result';
 ELSE RETURN NEW; END IF;
 SELECT * INTO s FROM public.notification_settings WHERE type=notice_type AND enabled;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(user_id,title,message,link_url,event_key)
 SELECT r.user_id,s.name || ': ' || NEW.title,
   CASE WHEN TG_OP='INSERT' THEN 'Foi criado um pedido de projeto mecÃ¢nico.' ELSE 'O pedido passou para ' || NEW.status || '.' END,
   '/projects?tab=mechanical-design&request=' || NEW.id,
   notice_type || ':' || NEW.id || ':' || txid_current() || ':' || r.user_id
 FROM notification_internal.presales_recipients(s.target_group,NEW.id) r
 ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION notification_internal.mechanical_design_request_notice() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mechanical_design_request_notice AFTER INSERT OR UPDATE OF status ON public.work_requests
 FOR EACH ROW EXECUTE FUNCTION notification_internal.mechanical_design_request_notice();

CREATE OR REPLACE FUNCTION "notification_internal"."generate_mechanical_design_due"("p_today" "date" DEFAULT (("now"() AT TIME ZONE 'Europe/Lisbon'::"text"))::"date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE added integer;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id,
    CASE WHEN w.planned_end_date < p_today THEN 'Pedido em atraso: '
      WHEN w.planned_end_date = p_today THEN 'Pedido vence hoje: ' ELSE 'Prazo do pedido: ' END || w.title,
    'Data limite: ' || to_char(w.planned_end_date, 'DD/MM/YYYY'),
    '/projects?tab=mechanical-design&request=' || w.id::text,
    'mechanical_design_due_date:' || w.id || ':' || w.planned_end_date || ':' ||
      CASE WHEN w.planned_end_date < p_today THEN 'overdue' WHEN w.planned_end_date = p_today THEN 'today' ELSE 'before' END || ':' || r.user_id
  FROM public.work_requests w
  JOIN public.notification_settings s ON s.type = 'mechanical_design_due_date' AND s.enabled
  CROSS JOIN LATERAL (
    SELECT u.id AS user_id FROM public.users u
    WHERE u.approved IS TRUE AND u.deleted IS FALSE AND u.type IS DISTINCT FROM 'External'
      AND (s.target_group = 'all'
        OR (s.target_group = 'managers' AND u.id = w.area_owner_id)
        OR (s.target_group = 'allocated' AND EXISTS (
          SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id = wt.task_id
          WHERE wt.request_id = w.id AND ta.user_id = u.id)))
  ) r
  WHERE w.deleted_at IS NULL AND w.kind = 'mechanical_design' AND w.status IN ('submitted','accepted')
    AND w.planned_end_date IS NOT NULL
    AND (w.planned_end_date = p_today OR w.planned_end_date = p_today - 1
      OR (s.days_before > 0 AND w.planned_end_date = p_today + s.days_before))
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END; $$;
