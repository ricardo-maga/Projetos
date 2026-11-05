


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;


CREATE SCHEMA IF NOT EXISTS "notification_internal";


ALTER SCHEMA "notification_internal" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



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
    'task_due_date:mechanical_design:' || w.id || ':' || w.planned_end_date || ':' ||
      CASE WHEN w.planned_end_date < p_today THEN 'overdue' WHEN w.planned_end_date = p_today THEN 'today' ELSE 'before' END || ':' || r.user_id
  FROM public.work_requests w
  JOIN public.notification_settings s ON s.type = 'task_due_date' AND s.enabled
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


ALTER FUNCTION "notification_internal"."generate_mechanical_design_due"("p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."generate_presales_due"("p_today" "date" DEFAULT (("now"() AT TIME ZONE 'Europe/Lisbon'::"text"))::"date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
 WHERE w.deleted_at IS NULL AND w.kind='presales' AND w.status IN ('submitted','accepted','suspended')
   AND (w.planned_end_date=p_today OR w.planned_end_date=p_today-1
     OR (s.days_before>0 AND w.planned_end_date=p_today+s.days_before))
 ON CONFLICT(event_key) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 RETURN added;
END $$;


ALTER FUNCTION "notification_internal"."generate_presales_due"("p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."mechanical_design_task_link_rule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM notification_internal.run_mechanical_design_task_rules(NEW.task_id,'task_created',NULL,NULL);
  RETURN NEW;
END; $$;


ALTER FUNCTION "notification_internal"."mechanical_design_task_link_rule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."mechanical_design_task_status_rule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    PERFORM notification_internal.run_mechanical_design_task_rules(NEW.id,'task_status_changed',OLD.status_id,NEW.status_id);
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "notification_internal"."mechanical_design_task_status_rule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."presales_recipients"("p_group" "text", "p_request" "uuid") RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 SELECT u.id FROM public.users u JOIN public.work_requests w ON w.id=p_request
 WHERE u.approved AND NOT u.deleted AND u.type<>'External'
   AND (p_group='all' OR (p_group='managers' AND u.id=w.area_owner_id)
     OR (p_group='allocated' AND EXISTS (
       SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id=wt.task_id
       WHERE wt.request_id=w.id AND ta.user_id=u.id)))
$$;


ALTER FUNCTION "notification_internal"."presales_recipients"("p_group" "text", "p_request" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."presales_request_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "notification_internal"."presales_request_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."project_assignment_notice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE setting_row public.notification_settings%ROWTYPE;
DECLARE prior_manager uuid;
DECLARE prior_field_manager uuid;
BEGIN
  IF NEW.deleted IS TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    prior_manager := OLD.project_manager_id;
    prior_field_manager := OLD.field_manager_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO setting_row FROM public.notification_settings WHERE type = 'new_project' AND enabled;
    IF FOUND THEN
      INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
      SELECT r.user_id, 'Novo projeto: ' || NEW.project_title,
        'Foi criado o projeto "' || NEW.project_title || '".',
        '/projects?project=' || NEW.id,
        'new_project:' || NEW.id || ':' || r.user_id
      FROM notification_internal.recipients(setting_row.target_group, NEW.id) r
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  END IF;
  SELECT * INTO setting_row FROM public.notification_settings WHERE type = 'project_allocation' AND enabled;
  IF FOUND THEN
    INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
    SELECT r.user_id, 'Projeto atribuído: ' || NEW.project_title,
      'A equipa responsável pelo projeto "' || NEW.project_title || '" foi atualizada.',
      '/projects?project=' || NEW.id,
      'project_allocation:' || NEW.id || ':' || txid_current() || ':' || r.user_id
    FROM notification_internal.recipients(setting_row.target_group, NEW.id) r
    WHERE (TG_OP = 'INSERT' OR NEW.project_manager_id IS DISTINCT FROM prior_manager
      OR NEW.field_manager_id IS DISTINCT FROM prior_field_manager)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "notification_internal"."project_assignment_notice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."recipients"("p_group" "text", "p_project" "uuid", "p_task" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT u.id
  FROM public.users u
  LEFT JOIN public.projects p ON p.id = p_project
  WHERE u.approved IS TRUE AND u.deleted IS FALSE AND u.type IS DISTINCT FROM 'External'
    AND (
      p_group = 'all'
      OR (p_group = 'managers' AND u.id IN (p.project_manager_id, p.field_manager_id))
      OR (p_group = 'allocated' AND (
        (p_task IS NULL AND u.id IN (p.project_manager_id, p.field_manager_id))
        OR (p_task IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = p_task AND ta.user_id = u.id
        ))
      ))
    );
$$;


ALTER FUNCTION "notification_internal"."recipients"("p_group" "text", "p_project" "uuid", "p_task" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."run_mechanical_design_task_rules"("p_task_id" "uuid", "p_event" "text", "p_from_status" "uuid", "p_to_status" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE w public.work_requests%ROWTYPE; rule_row public.automation_rules%ROWTYPE; action_row jsonb;
 action_count integer; destination text;
BEGIN
 SELECT wr.* INTO w FROM public.work_request_tasks wt JOIN public.work_requests wr ON wr.id=wt.request_id
 JOIN public.tasks t ON t.id=wt.task_id WHERE wt.task_id=p_task_id AND t.project_id IS NULL AND NOT t.deleted;
 IF NOT FOUND THEN RETURN; END IF;
 destination := '/projects?tab='||CASE w.kind WHEN 'presales' THEN 'presales' ELSE 'mechanical-design' END||'&request='||w.id;
 FOR rule_row IN SELECT * FROM public.automation_rules WHERE enabled AND NOT deleted AND trigger_type=p_event
   AND (p_event='task_created' OR nullif(trigger_condition->>'toStatusId','') IS NULL OR trigger_condition->>'toStatusId'=p_to_status::text)
   AND (p_event='task_created' OR nullif(trigger_condition->>'fromStatusId','') IS NULL OR trigger_condition->>'fromStatusId'=p_from_status::text)
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
   VALUES(rule_row.id,p_event,p_task_id,action_count);
 END LOOP;
END $$;


ALTER FUNCTION "notification_internal"."run_mechanical_design_task_rules"("p_task_id" "uuid", "p_event" "text", "p_from_status" "uuid", "p_to_status" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "notification_internal"."task_assignment_notice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE s public.notification_settings%ROWTYPE; t public.tasks%ROWTYPE; w public.work_requests%ROWTYPE; destination text;
BEGIN
 SELECT * INTO s FROM public.notification_settings WHERE type='task_allocation' AND enabled;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO t FROM public.tasks WHERE id=NEW.task_id AND NOT deleted;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT wr.* INTO w FROM public.work_request_tasks wt JOIN public.work_requests wr ON wr.id=wt.request_id WHERE wt.task_id=NEW.task_id;
 destination := CASE WHEN w.kind='presales' THEN '/projects?tab=presales&request='||w.id::text
   WHEN w.kind='mechanical_design' THEN '/projects?tab=mechanical-design&request='||w.id::text
   WHEN t.project_id IS NOT NULL THEN '/projects?project='||t.project_id::text END;
 IF destination IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(user_id,title,message,link_url,event_key)
 SELECT r.user_id,'Tarefa atribuída: '||t.task_title,'Foi atribuída a tarefa "'||t.task_title||'".',destination,
   'task_allocation:'||NEW.task_id||':'||NEW.user_id||':'||txid_current()||':'||r.user_id
 FROM notification_internal.recipients(s.target_group,t.project_id,NEW.task_id) r
 WHERE s.target_group<>'allocated' OR r.user_id=NEW.user_id
 ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END $$;


ALTER FUNCTION "notification_internal"."task_assignment_notice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_assigned_work_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE request_row public.work_requests%ROWTYPE;
BEGIN
  IF NOT NEW.is_initial THEN RETURN NEW; END IF;
  SELECT * INTO request_row FROM public.work_requests WHERE id=NEW.request_id FOR UPDATE;
  IF request_row.kind NOT IN ('presales','mechanical_design') THEN RETURN NEW; END IF;
  IF request_row.kind='presales' THEN
    PERFORM set_config('app.presales_write','on',true);
  ELSE
    PERFORM set_config('app.mechanical_design_write','on',true);
  END IF;
  IF public.has_permission(request_row.kind || '.execute',request_row.area_owner_id) THEN
    INSERT INTO public.task_assignees(task_id,user_id) VALUES(NEW.task_id,request_row.area_owner_id)
      ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.work_requests SET status='accepted' WHERE id=NEW.request_id AND status='submitted';
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."activate_assigned_work_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_mechanical_design_task"("p_request_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text" DEFAULT ''::"text", "p_assignee_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[], "p_estimated_days" numeric DEFAULT NULL::numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_task uuid; v_uid uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF v_request.status <> 'accepted' OR (v_actor <> v_request.area_owner_id AND NOT public.has_permission('mechanical_design.coordinate',v_actor)) THEN
    RAISE EXCEPTION 'Sem permissão para acrescentar tarefas.' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Título inválido.' USING ERRCODE='22023'; END IF;
  IF p_estimated_days IS NULL OR p_estimated_days NOT BETWEEN 0.5 AND 999 OR p_estimated_days * 2 <> trunc(p_estimated_days * 2) THEN
    RAISE EXCEPTION 'Estimativa em meios dias obrigatória.' USING ERRCODE='22023';
  END IF;
  v_task := gen_random_uuid();
  INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
  VALUES(v_task,v_request.project_id,btrim(p_title),coalesce(p_description,''),
    '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333308'::uuid,1,v_actor,v_actor,FALSE);
  INSERT INTO public.work_request_tasks(request_id,task_id,estimated_days) VALUES(p_request_id,v_task,p_estimated_days);
  PERFORM set_config('app.mechanical_design_write','on',true);
  FOREACH v_uid IN ARRAY coalesce(p_assignee_ids,ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_uid AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
      RAISE EXCEPTION 'Desenhador inválido.' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task,v_uid) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_request_id;
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_request_id,'add_task',v_actor);
  RETURN v_task;
END; $$;


ALTER FUNCTION "public"."add_mechanical_design_task"("p_request_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text", "p_assignee_ids" "uuid"[], "p_estimated_days" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_role"("p_id" "uuid", "p_code" "text", "p_name" "text", "p_description" "text", "p_actor_id" "uuid", "p_ip" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_request_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE v_role public.roles%ROWTYPE;
BEGIN
 IF auth.role()<>'service_role' OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'')<>'External') THEN RAISE EXCEPTION 'Executor inválido ou operação apenas de serviço.' USING ERRCODE='42501'; END IF;
 IF NOT public.has_permission('roles.manage',COALESCE((SELECT auth_user_id FROM public.users WHERE id=p_actor_id),p_actor_id)) THEN RAISE EXCEPTION 'Apenas o Super Administrador pode criar funções.' USING ERRCODE='42501'; END IF;
 IF p_code !~ '^CUSTOM_[A-Z0-9_]{1,48}$' OR length(trim(p_name)) NOT BETWEEN 1 AND 80 OR length(COALESCE(p_description,''))>500 THEN RAISE EXCEPTION 'Dados da função inválidos.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.roles(id,code,name,description,is_system,is_active,updated_by) VALUES(p_id,p_code,trim(p_name),NULLIF(trim(p_description),''),FALSE,TRUE,p_actor_id) RETURNING * INTO v_role;
 INSERT INTO public.audit_logs(user_id,user_name,user_email,action,entity_type,entity_id,entity_name,details,ip,user_agent,request_id) SELECT p_actor_id,u.name,u.email,'SETTINGS','SYSTEM',p_id,'role.created',jsonb_build_object('after',to_jsonb(v_role))::text,p_ip,p_user_agent,p_request_id FROM public.users u WHERE u.id=p_actor_id;
 RETURN to_jsonb(v_role);
END;$_$;


ALTER FUNCTION "public"."admin_create_role"("p_id" "uuid", "p_code" "text", "p_name" "text", "p_description" "text", "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_replace_role_permissions"("p_role_id" "uuid", "p_permission_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_request_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_role public.roles%ROWTYPE;v_requested_count INTEGER;v_valid_count INTEGER;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Server-only operation' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'')<>'External') THEN RAISE EXCEPTION 'Executor inválido ou inativo.' USING ERRCODE='42501'; END IF;
 IF NOT public.has_permission('roles.manage',COALESCE((SELECT auth_user_id FROM public.users WHERE id=p_actor_id),p_actor_id)) THEN RAISE EXCEPTION 'Apenas o Super Administrador pode gerir permissões.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_role FROM public.roles WHERE id=p_role_id FOR UPDATE; IF NOT FOUND OR v_role.is_active IS NOT TRUE THEN RAISE EXCEPTION 'Função inexistente ou inativa.' USING ERRCODE='P0002'; END IF;
 IF v_role.code='SUPER_ADMIN' THEN RAISE EXCEPTION 'As permissões do Super Administrador são sempre completas.' USING ERRCODE='23514'; END IF;
 SELECT count(DISTINCT x) INTO v_requested_count FROM unnest(COALESCE(p_permission_ids,ARRAY[]::UUID[])) x;
 SELECT count(*) INTO v_valid_count FROM public.permissions p WHERE p.id=ANY(COALESCE(p_permission_ids,ARRAY[]::UUID[])) AND p.is_active IS TRUE AND p.code NOT LIKE 'roles.%';
 IF v_requested_count<>v_valid_count THEN RAISE EXCEPTION 'A lista contém permissões inativas, inexistentes ou reservadas.' USING ERRCODE='22023'; END IF;
 DELETE FROM public.role_permissions WHERE role_id=p_role_id;
 INSERT INTO public.role_permissions(role_id,permission_id,granted_by) SELECT p_role_id,p.id,p_actor_id FROM public.permissions p WHERE p.id=ANY(COALESCE(p_permission_ids,ARRAY[]::UUID[]));
 UPDATE public.roles SET updated_at=NOW(),updated_by=p_actor_id WHERE id=p_role_id;
 INSERT INTO public.audit_logs(user_id,user_name,user_email,action,entity_type,entity_id,entity_name,details,ip,user_agent,request_id) SELECT p_actor_id,u.name,u.email,'SETTINGS','SYSTEM',p_role_id,'role.permissions.updated',jsonb_build_object('roleCode',v_role.code,'permissionIds',COALESCE(p_permission_ids,ARRAY[]::UUID[]))::text,p_ip,p_user_agent,p_request_id FROM public.users u WHERE u.id=p_actor_id;
END;$$;


ALTER FUNCTION "public"."admin_replace_role_permissions"("p_role_id" "uuid", "p_permission_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_replace_user_roles"("p_user_id" "uuid", "p_role_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_request_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_target public.users%ROWTYPE;v_requested_count INTEGER;v_valid_count INTEGER;v_keeps_super_admin BOOLEAN;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Server-only operation' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'')<>'External') THEN RAISE EXCEPTION 'Executor inválido ou inativo.' USING ERRCODE='42501'; END IF;
 IF NOT public.has_permission('roles.manage',COALESCE((SELECT auth_user_id FROM public.users WHERE id=p_actor_id),p_actor_id)) THEN RAISE EXCEPTION 'Apenas o Super Administrador pode atribuir funções.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rbac:last-super-admin',0));
 SELECT * INTO v_target FROM public.users WHERE id=p_user_id FOR UPDATE; IF NOT FOUND OR v_target.deleted IS TRUE THEN RAISE EXCEPTION 'Utilizador inexistente ou eliminado.' USING ERRCODE='P0002'; END IF;
 IF COALESCE(v_target.type,'')='External' AND cardinality(COALESCE(p_role_ids,ARRAY[]::UUID[]))>0 THEN RAISE EXCEPTION 'Utilizadores externos não podem receber funções internas.' USING ERRCODE='42501'; END IF;
 SELECT count(DISTINCT x) INTO v_requested_count FROM unnest(COALESCE(p_role_ids,ARRAY[]::UUID[])) x;
 SELECT count(*) INTO v_valid_count FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[])) AND r.is_active IS TRUE;
 IF v_requested_count<>v_valid_count THEN RAISE EXCEPTION 'A lista contém funções inativas ou inexistentes.' USING ERRCODE='22023'; END IF;
 v_keeps_super_admin:=EXISTS(SELECT 1 FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[])) AND r.code='SUPER_ADMIN');
 IF NOT v_keeps_super_admin AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.code='SUPER_ADMIN') AND NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id JOIN public.users u ON u.id=ur.user_id WHERE r.code='SUPER_ADMIN' AND ur.user_id<>p_user_id AND u.approved IS TRUE AND u.deleted IS NOT TRUE) THEN RAISE EXCEPTION 'Não é possível remover o último Super Administrador.' USING ERRCODE='23514'; END IF;
 DELETE FROM public.user_roles WHERE user_id=p_user_id;
 INSERT INTO public.user_roles(user_id,role_id,assigned_by) SELECT p_user_id,r.id,p_actor_id FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[]));
 UPDATE public.users SET role_id=(COALESCE(p_role_ids,ARRAY[]::UUID[]))[1] WHERE id=p_user_id;
 INSERT INTO public.audit_logs(user_id,user_name,user_email,action,entity_type,entity_id,entity_name,details,ip,user_agent,request_id) SELECT p_actor_id,u.name,u.email,'SETTINGS','USER',p_user_id,'user.roles.updated',jsonb_build_object('roleIds',COALESCE(p_role_ids,ARRAY[]::UUID[]))::text,p_ip,p_user_agent,p_request_id FROM public.users u WHERE u.id=p_actor_id;
END;$$;


ALTER FUNCTION "public"."admin_replace_user_roles"("p_user_id" "uuid", "p_role_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_role"("p_role_id" "uuid", "p_changes" "jsonb", "p_actor_id" "uuid", "p_ip" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_request_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_before public.roles%ROWTYPE;v_after public.roles%ROWTYPE;
BEGIN
 IF auth.role()<>'service_role' OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'')<>'External') THEN RAISE EXCEPTION 'Executor inválido ou operação apenas de serviço.' USING ERRCODE='42501'; END IF;
 IF NOT public.has_permission('roles.manage',COALESCE((SELECT auth_user_id FROM public.users WHERE id=p_actor_id),p_actor_id)) THEN RAISE EXCEPTION 'Apenas o Super Administrador pode editar funções.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR p_changes-ARRAY['name','description','is_active']<>'{}'::jsonb THEN RAISE EXCEPTION 'Campos de edição inválidos.' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_before FROM public.roles WHERE id=p_role_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Função não encontrada.' USING ERRCODE='P0002'; END IF;
 IF p_changes?'name' AND (jsonb_typeof(p_changes->'name')<>'string' OR length(trim(p_changes->>'name')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Nome inválido.' USING ERRCODE='22023'; END IF;
 IF p_changes?'description' AND jsonb_typeof(p_changes->'description') NOT IN ('string','null') THEN RAISE EXCEPTION 'Descrição inválida.' USING ERRCODE='22023'; END IF;
 IF p_changes?'description' AND length(COALESCE(p_changes->>'description',''))>500 THEN RAISE EXCEPTION 'Descrição demasiado longa.' USING ERRCODE='22023'; END IF;
 IF p_changes?'is_active' AND jsonb_typeof(p_changes->'is_active')<>'boolean' THEN RAISE EXCEPTION 'Estado inválido.' USING ERRCODE='22023'; END IF;
 IF v_before.is_system AND p_changes->>'is_active'='false' THEN RAISE EXCEPTION 'Funções de sistema não podem ser desativadas.' USING ERRCODE='23514'; END IF;
 IF p_changes->>'is_active'='false' AND EXISTS(SELECT 1 FROM public.user_roles WHERE role_id=p_role_id) THEN RAISE EXCEPTION 'Remova primeiro as atribuições desta função.' USING ERRCODE='23514'; END IF;
 UPDATE public.roles SET name=CASE WHEN p_changes?'name' THEN trim(p_changes->>'name') ELSE name END,description=CASE WHEN p_changes?'description' THEN NULLIF(trim(p_changes->>'description'),'') ELSE description END,is_active=CASE WHEN p_changes?'is_active' THEN (p_changes->>'is_active')::boolean ELSE is_active END,updated_at=NOW(),updated_by=p_actor_id WHERE id=p_role_id RETURNING * INTO v_after;
 INSERT INTO public.audit_logs(user_id,user_name,user_email,action,entity_type,entity_id,entity_name,details,ip,user_agent,request_id) SELECT p_actor_id,u.name,u.email,'SETTINGS','SYSTEM',p_role_id,CASE WHEN v_before.is_active AND NOT v_after.is_active THEN 'role.disabled' ELSE 'role.updated' END,jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after))::text,p_ip,p_user_agent,p_request_id FROM public.users u WHERE u.id=p_actor_id;
 RETURN to_jsonb(v_after);
END;$$;


ALTER FUNCTION "public"."admin_update_role"("p_role_id" "uuid", "p_changes" "jsonb", "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_work_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE request_row public.work_requests%ROWTYPE; task_row record; permission_prefix text;
BEGIN
  SELECT * INTO request_row FROM public.work_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR request_row.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF request_row.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  permission_prefix:=request_row.kind;
  IF request_row.kind NOT IN ('presales','mechanical_design') OR
     NOT public.has_permission(permission_prefix || '.manage',p_actor_id) OR
     (request_row.area_owner_id<>p_actor_id AND NOT public.has_permission(permission_prefix || '.coordinate',p_actor_id)) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.work_request_tasks wt JOIN public.tasks t ON t.id=wt.task_id
    WHERE wt.request_id=p_id AND t.status_id::text<>'99999999-9999-9999-9999-999999999901') THEN
    RAISE EXCEPTION 'Há tarefas iniciadas; não é possível eliminar o pedido.' USING ERRCODE='22023';
  END IF;
  IF request_row.kind='presales' THEN PERFORM set_config('app.presales_write','on',true);
  ELSE PERFORM set_config('app.mechanical_design_write','on',true); END IF;
  UPDATE public.tasks SET deleted=TRUE,version=version+1,updated_by=p_actor_id,updated_at=now()
    WHERE id IN (SELECT task_id FROM public.work_request_tasks WHERE request_id=p_id);
  UPDATE public.work_requests SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=p_id;
  RETURN p_expected_version+1;
END $$;


ALTER FUNCTION "public"."archive_work_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_mechanical_design_task"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_assignee_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_uid uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF v_request.status <> 'accepted' OR (v_actor <> v_request.area_owner_id AND NOT public.has_permission('mechanical_design.coordinate',v_actor)) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks WHERE request_id=p_request_id AND task_id=p_task_id) THEN
    RAISE EXCEPTION 'Tarefa não pertence ao pedido.' USING ERRCODE='22023';
  END IF;
  IF coalesce(array_length(p_assignee_ids,1),0)=0 THEN RAISE EXCEPTION 'Indique um desenhador.' USING ERRCODE='22023'; END IF;
  FOREACH v_uid IN ARRAY p_assignee_ids LOOP
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_uid AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
      RAISE EXCEPTION 'Desenhador inválido.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  PERFORM set_config('app.mechanical_design_write','on',true);
  DELETE FROM public.task_assignees WHERE task_id=p_task_id;
  FOREACH v_uid IN ARRAY p_assignee_ids LOOP
    INSERT INTO public.task_assignees(task_id,user_id) VALUES(p_task_id,v_uid) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.tasks SET version=version+1,updated_by=v_actor,updated_at=now() WHERE id=p_task_id;
  UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_request_id;
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_request_id,'assign_task',v_actor);
  INSERT INTO public.work_task_events(task_id,request_id,action,actor_id) VALUES(p_task_id,p_request_id,'assign',v_actor);
  RETURN p_expected_version+1;
END; $$;


ALTER FUNCTION "public"."assign_mechanical_design_task"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_assignee_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_primary_role_on_user_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, NEW.role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_primary_role_on_user_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_legacy_sync_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
  NEW.sync_version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.sync_version + 1 END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bump_legacy_sync_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS TABLE("success" boolean, "remaining" integer, "reset_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$
DECLARE v_now timestamptz := now(); v_row private.rate_limit_windows%ROWTYPE;
BEGIN
  IF p_bucket !~ '^[0-9a-f]{64}$' OR p_limit < 1 OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid rate limit request' USING ERRCODE = '22023';
  END IF;
  INSERT INTO private.rate_limit_windows AS w (bucket, window_started_at, request_count, updated_at)
  VALUES (p_bucket, v_now, 1, v_now)
  ON CONFLICT (bucket) DO UPDATE SET
    window_started_at = CASE WHEN w.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN v_now ELSE w.window_started_at END,
    request_count = CASE WHEN w.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN 1 ELSE w.request_count + 1 END,
    updated_at = v_now
  RETURNING * INTO v_row;
  RETURN QUERY SELECT v_row.request_count <= p_limit, greatest(p_limit - v_row.request_count, 0), v_row.window_started_at + make_interval(secs => p_window_seconds);
END;
$_$;


ALTER FUNCTION "public"."consume_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text" DEFAULT ''::"text", "p_deliverables" "text" DEFAULT ''::"text", "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_planned_start_date" "date" DEFAULT NULL::"date", "p_planned_end_date" "date" DEFAULT NULL::"date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor uuid; v_task_id uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'Título inválido.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_owner_id AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
    RAISE EXCEPTION 'Responsável inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id=p_project_id AND deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Projeto inválido.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.work_requests(id,kind,title,requester_id,area_owner_id,project_id,planned_start_date,planned_end_date)
  VALUES (p_id,'mechanical_design',btrim(p_title),v_actor,p_owner_id,p_project_id,p_planned_start_date,p_planned_end_date);
  INSERT INTO public.mechanical_design_details(request_id,instructions,deliverables)
  VALUES (p_id,coalesce(p_instructions,''),coalesce(p_deliverables,''));
  v_task_id := gen_random_uuid();
  INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
  VALUES (v_task_id,p_project_id,'Desenvolvimento: ' || btrim(p_title),'',
    '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333308'::uuid,1,v_actor,v_actor,FALSE);
  INSERT INTO public.work_request_tasks(request_id,task_id,is_initial) VALUES (p_id,v_task_id,TRUE);
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,'create',v_actor);
  RETURN p_id;
END; $$;


ALTER FUNCTION "public"."create_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."create_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_mechanical_design_request_v2(
    p_id,p_actor_id,p_owner_id,p_title,p_instructions,p_deliverables,p_project_id,
    p_planned_start_date,p_planned_end_date,p_usage_text,p_project_status_id,p_other_manager_ids);
  PERFORM public.save_mechanical_design_requester_priority(v_id,p_requested_for_id,p_priority_id);
  RETURN v_id;
END; $$;


ALTER FUNCTION "public"."create_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
    new_id UUID;
    cat_id UUID;
    t_id UUID;
    part_id UUID;
BEGIN
    new_id := COALESCE(p_id, uuid_generate_v4());

    -- Insert project row with only canonical scalar fields
    INSERT INTO public.projects (
        id, demo, client_id, project_title, project_description, status_id,
        category_id, project_manager_id, field_manager_id, sales_rep_id, 
        start_date, delivery_date, estimated_date, scheduled_date, 
        install_project_no, sf_opportunity_no, documents, budget_value, 
        client_contact_name, client_contact_email, client_contact_phone, 
        color, notes, created_by, is_urgent, version
    ) VALUES (
        new_id, p_demo, p_client_id, p_project_title, p_project_description, p_status_id,
        p_category_ids[1], p_project_manager_id, p_field_manager_id, p_sales_rep_id, 
        p_start_date, p_delivery_date, p_estimated_date, p_scheduled_date, 
        p_install_project_no, p_sf_opportunity_no, p_documents, p_budget_value, 
        p_client_contact_name, p_client_contact_email, p_client_contact_phone, 
        p_color, p_notes, p_created_by, COALESCE(p_is_urgent, FALSE), 1
    );

    -- Insert priority link
    IF p_priority_id IS NOT NULL THEN
        INSERT INTO public.project_priority_link (project_id, priority_id)
        VALUES (new_id, p_priority_id);
    END IF;

    -- Insert risk link
    IF p_risk_id IS NOT NULL THEN
        INSERT INTO public.project_risk_link (project_id, risk_id)
        VALUES (new_id, p_risk_id);
    END IF;

    -- Insert category links
    IF p_category_ids IS NOT NULL THEN
        FOREACH cat_id IN ARRAY p_category_ids LOOP
            INSERT INTO public.project_category_link (project_id, category_id)
            VALUES (new_id, cat_id);
        END LOOP;
    END IF;

    -- Insert teams links
    IF p_teams_involved_ids IS NOT NULL THEN
        FOREACH t_id IN ARRAY p_teams_involved_ids LOOP
            INSERT INTO public.project_teams_link (project_id, team_id)
            VALUES (new_id, t_id);
        END LOOP;
    END IF;

    -- Insert partners links
    IF p_partners_ids IS NOT NULL THEN
        FOREACH part_id IN ARRAY p_partners_ids LOOP
            INSERT INTO public.project_partners_link (project_id, partner_id)
            VALUES (new_id, part_id);
        END LOOP;
    END IF;

    RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
    new_id UUID;
    cat_id UUID;
    t_id UUID;
    part_id UUID;
BEGIN
    new_id := COALESCE(p_id, uuid_generate_v4());

    -- Insert project row with only canonical scalar fields
    INSERT INTO public.projects (
        id, demo, client_id, project_title, project_description, status_id,
        category_id, project_manager_id, field_manager_id, sales_rep_id, 
        start_date, delivery_date, estimated_date, scheduled_date, forecast_date, 
        install_project_no, sf_opportunity_no, documents, budget_value, 
        client_contact_name, client_contact_email, client_contact_phone, 
        color, notes, created_by, is_urgent, version
    ) VALUES (
        new_id, p_demo, p_client_id, p_project_title, p_project_description, p_status_id,
        p_category_ids[1], p_project_manager_id, p_field_manager_id, p_sales_rep_id, 
        p_start_date, p_delivery_date, p_estimated_date, p_scheduled_date, p_forecast_date, 
        p_install_project_no, p_sf_opportunity_no, p_documents, p_budget_value, 
        p_client_contact_name, p_client_contact_email, p_client_contact_phone, 
        p_color, p_notes, p_created_by, COALESCE(p_is_urgent, FALSE), 1
    );

    -- Insert priority link
    IF p_priority_id IS NOT NULL THEN
        INSERT INTO public.project_priority_link (project_id, priority_id)
        VALUES (new_id, p_priority_id);
    END IF;

    -- Insert risk link
    IF p_risk_id IS NOT NULL THEN
        INSERT INTO public.project_risk_link (project_id, risk_id)
        VALUES (new_id, p_risk_id);
    END IF;

    -- Insert category links
    IF p_category_ids IS NOT NULL THEN
        FOREACH cat_id IN ARRAY p_category_ids LOOP
            INSERT INTO public.project_category_link (project_id, category_id)
            VALUES (new_id, cat_id);
        END LOOP;
    END IF;

    -- Insert teams links
    IF p_teams_involved_ids IS NOT NULL THEN
        FOREACH t_id IN ARRAY p_teams_involved_ids LOOP
            INSERT INTO public.project_teams_link (project_id, team_id)
            VALUES (new_id, t_id);
        END LOOP;
    END IF;

    -- Insert partners links
    IF p_partners_ids IS NOT NULL THEN
        FOREACH part_id IN ARRAY p_partners_ids LOOP
            INSERT INTO public.project_partners_link (project_id, partner_id)
            VALUES (new_id, part_id);
        END LOOP;
    END IF;

    RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_task_title" "text" DEFAULT ''::"text", "p_status_id" "text" DEFAULT NULL::"text", "p_task_type_id" "text" DEFAULT NULL::"text", "p_estimated_hours" interval DEFAULT '00:00:00'::interval, "p_actual_hours" interval DEFAULT '00:00:00'::interval, "p_start_date" "date" DEFAULT NULL::"date", "p_start_time" time without time zone DEFAULT NULL::time without time zone, "p_end_date" "date" DEFAULT NULL::"date", "p_end_time" time without time zone DEFAULT NULL::time without time zone, "p_estimated_date" "date" DEFAULT NULL::"date", "p_completed_date" "date" DEFAULT NULL::"date", "p_task_description" "text" DEFAULT ''::"text", "p_notes" "text" DEFAULT NULL::"text", "p_is_milestone" boolean DEFAULT false, "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_assignee_user_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_task_row RECORD;
  v_uid UUID;
  v_caller_user_id UUID;
  v_status_uuid UUID;
  v_task_type_uuid UUID;
BEGIN
  -- 1. Authorization check
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:write', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para criar tarefas.' USING ERRCODE = '42501';
    END IF;

    -- Resolve caller profile in public.users to preserve FK integrity
    SELECT id INTO v_caller_user_id
    FROM public.users
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND approved = TRUE AND deleted = FALSE;

    IF p_created_by IS NOT NULL AND p_created_by <> v_caller_user_id AND p_created_by <> auth.uid() AND NOT public.is_admin() THEN
      p_created_by := COALESCE(v_caller_user_id, auth.uid());
    ELSIF p_created_by IS NULL OR p_created_by = auth.uid() THEN
      p_created_by := COALESCE(v_caller_user_id, auth.uid());
    END IF;
  ELSIF p_created_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:write', p_created_by) THEN
      RAISE EXCEPTION 'Sem permissão para criar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Validate temporal constraints: start_date and end_date must exist together and end_date >= start_date
  IF (p_start_date IS NOT NULL AND p_end_date IS NULL) OR (p_start_date IS NULL AND p_end_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Data de início e data de fim devem ser preenchidas em conjunto.' USING ERRCODE = '23514';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Data de fim não pode ser anterior à data de início.' USING ERRCODE = '23514';
  END IF;

  -- 3. Validate project exists and is active ONLY IF project_id is provided
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 4. Resolve status_id to UUID
  IF p_status_id IS NOT NULL AND trim(p_status_id) <> '' THEN
    IF p_status_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_status_uuid := p_status_id::UUID;
    ELSIF p_status_id ~ '^ts-[0-9]+$' THEN
      v_status_uuid := ('99999999-9999-9999-9999-' || lpad(substring(p_status_id from 4), 12, '0'))::UUID;
    ELSE
      v_status_uuid := NULL;
    END IF;
  ELSE
    v_status_uuid := NULL;
  END IF;

  -- 5. Resolve task_type_id to UUID
  IF p_task_type_id IS NOT NULL AND trim(p_task_type_id) <> '' THEN
    IF p_task_type_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_task_type_uuid := p_task_type_id::UUID;
    ELSIF p_task_type_id ~ '^tt-[0-9]+$' THEN
      v_task_type_uuid := ('88888888-8888-8888-8888-' || lpad(substring(p_task_type_id from 4), 12, '0'))::UUID;
    ELSE
      v_task_type_uuid := NULL;
    END IF;
  ELSE
    v_task_type_uuid := NULL;
  END IF;

  -- 6. Insert into tasks table
  INSERT INTO public.tasks (
    id,
    project_id,
    task_title,
    status_id,
    task_type_id,
    estimated_hours,
    actual_hours,
    start_date,
    start_time,
    end_date,
    end_time,
    estimated_date,
    completed_date,
    task_description,
    notes,
    is_milestone,
    version,
    created_by,
    updated_by,
    deleted,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_project_id,
    p_task_title,
    COALESCE(v_status_uuid, '99999999-9999-9999-9999-999999999901'::UUID),
    v_task_type_uuid,
    COALESCE(p_estimated_hours, '0 hours'::INTERVAL),
    COALESCE(p_actual_hours, '0 hours'::INTERVAL),
    p_start_date,
    p_start_time,
    p_end_date,
    p_end_time,
    p_estimated_date,
    p_completed_date,
    p_task_description,
    p_notes,
    COALESCE(p_is_milestone, FALSE),
    1,
    p_created_by,
    p_created_by,
    FALSE,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  RETURNING * INTO v_task_row;

  -- 7. Insert assignees
  IF p_assignee_user_ids IS NOT NULL AND array_length(p_assignee_user_ids, 1) > 0 THEN
    FOREACH v_uid IN ARRAY p_assignee_user_ids LOOP
      IF v_uid IS NOT NULL THEN
        INSERT INTO public.task_assignees (task_id, user_id)
        VALUES (p_id, v_uid)
        ON CONFLICT (task_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN to_jsonb(v_task_row);
END;
$_$;


ALTER FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_created_by" "uuid", "p_assignee_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_created_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_priority_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_task JSONB;
BEGIN
  IF p_priority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.project_priority WHERE id = p_priority_id AND deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Prioridade da tarefa inválida ou eliminada.' USING ERRCODE = '23503';
  END IF;
  v_task := public.create_task_atomic(p_id, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_created_by, p_assignee_user_ids);
  UPDATE public.tasks SET priority_id = p_priority_id WHERE id = p_id;
  SELECT to_jsonb(tasks) INTO v_task FROM public.tasks WHERE id = p_id;
  RETURN v_task;
END;
$$;


ALTER FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_created_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_priority_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_project_transaction"("p_id" "uuid", "p_expected_version" integer DEFAULT NULL::integer, "p_updated_by" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_version INT;
  v_next_version INT;
BEGIN
  SELECT version INTO v_current_version
  FROM public.projects
  WHERE id = p_id AND (deleted IS NOT TRUE);

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Concurrency conflict: current version is %, expected %', v_current_version, p_expected_version
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE project_id = p_id AND (deleted IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'Não é possível eliminar o projeto porque existem tarefas ativas associadas.'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_materials
    WHERE project_id = p_id AND (deleted IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'Não é possível eliminar o projeto porque existem materiais associados.'
      USING ERRCODE = 'P0001';
  END IF;

  v_next_version := v_current_version + 1;
  UPDATE public.projects
  SET deleted = TRUE, version = v_next_version, updated_by = p_updated_by, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_id;
  RETURN v_next_version;
END;
$$;


ALTER FUNCTION "public"."delete_project_transaction"("p_id" "uuid", "p_expected_version" integer, "p_updated_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_task_atomic"("p_id" "uuid", "p_expected_version" integer DEFAULT NULL::integer, "p_updated_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
  v_caller_user_id UUID;
BEGIN
  -- 1. Authorization check
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:delete', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
    END IF;

    -- Resolve caller profile in public.users to preserve FK integrity (tasks.updated_by -> users.id)
    SELECT id INTO v_caller_user_id
    FROM public.users
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND approved = TRUE AND deleted = FALSE;

    -- Non-admin cannot forge updated_by
    IF p_updated_by IS NOT NULL AND p_updated_by <> v_caller_user_id AND p_updated_by <> auth.uid() AND NOT public.is_admin() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    ELSIF p_updated_by IS NULL OR p_updated_by = auth.uid() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    END IF;
  ELSIF p_updated_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:delete', p_updated_by) THEN
      RAISE EXCEPTION 'Sem permissão para eliminar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Check current task version for OCC
  SELECT version INTO v_current_version
  FROM public.tasks
  WHERE id = p_id AND (deleted IS NOT TRUE) FOR UPDATE;

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' USING ERRCODE = 'P0001';
  END IF;

  -- Historical allocations are retained and no longer prevent soft-delete.

  -- 4. Soft-delete task and increment version
  UPDATE public.tasks
  SET
    deleted = TRUE,
    version = version + 1,
    updated_at = timezone('utc'::text, now()),
    updated_by = p_updated_by
  WHERE id = p_id
  RETURNING * INTO v_task_row;

  RETURN to_jsonb(v_task_row);
END;
$$;


ALTER FUNCTION "public"."delete_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_updated_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."edit_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_version integer;
BEGIN
  v_version := public.edit_mechanical_design_request_v2(
    p_id,p_actor_id,p_expected_version,p_instructions,p_deliverables,p_file_identifier,
    p_file_revision,p_planned_start_date,p_planned_end_date,p_usage_text,p_project_status_id,p_other_manager_ids);
  PERFORM public.save_mechanical_design_requester_priority(p_id,p_requested_for_id,p_priority_id);
  RETURN v_version;
END; $$;


ALTER FUNCTION "public"."edit_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_due_notifications"("p_today" "date" DEFAULT (("now"() AT TIME ZONE 'Europe/Lisbon'::"text"))::"date") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE inserted_count integer := 0;
DECLARE added integer;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id,
    CASE WHEN t.estimated_date < p_today THEN 'Tarefa em atraso: ' WHEN t.estimated_date = p_today THEN 'Tarefa vence hoje: ' ELSE 'Prazo da tarefa: ' END || t.task_title,
    'Data limite: ' || to_char(t.estimated_date, 'DD/MM/YYYY'),
    '/projects?project=' || t.project_id,
    'task_due_date:' || t.id || ':' || t.estimated_date || ':' || CASE WHEN t.estimated_date < p_today THEN 'overdue' WHEN t.estimated_date = p_today THEN 'today' ELSE 'before' END || ':' || r.user_id
  FROM public.tasks t
  JOIN public.projects p ON p.id = t.project_id AND p.deleted IS FALSE
  JOIN public.notification_settings s ON s.type = 'task_due_date' AND s.enabled
  LEFT JOIN public.task_status ts ON ts.id = t.status_id
  CROSS JOIN LATERAL notification_internal.recipients(s.target_group, t.project_id, t.id) r
  WHERE t.deleted IS FALSE AND t.completed_date IS NULL
    AND COALESCE(lower(ts.name), '') NOT LIKE '%complet%'
    AND COALESCE(lower(ts.name), '') NOT LIKE '%conclu%'
    AND (t.estimated_date = p_today OR t.estimated_date = p_today - 1
      OR (s.days_before > 0 AND t.estimated_date = p_today + s.days_before))
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  inserted_count := inserted_count + added;

  INSERT INTO public.notifications (user_id, title, message, link_url, event_key)
  SELECT r.user_id,
    CASE WHEN x.due_date < p_today THEN 'Projeto em atraso: ' WHEN x.due_date = p_today THEN 'Projeto vence hoje: ' ELSE 'Prazo do projeto: ' END || x.project_title,
    'Data: ' || to_char(x.due_date, 'DD/MM/YYYY'),
    '/projects?project=' || x.id,
    x.kind || ':' || x.id || ':' || x.due_date || ':' || CASE WHEN x.due_date < p_today THEN 'overdue' WHEN x.due_date = p_today THEN 'today' ELSE 'before' END || ':' || r.user_id
  FROM (
    SELECT p.id, p.project_title, p.delivery_date AS due_date, s.target_group, s.days_before, s.type AS kind
      FROM public.projects p JOIN public.notification_settings s ON s.type = 'project_due_date' AND s.enabled
    UNION ALL
    SELECT p.id, p.project_title, p.scheduled_date, s.target_group, s.days_before, s.type
      FROM public.projects p JOIN public.notification_settings s ON s.type = 'project_scheduled_date' AND s.enabled
  ) x
  JOIN public.projects p ON p.id = x.id AND p.deleted IS FALSE AND p.completed_date IS NULL
  LEFT JOIN public.project_status ps ON ps.id = p.status_id
  CROSS JOIN LATERAL notification_internal.recipients(x.target_group, x.id) r
  WHERE x.due_date IS NOT NULL
    AND COALESCE(lower(ps.name), '') NOT LIKE '%complet%'
    AND COALESCE(lower(ps.name), '') NOT LIKE '%conclu%'
    AND (x.due_date = p_today OR x.due_date = p_today - 1
      OR (x.days_before > 0 AND x.due_date = p_today + x.days_before))
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN inserted_count + added;
END;
$$;


ALTER FUNCTION "public"."generate_due_notifications"("p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_mechanical_design_assignees_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
 IF EXISTS(SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='mechanical_design')
   AND current_setting('app.mechanical_design_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use o pedido de desenho para atribuir esta tarefa.' USING ERRCODE='42501'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND EXISTS(
   SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=NEW.task_id AND w.kind='mechanical_design')
   AND NOT public.has_permission('mechanical_design.execute',NEW.user_id) THEN
   RAISE EXCEPTION 'O técnico não tem permissão para executar desenho mecânico.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_mechanical_design_assignees_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_mechanical_design_manager_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_owner uuid;
BEGIN
 SELECT area_owner_id INTO v_owner FROM public.work_requests WHERE id=NEW.request_id AND kind='mechanical_design';
 IF v_owner IS NULL THEN RETURN NEW; END IF;
 IF NEW.action IN ('file','deliver') THEN
   IF NOT public.has_permission('mechanical_design.execute',NEW.actor_id) THEN
     RAISE EXCEPTION 'Sem permissão para executar desenho mecânico.' USING ERRCODE='42501'; END IF;
   RETURN NEW;
 END IF;
 IF NEW.action NOT IN ('accept','reject','edit','add_task','assign_task') THEN RETURN NEW; END IF;
 IF NOT public.is_mechanical_design_manager(NEW.actor_id)
   OR NOT public.has_permission('mechanical_design.manage',NEW.actor_id)
   OR (NEW.actor_id<>v_owner AND NOT public.has_permission('mechanical_design.coordinate',NEW.actor_id)) THEN
   RAISE EXCEPTION 'Sem permissão para gerir este pedido de desenho.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_mechanical_design_manager_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_mechanical_design_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.kind = 'mechanical_design' THEN
    IF NOT public.is_mechanical_design_manager(NEW.area_owner_id) THEN
      RAISE EXCEPTION 'O responsável pelo desenho deve ser um gestor de projeto ativo.' USING ERRCODE = '22023';
    END IF;
    IF TG_OP='INSERT' AND NOT public.has_permission('mechanical_design.create',NEW.requester_id) THEN
      RAISE EXCEPTION 'Sem permissão para criar pedidos de desenho.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."guard_mechanical_design_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_mechanical_design_reopen"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id=NEW.request_id AND kind='mechanical_design') THEN RETURN NEW; END IF;
 IF NEW.action='reopen' THEN
   IF NOT public.is_mechanical_design_manager(NEW.actor_id)
      OR NOT public.has_permission('mechanical_design.manage',NEW.actor_id) THEN
     RAISE EXCEPTION 'A reabertura exige o gestor responsável com permissão de gestão.' USING ERRCODE='42501'; END IF;
 ELSIF NEW.action IN ('start','block','resume','complete') THEN
   IF NOT public.has_permission('mechanical_design.execute',NEW.actor_id) THEN
     RAISE EXCEPTION 'Sem permissão para executar desenho mecânico.' USING ERRCODE='42501'; END IF;
 ELSIF NEW.action='assign' THEN
   IF NOT public.has_permission('mechanical_design.manage',NEW.actor_id) THEN
     RAISE EXCEPTION 'Sem permissão para atribuir desenho mecânico.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_mechanical_design_reopen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_mechanical_design_task_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF EXISTS(SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='mechanical_design')
   AND current_setting('app.mechanical_design_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use as ações do pedido de desenho para alterar esta tarefa.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_mechanical_design_task_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_presales_assignees_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
 IF EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='presales')
   AND current_setting('app.presales_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use o pedido Presales para atribuir esta tarefa.' USING ERRCODE='42501';
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND EXISTS (
   SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=NEW.task_id AND w.kind='presales')
   AND NOT public.has_permission('presales.execute',NEW.user_id) THEN
   RAISE EXCEPTION 'Utilizador sem permissão de execução Presales.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_presales_assignees_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_presales_contacts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
 IF NEW.commercial_manager_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.users u JOIN public.user_roles ur ON ur.user_id=u.id
   JOIN public.roles r ON r.id=ur.role_id
   WHERE u.id=NEW.commercial_manager_id AND u.approved AND NOT u.deleted
     AND u.type<>'External' AND r.is_active AND r.code='COMMERCIAL') THEN
   RAISE EXCEPTION 'Gestor comercial inválido.' USING ERRCODE='22023'; END IF;
 IF NEW.project_manager_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.users u JOIN public.user_roles ur ON ur.user_id=u.id
   JOIN public.roles r ON r.id=ur.role_id
   WHERE u.id=NEW.project_manager_id AND u.approved AND NOT u.deleted
     AND u.type<>'External' AND r.is_active AND r.code='PROJECT_MANAGER') THEN
   RAISE EXCEPTION 'Gestor de projeto inválido.' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_presales_contacts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_presales_revision_assets"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE b jsonb;
BEGIN
 FOR b IN SELECT value FROM jsonb_array_elements(NEW.document_snapshot->'blocks') LOOP
   IF b->>'type'='image' AND NOT EXISTS (
     SELECT 1 FROM public.presales_assets a WHERE a.id=(b->>'assetId')::uuid
       AND a.request_id=NEW.request_id) THEN
     RAISE EXCEPTION 'A imagem não pertence a este Presales.' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_presales_revision_assets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_presales_revision_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN
 RAISE EXCEPTION 'A revisão publicada é imutável.' USING ERRCODE='42501';
END $$;


ALTER FUNCTION "public"."guard_presales_revision_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_presales_task_estimate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN RETURN NEW; END $$;


ALTER FUNCTION "public"."guard_presales_task_estimate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_presales_task_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_task_id uuid;
BEGIN
 v_task_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.work_requests w ON w.id=wt.request_id
   WHERE wt.task_id=v_task_id AND w.kind='presales')
   AND current_setting('app.presales_write',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Use as ações Presales para alterar esta tarefa.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."guard_presales_task_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_permission_code" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_auth_uid uuid;
  v_profile record;
  v_canonical_code text;
  v_module text;
  v_action text;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    v_auth_uid := p_user_id;
  END IF;
  IF v_auth_uid IS NULL THEN RETURN false; END IF;
  SELECT id, auth_user_id, role_id, is_admin, approved, deleted, type
  INTO v_profile
  FROM public.users
  WHERE auth_user_id = v_auth_uid OR id = v_auth_uid
  ORDER BY (auth_user_id = v_auth_uid) DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND OR v_profile.approved IS NOT TRUE OR v_profile.deleted IS TRUE
     OR COALESCE(v_profile.type, '') = 'External' THEN
    RETURN false;
  END IF;
  v_canonical_code := replace(p_permission_code, ':', '.');
  v_canonical_code := regexp_replace(v_canonical_code,
    '_(read|write|delete|create|update|manage)$', '.\1');
  v_module := split_part(v_canonical_code, '.', 1);
  v_action := split_part(v_canonical_code, '.', 2);
  IF v_profile.is_admin IS TRUE
     AND v_canonical_code IN ('admin.access', 'config.manage', 'config.read', 'config.write') THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active IS TRUE
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active IS TRUE
    WHERE ur.user_id = v_profile.id
      AND (
        p.code = v_canonical_code
        OR (v_action = 'write' AND p.code IN (v_module || '.create', v_module || '.update'))
        OR (v_action = 'manage' AND p.code = v_module || '.manage')
      )
  );
END;
$_$;


ALTER FUNCTION "public"."has_permission"("p_permission_code" "text", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_permission"("p_permission_code" "text", "p_user_id" "uuid") IS 'RBAC union across active user_roles. Authenticated identity is always derived from auth.uid(); External profiles are denied.';



CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE (auth_user_id = auth.uid() OR id = auth.uid())
          AND is_admin = true
          AND approved = true
          AND deleted = false
    );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE (auth_user_id = auth.uid() OR id = auth.uid())
          AND approved = true
          AND deleted = false
    );
END;
$$;


ALTER FUNCTION "public"."is_approved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_mechanical_design_manager"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE u.id = p_user_id AND u.approved IS TRUE AND u.deleted IS FALSE
      AND u.type <> 'External' AND r.code = 'PROJECT_MANAGER' AND r.is_active IS TRUE
  );
$$;


ALTER FUNCTION "public"."is_mechanical_design_manager"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_calendar_feed_events"("p_scope" "text", "p_user_id" "uuid") RETURNS TABLE("task_id" "uuid", "project_id" "uuid", "task_title" "text", "start_date" "date", "end_date" "date", "estimated_date" "date", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "version" integer, "client_id" "uuid", "client_name" "text", "install_project_no" "text", "project_updated_at" timestamp with time zone, "client_updated_at" timestamp with time zone, "assignees" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT t.id, t.project_id, t.task_title,
    t.start_date, t.end_date, t.estimated_date,
    t.created_at, t.updated_at, t.version,
    p.client_id, c.client_name, p.install_project_no,
    p.updated_at, c.updated_at,
    COALESCE(a.assignees, '[]'::jsonb)
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  LEFT JOIN public.clients c ON c.id = p.client_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', u.id, 'name', u.name, 'updated_at', NULL
    ) ORDER BY ta.user_id) AS assignees,
    bool_or(ta.user_id = p_user_id) AS has_owner
    FROM public.task_assignees ta
    JOIN public.users u ON u.id = ta.user_id
    WHERE ta.task_id = t.id
  ) a ON TRUE
  WHERE t.deleted IS FALSE
    AND ((t.start_date IS NOT NULL AND t.end_date IS NOT NULL) OR t.estimated_date IS NOT NULL)
    AND (p_scope = 'all' OR (p_scope = 'mine' AND COALESCE(a.has_owner, FALSE)))
  ORDER BY t.id;
$$;


ALTER FUNCTION "public"."list_calendar_feed_events"("p_scope" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_integration_changes"("p_kind" "text", "p_client_ids" "uuid"[], "p_project_ids" "uuid"[], "p_project_id" "uuid", "p_since" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) RETURNS TABLE("id" "uuid", "changed_at" timestamp with time zone, "deleted" boolean, "data" "jsonb")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF p_kind NOT IN ('projects', 'tasks') OR p_limit < 1 OR p_limit > 100
    OR p_since IS NULL OR (p_cursor_at IS NULL) <> (p_cursor_id IS NULL)
    OR (cardinality(p_client_ids) + cardinality(p_project_ids)) = 0 THEN
    RAISE EXCEPTION 'Invalid integration changes request' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'projects' THEN
    RETURN QUERY
    SELECT p.id, COALESCE(p.updated_at, p.created_at), p.deleted,
      CASE WHEN p.deleted THEN NULL ELSE to_jsonb(p) END
    FROM public.projects p
    WHERE (p.client_id = ANY(p_client_ids) OR p.id = ANY(p_project_ids))
      AND ((p_cursor_at IS NULL AND COALESCE(p.updated_at, p.created_at) > p_since)
        OR (p_cursor_at IS NOT NULL AND
          (COALESCE(p.updated_at, p.created_at), p.id) > (p_cursor_at, p_cursor_id)))
    ORDER BY COALESCE(p.updated_at, p.created_at), p.id
    LIMIT p_limit + 1;
  ELSE
    IF p_project_id IS NULL THEN
      RAISE EXCEPTION 'projectId required for tasks' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT t.id, COALESCE(t.updated_at, t.created_at), t.deleted,
      CASE WHEN t.deleted THEN NULL ELSE to_jsonb(t) END
    FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.project_id = p_project_id
      AND (p.client_id = ANY(p_client_ids) OR p.id = ANY(p_project_ids))
      AND ((p_cursor_at IS NULL AND COALESCE(t.updated_at, t.created_at) > p_since)
        OR (p_cursor_at IS NOT NULL AND
          (COALESCE(t.updated_at, t.created_at), t.id) > (p_cursor_at, p_cursor_id)))
    ORDER BY COALESCE(t.updated_at, t.created_at), t.id
    LIMIT p_limit + 1;
  END IF;
END;
$$;


ALTER FUNCTION "public"."list_integration_changes"("p_kind" "text", "p_client_ids" "uuid"[], "p_project_ids" "uuid"[], "p_project_id" "uuid", "p_since" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_assignee_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_instructions" "text" DEFAULT NULL::"text", "p_deliverables" "text" DEFAULT NULL::"text", "p_file_identifier" "text" DEFAULT NULL::"text", "p_file_revision" "text" DEFAULT NULL::"text", "p_estimated_days" numeric DEFAULT NULL::numeric, "p_planned_start_date" "date" DEFAULT NULL::"date", "p_planned_end_date" "date" DEFAULT NULL::"date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_request public.work_requests%ROWTYPE; v_actor uuid; v_uid uuid; v_initial_task uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente.' USING ERRCODE = 'P0002'; END IF;
  IF v_request.version <> p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE = '40001'; END IF;
  IF p_action NOT IN ('deliver','file') AND v_actor <> v_request.area_owner_id
     AND NOT public.has_permission('mechanical_design.coordinate', v_actor) THEN
    RAISE EXCEPTION 'Apenas o responsável da área pode gerir o pedido.' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'accept' AND v_request.status = 'submitted' THEN
    IF coalesce(array_length(p_assignee_ids,1),0) = 0 THEN RAISE EXCEPTION 'Indique um desenhador.' USING ERRCODE = '22023'; END IF;
    IF v_request.planned_start_date IS NULL OR v_request.planned_end_date IS NULL THEN
      RAISE EXCEPTION 'Defina o prazo previsto antes de aceitar.' USING ERRCODE='22023';
    END IF;
    IF p_estimated_days IS NULL OR p_estimated_days NOT BETWEEN 0.5 AND 999 OR p_estimated_days * 2 <> trunc(p_estimated_days * 2) THEN
      RAISE EXCEPTION 'Estimativa em meios dias obrigatória.' USING ERRCODE='22023';
    END IF;
    SELECT task_id INTO v_initial_task FROM public.work_request_tasks WHERE request_id=p_id AND is_initial;
    UPDATE public.work_request_tasks SET estimated_days=p_estimated_days WHERE task_id=v_initial_task;
    PERFORM set_config('app.mechanical_design_write','on',true);
    FOREACH v_uid IN ARRAY p_assignee_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=v_uid AND approved IS TRUE AND deleted IS FALSE AND type <> 'External') THEN
        RAISE EXCEPTION 'Desenhador inválido.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_initial_task,v_uid) ON CONFLICT DO NOTHING;
    END LOOP;
    UPDATE public.tasks SET version=version+1,updated_by=v_actor,updated_at=now() WHERE id=v_initial_task;
    UPDATE public.work_requests SET status='accepted',version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'reject' AND v_request.status = 'submitted' THEN
    UPDATE public.work_requests SET status='rejected',version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'edit' AND v_request.status IN ('submitted','accepted') THEN
    UPDATE public.mechanical_design_details SET instructions=coalesce(p_instructions,instructions),
      deliverables=coalesce(p_deliverables,deliverables),
      file_identifier=coalesce(p_file_identifier,file_identifier),
      file_revision=coalesce(p_file_revision,file_revision) WHERE request_id=p_id;
    UPDATE public.work_requests SET planned_start_date=coalesce(p_planned_start_date,planned_start_date),
      planned_end_date=coalesce(p_planned_end_date,planned_end_date),version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'file' AND v_request.status = 'accepted' THEN
    IF NOT EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id=wt.task_id
      WHERE wt.request_id=p_id AND ta.user_id=v_actor) THEN
      RAISE EXCEPTION 'Apenas um desenhador atribuído pode registar a entrega.' USING ERRCODE='42501';
    END IF;
    IF btrim(coalesce(p_file_identifier,''))='' OR btrim(coalesce(p_file_revision,''))='' THEN
      RAISE EXCEPTION 'Indique ficheiro e revisão.' USING ERRCODE='22023';
    END IF;
    UPDATE public.mechanical_design_details SET file_identifier=p_file_identifier,file_revision=p_file_revision WHERE request_id=p_id;
    UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'deliver' AND v_request.status = 'accepted' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mechanical_design_details WHERE request_id=p_id
      AND btrim(file_identifier) <> '' AND btrim(file_revision) <> '') THEN
      RAISE EXCEPTION 'Indique ficheiro e revisão antes da entrega.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.tasks t ON t.id=wt.task_id
      WHERE wt.request_id=p_id AND (t.deleted IS TRUE OR t.status_id::text <> '99999999-9999-9999-9999-999999999903')) THEN
      RAISE EXCEPTION 'Conclua todas as tarefas antes da entrega.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.work_request_tasks wt JOIN public.task_assignees ta ON ta.task_id=wt.task_id
      WHERE wt.request_id=p_id AND ta.user_id=v_actor) THEN
      RAISE EXCEPTION 'A entrega deve ser confirmada por um desenhador atribuído.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.work_requests SET status='delivered',delivered_by=v_actor,delivered_at=now(),
      version=version+1,updated_at=now() WHERE id=p_id;
  ELSE
    RAISE EXCEPTION 'Transição inválida.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,p_action,v_actor);
  RETURN p_expected_version+1;
END; $$;


ALTER FUNCTION "public"."manage_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_assignee_ids" "uuid"[], "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_estimated_days" numeric, "p_planned_start_date" "date", "p_planned_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mechanical_design_actor"("p_actor_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_profile_id uuid;
BEGIN
  SELECT id INTO v_profile_id FROM public.users
  WHERE id = p_actor_id AND approved IS TRUE AND deleted IS FALSE AND type <> 'External';
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Utilizador não autorizado.' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_profile_id AND (auth_user_id = auth.uid() OR id = auth.uid())
  ) THEN RAISE EXCEPTION 'Identidade inválida.' USING ERRCODE = '42501'; END IF;
  RETURN v_profile_id;
END; $$;


ALTER FUNCTION "public"."mechanical_design_actor"("p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mechanical_design_task_action"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_task_version" integer, "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor uuid; v_request public.work_requests%ROWTYPE; v_task public.tasks%ROWTYPE; v_next uuid;
BEGIN
  v_actor := public.mechanical_design_actor(p_actor_id);
  SELECT * INTO v_request FROM public.work_requests WHERE id=p_request_id AND kind='mechanical_design' FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'accepted' THEN RAISE EXCEPTION 'Pedido não aceite.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks WHERE request_id=p_request_id AND task_id=p_task_id) THEN
    RAISE EXCEPTION 'Tarefa não pertence ao pedido.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_task FROM public.tasks WHERE id=p_task_id AND deleted IS NOT TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa inexistente.' USING ERRCODE='P0002'; END IF;
  IF v_task.version <> p_expected_task_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
  IF p_action='reopen' THEN
    IF v_actor <> v_request.area_owner_id OR length(btrim(coalesce(p_reason,''))) < 5
      OR v_task.status_id::text <> '99999999-9999-9999-9999-999999999903' THEN
      RAISE EXCEPTION 'Reabertura exige responsável, tarefa concluída e justificação.' USING ERRCODE='42501';
    END IF;
    v_next := '99999999-9999-9999-9999-999999999902'::uuid;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.task_assignees WHERE task_id=p_task_id AND user_id=v_actor) THEN
      RAISE EXCEPTION 'Técnico não atribuído.' USING ERRCODE='42501';
    END IF;
    IF p_action='start' AND v_task.status_id::text='99999999-9999-9999-9999-999999999901' THEN
      v_next := '99999999-9999-9999-9999-999999999902'::uuid;
    ELSIF p_action='block' AND v_task.status_id::text='99999999-9999-9999-9999-999999999902' THEN
      v_next := '99999999-9999-9999-9999-999999999904'::uuid;
    ELSIF p_action='resume' AND v_task.status_id::text='99999999-9999-9999-9999-999999999904' THEN
      v_next := '99999999-9999-9999-9999-999999999902'::uuid;
    ELSIF p_action='complete' AND v_task.status_id::text IN
      ('99999999-9999-9999-9999-999999999902','99999999-9999-9999-9999-999999999904') THEN
      v_next := '99999999-9999-9999-9999-999999999903'::uuid;
    ELSE RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
  END IF;
  PERFORM set_config('app.mechanical_design_write','on',true);
  UPDATE public.tasks SET status_id=v_next,version=version+1,updated_by=v_actor,updated_at=now(),
    completed_date=CASE WHEN p_action='complete' THEN current_date WHEN p_action='reopen' THEN NULL ELSE completed_date END
    WHERE id=p_task_id;
  INSERT INTO public.work_task_events(task_id,request_id,action,actor_id,reason)
  VALUES(p_task_id,p_request_id,p_action,v_actor,p_reason);
  RETURN p_expected_task_version+1;
END; $$;


ALTER FUNCTION "public"."mechanical_design_task_action"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_task_version" integer, "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."planning_allocation_tsrange"("d" "date", "s_time" time without time zone, "e_time" time without time zone) RETURNS "tsrange"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
    RETURN tsrange((d + s_time), (d + e_time), '[)');
END;
$$;


ALTER FUNCTION "public"."planning_allocation_tsrange"("d" "date", "s_time" time without time zone, "e_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."presales_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE w public.work_requests%ROWTYPE; actor uuid; v_task_id uuid; task_row public.tasks%ROWTYPE;
 owner uuid; member uuid; members uuid[]; item_id uuid; next_status uuid; next_revision integer;
 document jsonb; block jsonb; referenced_id text; contact_snapshot jsonb;
BEGIN
 actor := public.mechanical_design_actor(p_actor_id);
 IF p_action='create' THEN
   IF NOT public.has_permission('presales.create',actor) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
   IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 2 AND 200 THEN
     RAISE EXCEPTION 'Nome inválido.' USING ERRCODE='22023'; END IF;
   owner := (p_payload->>'ownerId')::uuid;
   IF NOT public.has_permission('presales.manage',owner) OR NOT EXISTS (
     SELECT 1 FROM public.users WHERE id=owner AND approved AND NOT deleted AND type<>'External') THEN
     RAISE EXCEPTION 'Responsável Presales inválido.' USING ERRCODE='22023'; END IF;
   IF p_payload->>'plannedStartDate' IS NULL OR p_payload->>'plannedEndDate' IS NULL OR
      (p_payload->>'plannedEndDate')::date < (p_payload->>'plannedStartDate')::date THEN
     RAISE EXCEPTION 'Prazo inválido.' USING ERRCODE='22023'; END IF;
   INSERT INTO public.work_requests(id,kind,title,requester_id,area_owner_id,planned_start_date,planned_end_date)
   VALUES(p_id,'presales',btrim(p_payload->>'title'),actor,owner,
     (p_payload->>'plannedStartDate')::date,(p_payload->>'plannedEndDate')::date);
   INSERT INTO public.presales_details(request_id,technical_requirements,technical_outcome,commercial_manager_id,project_manager_id)
   VALUES(p_id,coalesce(p_payload->>'requirements',''),coalesce(p_payload->>'outcome',''),
     nullif(p_payload->>'commercialManagerId','')::uuid,nullif(p_payload->>'projectManagerId','')::uuid);
   v_task_id := gen_random_uuid();
   INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
   VALUES(v_task_id,NULL,'Preparação técnica: ' || btrim(p_payload->>'title'),coalesce(p_payload->>'requirements',''),
     '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333309'::uuid,1,actor,actor,FALSE);
   INSERT INTO public.work_request_tasks(request_id,task_id,is_initial) VALUES(p_id,v_task_id,TRUE);
   INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,'create',actor);
   RETURN 1;
 END IF;
 SELECT * INTO w FROM public.work_requests WHERE id=p_id AND kind='presales' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Presales inexistente.' USING ERRCODE='P0002'; END IF;
 IF w.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
 IF p_action='task_action' THEN
   v_task_id := (p_payload->>'taskId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks wt WHERE wt.request_id=p_id AND wt.task_id=v_task_id) THEN
     RAISE EXCEPTION 'Tarefa inválida.' USING ERRCODE='22023'; END IF;
   SELECT * INTO task_row FROM public.tasks WHERE id=v_task_id AND NOT deleted FOR UPDATE;
   IF task_row.version<>(p_payload->>'taskVersion')::integer OR w.status<>'accepted' THEN
     RAISE EXCEPTION 'Tarefa alterada ou pedido não aceite.' USING ERRCODE='40001'; END IF;
   IF p_payload->>'taskAction'='reopen' THEN
     IF actor<>w.area_owner_id OR NOT public.has_permission('presales.manage',actor)
       OR length(btrim(coalesce(p_payload->>'reason','')))<5
       OR task_row.status_id::text<>'99999999-9999-9999-9999-999999999903' THEN
       RAISE EXCEPTION 'Reabertura inválida.' USING ERRCODE='42501'; END IF;
     next_status := '99999999-9999-9999-9999-999999999902'::uuid;
   ELSE
     IF NOT public.has_permission('presales.execute',actor) OR NOT EXISTS(
       SELECT 1 FROM public.task_assignees ta WHERE ta.task_id=v_task_id AND ta.user_id=actor) THEN
       RAISE EXCEPTION 'Técnico não atribuído.' USING ERRCODE='42501'; END IF;
     CASE p_payload->>'taskAction'
       WHEN 'start' THEN IF task_row.status_id::text='99999999-9999-9999-9999-999999999901' THEN next_status:='99999999-9999-9999-9999-999999999902'::uuid; END IF;
       WHEN 'block' THEN IF task_row.status_id::text='99999999-9999-9999-9999-999999999902' THEN next_status:='99999999-9999-9999-9999-999999999904'::uuid; END IF;
       WHEN 'resume' THEN IF task_row.status_id::text='99999999-9999-9999-9999-999999999904' THEN next_status:='99999999-9999-9999-9999-999999999902'::uuid; END IF;
       WHEN 'complete' THEN IF task_row.status_id::text IN ('99999999-9999-9999-9999-999999999902','99999999-9999-9999-9999-999999999904') THEN next_status:='99999999-9999-9999-9999-999999999903'::uuid; END IF;
     END CASE;
     IF next_status IS NULL THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
   END IF;
   PERFORM set_config('app.presales_write','on',true);
   UPDATE public.tasks SET status_id=next_status,version=version+1,updated_by=actor,updated_at=now(),
     completed_date=CASE WHEN p_payload->>'taskAction'='complete' THEN current_date
       WHEN p_payload->>'taskAction'='reopen' THEN NULL ELSE completed_date END WHERE id=v_task_id;
   INSERT INTO public.work_task_events(task_id,request_id,action,actor_id,reason)
   VALUES(v_task_id,p_id,p_payload->>'taskAction',actor,p_payload->>'reason');
 ELSE
   IF NOT public.has_permission('presales.manage',actor) OR
      (actor<>w.area_owner_id AND NOT public.has_permission('presales.coordinate',actor)) THEN
     RAISE EXCEPTION 'Sem permissão para gerir Presales.' USING ERRCODE='42501'; END IF;
   CASE p_action
     WHEN 'accept' THEN
       IF w.status<>'submitted' THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       members := ARRAY(SELECT jsonb_array_elements_text(p_payload->'assigneeIds')::uuid);
       IF coalesce(array_length(members,1),0)=0 OR (p_payload->>'estimatedDays')::numeric NOT BETWEEN 0.5 AND 999
         OR (p_payload->>'estimatedDays')::numeric*2<>trunc((p_payload->>'estimatedDays')::numeric*2) THEN
         RAISE EXCEPTION 'Atribuição e estimativa obrigatórias.' USING ERRCODE='22023'; END IF;
       SELECT wt.task_id INTO v_task_id FROM public.work_request_tasks wt WHERE wt.request_id=p_id AND wt.is_initial;
       UPDATE public.work_request_tasks SET estimated_days=(p_payload->>'estimatedDays')::numeric WHERE task_id=v_task_id;
       PERFORM set_config('app.presales_write','on',true);
       FOREACH member IN ARRAY members LOOP
         IF NOT public.has_permission('presales.execute',member) OR NOT EXISTS(
           SELECT 1 FROM public.users WHERE id=member AND approved AND NOT deleted AND type<>'External') THEN
           RAISE EXCEPTION 'Executor inválido.' USING ERRCODE='22023'; END IF;
         INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task_id,member) ON CONFLICT DO NOTHING;
       END LOOP;
       UPDATE public.tasks SET version=version+1,updated_by=actor,updated_at=now() WHERE id=v_task_id;
       UPDATE public.work_requests SET status='accepted' WHERE id=p_id;
     WHEN 'edit' THEN
       IF w.status NOT IN ('submitted','accepted','suspended') THEN RAISE EXCEPTION 'Pedido fechado.' USING ERRCODE='22023'; END IF;
       IF (p_payload->>'plannedEndDate')::date < (p_payload->>'plannedStartDate')::date THEN
         RAISE EXCEPTION 'Prazo inválido.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET title=btrim(p_payload->>'title'),
         planned_start_date=(p_payload->>'plannedStartDate')::date,planned_end_date=(p_payload->>'plannedEndDate')::date WHERE id=p_id;
       UPDATE public.presales_details SET technical_requirements=coalesce(p_payload->>'requirements',''),
         technical_outcome=coalesce(p_payload->>'outcome',''),
         commercial_manager_id=nullif(p_payload->>'commercialManagerId','')::uuid,
         project_manager_id=nullif(p_payload->>'projectManagerId','')::uuid WHERE request_id=p_id;
     WHEN 'suspend' THEN
       IF w.status<>'accepted' THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status='suspended' WHERE id=p_id;
     WHEN 'resume' THEN
       IF w.status<>'suspended' THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status='accepted' WHERE id=p_id;
     WHEN 'won' THEN
       IF w.status NOT IN ('accepted','suspended') THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status=p_action,delivered_by=actor,delivered_at=now() WHERE id=p_id;
     WHEN 'lost' THEN
       IF w.status NOT IN ('accepted','suspended') THEN RAISE EXCEPTION 'Transição inválida.' USING ERRCODE='22023'; END IF;
       UPDATE public.work_requests SET status=p_action,delivered_by=actor,delivered_at=now() WHERE id=p_id;
     WHEN 'add_task' THEN
       IF w.status<>'accepted' THEN RAISE EXCEPTION 'Pedido não aceite.' USING ERRCODE='22023'; END IF;
       v_task_id := gen_random_uuid();
       INSERT INTO public.tasks(id,project_id,task_title,task_description,status_id,task_type_id,version,created_by,updated_by,deleted)
       VALUES(v_task_id,NULL,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),
         '99999999-9999-9999-9999-999999999901'::uuid,'33333333-3333-3333-3333-333333333309'::uuid,1,actor,actor,FALSE);
       INSERT INTO public.work_request_tasks(request_id,task_id,estimated_days)
       VALUES(p_id,v_task_id,(p_payload->>'estimatedDays')::numeric);
       members := ARRAY(SELECT jsonb_array_elements_text(p_payload->'assigneeIds')::uuid);
       IF coalesce(array_length(members,1),0)=0 THEN RAISE EXCEPTION 'Executor obrigatório.' USING ERRCODE='22023'; END IF;
       PERFORM set_config('app.presales_write','on',true);
       FOREACH member IN ARRAY members LOOP
         IF NOT public.has_permission('presales.execute',member) THEN RAISE EXCEPTION 'Executor inválido.' USING ERRCODE='22023'; END IF;
         INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task_id,member) ON CONFLICT DO NOTHING;
       END LOOP;
     WHEN 'assign_task' THEN
       IF w.status<>'accepted' THEN RAISE EXCEPTION 'Pedido não aceite.' USING ERRCODE='22023'; END IF;
       v_task_id := (p_payload->>'taskId')::uuid;
       IF NOT EXISTS(SELECT 1 FROM public.work_request_tasks wt WHERE wt.request_id=p_id AND wt.task_id=v_task_id) THEN
         RAISE EXCEPTION 'Tarefa inválida.' USING ERRCODE='22023'; END IF;
       members := ARRAY(SELECT jsonb_array_elements_text(p_payload->'assigneeIds')::uuid);
       IF coalesce(array_length(members,1),0)=0 THEN RAISE EXCEPTION 'Executor obrigatório.' USING ERRCODE='22023'; END IF;
       PERFORM set_config('app.presales_write','on',true);
       DELETE FROM public.task_assignees WHERE task_id=v_task_id;
       FOREACH member IN ARRAY members LOOP
         IF NOT public.has_permission('presales.execute',member) THEN RAISE EXCEPTION 'Executor inválido.' USING ERRCODE='22023'; END IF;
         INSERT INTO public.task_assignees(task_id,user_id) VALUES(v_task_id,member) ON CONFLICT DO NOTHING;
       END LOOP;
       UPDATE public.tasks SET version=version+1,updated_by=actor,updated_at=now() WHERE id=v_task_id;
     WHEN 'save_document' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'Crie uma nova revisão antes de alterar o documento.' USING ERRCODE='22023'; END IF;
       document := p_payload->'document';
       IF jsonb_typeof(document)<>'object' OR document->>'schemaVersion'<>'1'
         OR jsonb_typeof(document->'blocks')<>'array' OR jsonb_array_length(document->'blocks')>100
         OR length(document::text)>250000 THEN RAISE EXCEPTION 'Documento inválido.' USING ERRCODE='22023'; END IF;
       UPDATE public.presales_details SET document_draft=document,document_version=document_version+1 WHERE request_id=p_id;
     WHEN 'save_item' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'Crie uma nova revisão antes de alterar as linhas.' USING ERRCODE='22023'; END IF;
       item_id := coalesce((p_payload->>'id')::uuid,gen_random_uuid());
       IF EXISTS(SELECT 1 FROM public.presales_items WHERE id=item_id AND request_id<>p_id) THEN
         RAISE EXCEPTION 'Linha pertence a outro pedido.' USING ERRCODE='42501'; END IF;
       IF (p_payload->>'quantity')::numeric<=0 OR (p_payload->>'unitPrice')::numeric<0 THEN
         RAISE EXCEPTION 'Linha inválida.' USING ERRCODE='22023'; END IF;
       INSERT INTO public.presales_items(id,request_id,title,unit,quantity,unit_price,group_label,sort_order)
       VALUES(item_id,p_id,btrim(p_payload->>'title'),coalesce(p_payload->>'unit','un'),
         (p_payload->>'quantity')::numeric,(p_payload->>'unitPrice')::numeric,
         coalesce(p_payload->>'groupLabel',''),coalesce((p_payload->>'sortOrder')::integer,0))
       ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,unit=EXCLUDED.unit,quantity=EXCLUDED.quantity,
         unit_price=EXCLUDED.unit_price,group_label=EXCLUDED.group_label,sort_order=EXCLUDED.sort_order
       WHERE public.presales_items.request_id=p_id;
     WHEN 'delete_item' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'Crie uma nova revisão antes de alterar as linhas.' USING ERRCODE='22023'; END IF;
       DELETE FROM public.presales_items WHERE id=(p_payload->>'id')::uuid AND request_id=p_id;
       IF NOT FOUND THEN RAISE EXCEPTION 'Linha inexistente.' USING ERRCODE='P0002'; END IF;
     WHEN 'publish' THEN
       IF (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'A revisão atual já foi publicada.' USING ERRCODE='22023'; END IF;
       SELECT document_draft INTO document FROM public.presales_details WHERE request_id=p_id;
       FOR block IN SELECT value FROM jsonb_array_elements(document->'blocks') LOOP
         IF block->>'type'='item_summary' THEN
           FOR referenced_id IN SELECT jsonb_array_elements_text(block->'itemIds') LOOP
             IF NOT EXISTS(SELECT 1 FROM public.presales_items WHERE id=referenced_id::uuid AND request_id=p_id) THEN
               RAISE EXCEPTION 'O documento refere uma linha inexistente.' USING ERRCODE='22023'; END IF;
           END LOOP;
         END IF;
       END LOOP;
       SELECT coalesce(max(revision_number),0)+1 INTO next_revision
       FROM public.presales_document_revisions WHERE request_id=p_id;
       SELECT jsonb_build_object('commercialManager',jsonb_build_object('id',c.id,'name',c.name,'email',c.email),
         'projectManager',jsonb_build_object('id',m.id,'name',m.name,'email',m.email)) INTO contact_snapshot
       FROM public.presales_details d LEFT JOIN public.users c ON c.id=d.commercial_manager_id
       LEFT JOIN public.users m ON m.id=d.project_manager_id WHERE d.request_id=p_id;
       INSERT INTO public.presales_document_revisions(request_id,revision_number,document_snapshot,items_snapshot,contacts_snapshot,published_by)
       SELECT p_id,next_revision,document,
         coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'unit',i.unit,
           'quantity',i.quantity,'unitPrice',i.unit_price,'groupLabel',i.group_label,'sortOrder',i.sort_order,
           'total',round(i.quantity*i.unit_price,2)) ORDER BY i.sort_order,i.id)
           FROM public.presales_items i WHERE i.request_id=p_id),'[]'::jsonb),contact_snapshot,actor;
       UPDATE public.presales_details SET document_locked=TRUE WHERE request_id=p_id;
     WHEN 'new_revision' THEN
       IF NOT (SELECT document_locked FROM public.presales_details WHERE request_id=p_id) THEN
         RAISE EXCEPTION 'A revisão atual ainda está em edição.' USING ERRCODE='22023'; END IF;
       SELECT document_snapshot INTO document FROM public.presales_document_revisions
         WHERE request_id=p_id ORDER BY revision_number DESC LIMIT 1;
       UPDATE public.presales_details SET document_draft=document,document_locked=FALSE,
         document_version=document_version+1 WHERE request_id=p_id;
     WHEN 'link_project' THEN
       IF w.status<>'won' OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=(p_payload->>'projectId')::uuid AND NOT deleted) THEN
         RAISE EXCEPTION 'Projeto de execução inválido.' USING ERRCODE='22023'; END IF;
       UPDATE public.presales_details SET execution_project_id=(p_payload->>'projectId')::uuid WHERE request_id=p_id;
     ELSE RAISE EXCEPTION 'Operação inválida.' USING ERRCODE='22023';
   END CASE;
   INSERT INTO public.work_request_events(request_id,action,actor_id) VALUES(p_id,p_action,actor);
 END IF;
 UPDATE public.work_requests SET version=version+1,updated_at=now() WHERE id=p_id;
 RETURN p_expected_version+1;
END $$;


ALTER FUNCTION "public"."presales_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."presales_mutate_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE result_version integer; origin_value text; priority_value uuid;
BEGIN
  IF p_action IN ('create','edit') THEN
    origin_value:=nullif(p_payload->>'originCode','');
    priority_value:=nullif(p_payload->>'priorityId','')::uuid;
    IF origin_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.presales_origins WHERE code=origin_value AND active) THEN
      RAISE EXCEPTION 'Origem Presales inválida.' USING ERRCODE='22023';
    END IF;
    IF priority_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_priority WHERE id=priority_value AND NOT deleted) THEN
      RAISE EXCEPTION 'Prioridade inválida.' USING ERRCODE='22023';
    END IF;
    IF length(coalesce(p_payload->>'opportunitySf',''))>300 THEN RAISE EXCEPTION 'Oportunidade SF demasiado longa.' USING ERRCODE='22023'; END IF;
  END IF;
  result_version:=public.presales_mutate(p_id,p_actor_id,p_expected_version,p_action,p_payload);
  IF p_action IN ('create','edit') THEN
    UPDATE public.presales_details SET origin_code=origin_value,priority_id=priority_value,
      opportunity_sf=coalesce(p_payload->>'opportunitySf','') WHERE request_id=p_id;
  END IF;
  RETURN result_version;
END $$;


ALTER FUNCTION "public"."presales_mutate_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."presales_registry_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE actor uuid; owner uuid; current_row public.work_requests%ROWTYPE; client uuid; priority uuid;
  commercial uuid; manager uuid; next_status text;
BEGIN
 actor:=public.mechanical_design_actor(p_actor_id);
 IF p_action NOT IN ('create','edit') THEN RAISE EXCEPTION 'Ação inválida.' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 2 AND 200 OR
    length(coalesce(p_payload->>'description',''))>10000 THEN RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE='22023'; END IF;
 client:=nullif(p_payload->>'clientId','')::uuid;
 priority:=nullif(p_payload->>'priorityId','')::uuid;
 commercial:=nullif(p_payload->>'commercialManagerId','')::uuid;
 manager:=nullif(p_payload->>'projectManagerId','')::uuid;
 IF client IS NULL OR NOT EXISTS(SELECT 1 FROM public.clients WHERE id=client AND NOT deleted) THEN
   RAISE EXCEPTION 'Cliente inválido.' USING ERRCODE='22023'; END IF;
 IF priority IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_priority WHERE id=priority AND NOT deleted) THEN
   RAISE EXCEPTION 'Prioridade inválida.' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'originCode','') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.presales_origins WHERE code=p_payload->>'originCode' AND active) THEN
   RAISE EXCEPTION 'Origem inválida.' USING ERRCODE='22023'; END IF;
 IF (p_payload->>'completedOn')::date < (p_payload->>'startedOn')::date THEN
   RAISE EXCEPTION 'Data de conclusão anterior ao início.' USING ERRCODE='22023'; END IF;
 IF (p_payload->>'potentialValue')::numeric<0 OR (p_payload->>'saleValue')::numeric<0 THEN
   RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='22023'; END IF;
 next_status:=coalesce(p_payload->>'status','accepted');
 IF next_status NOT IN ('accepted','suspended','won','lost') THEN RAISE EXCEPTION 'Estado inválido.' USING ERRCODE='22023'; END IF;
 IF p_action='create' THEN
   IF NOT public.has_permission('presales.create',actor) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
   owner:=coalesce(manager,actor);
   IF NOT public.has_permission('presales.manage',owner) THEN RAISE EXCEPTION 'Gestor de projeto inválido.' USING ERRCODE='22023'; END IF;
   INSERT INTO public.work_requests(id,kind,title,status,requester_id,area_owner_id)
     VALUES(p_id,'presales',btrim(p_payload->>'title'),next_status,actor,owner);
   INSERT INTO public.presales_details(request_id) VALUES(p_id);
 ELSE
   SELECT * INTO current_row FROM public.work_requests WHERE id=p_id AND kind='presales' AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Processo inexistente.' USING ERRCODE='P0002'; END IF;
   IF current_row.version<>p_expected_version THEN RAISE EXCEPTION 'Versão desatualizada.' USING ERRCODE='40001'; END IF;
   IF NOT public.has_permission('presales.manage',actor) OR
     (current_row.area_owner_id<>actor AND NOT public.has_permission('presales.coordinate',actor)) THEN
     RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
   owner:=coalesce(manager,current_row.area_owner_id);
   IF NOT public.has_permission('presales.manage',owner) THEN RAISE EXCEPTION 'Gestor de projeto inválido.' USING ERRCODE='22023'; END IF;
   UPDATE public.work_requests SET title=btrim(p_payload->>'title'),status=next_status,
     area_owner_id=owner,version=version+1,updated_at=now() WHERE id=p_id;
 END IF;
 UPDATE public.presales_details SET client_id=client,request_description=coalesce(p_payload->>'description',''),
   origin_code=nullif(p_payload->>'originCode',''),priority_id=priority,
   commercial_manager_id=commercial,project_manager_id=manager,
   started_on=nullif(p_payload->>'startedOn','')::date,completed_on=nullif(p_payload->>'completedOn','')::date,
   potential_value=nullif(p_payload->>'potentialValue','')::numeric,
   sale_date=nullif(p_payload->>'saleDate','')::date,sale_value=nullif(p_payload->>'saleValue','')::numeric
   WHERE request_id=p_id;
 RETURN CASE WHEN p_action='create' THEN 1 ELSE p_expected_version+1 END;
END $$;


ALTER FUNCTION "public"."presales_registry_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_mechanical_design_project_fields"("p_request_id" "uuid", "p_owner_id" "uuid", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."save_mechanical_design_project_fields"("p_request_id" "uuid", "p_owner_id" "uuid", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_mechanical_design_requester_priority"("p_request_id" "uuid", "p_requested_for_id" "uuid", "p_priority_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."save_mechanical_design_requester_priority"("p_request_id" "uuid", "p_requested_for_id" "uuid", "p_priority_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_presales_initial_task"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE previous_setting text;
BEGIN
 IF NEW.technical_requirements IS NOT DISTINCT FROM OLD.technical_requirements THEN RETURN NEW; END IF;
 previous_setting := current_setting('app.presales_write',true);
 PERFORM set_config('app.presales_write','on',true);
 UPDATE public.tasks t SET task_description=NEW.technical_requirements,version=version+1,updated_at=now()
 FROM public.work_request_tasks wt WHERE wt.task_id=t.id AND wt.request_id=NEW.request_id AND wt.is_initial;
 PERFORM set_config('app.presales_write',coalesce(previous_setting,''),true);
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."sync_presales_initial_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
    current_v INT;
    next_v INT;
    cat_id UUID;
    t_id UUID;
    part_id UUID;
BEGIN
    -- Get current version and check concurrency
    SELECT version INTO current_v FROM public.projects WHERE id = p_id FOR UPDATE;
    IF current_v IS NULL THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    IF p_expected_version IS NOT NULL AND current_v <> p_expected_version THEN
        RAISE EXCEPTION 'Concurrency conflict: current version is %, expected %', current_v, p_expected_version;
    END IF;

    next_v := current_v + 1;

    -- Update projects
    UPDATE public.projects SET
        demo = p_demo,
        client_id = p_client_id,
        project_title = p_project_title,
        project_description = p_project_description,
        status_id = p_status_id,
        category_id = p_category_ids[1], -- scalar category_id field
        project_manager_id = p_project_manager_id,
        field_manager_id = p_field_manager_id,
        sales_rep_id = p_sales_rep_id,
        start_date = p_start_date,
        delivery_date = p_delivery_date,
        estimated_date = p_estimated_date,
        scheduled_date = p_scheduled_date,
        completed_date = p_completed_date,
        install_project_no = p_install_project_no,
        sf_opportunity_no = p_sf_opportunity_no,
        documents = p_documents,
        budget_value = p_budget_value,
        client_contact_name = p_client_contact_name,
        client_contact_email = p_client_contact_email,
        client_contact_phone = p_client_contact_phone,
        color = p_color,
        notes = p_notes,
        is_urgent = COALESCE(p_is_urgent, FALSE),
        version = next_v,
        updated_by = p_updated_by,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- Update priority link
    DELETE FROM public.project_priority_link WHERE project_id = p_id;
    IF p_priority_id IS NOT NULL THEN
        INSERT INTO public.project_priority_link (project_id, priority_id)
        VALUES (p_id, p_priority_id);
    END IF;

    -- Update risk link
    DELETE FROM public.project_risk_link WHERE project_id = p_id;
    IF p_risk_id IS NOT NULL THEN
        INSERT INTO public.project_risk_link (project_id, risk_id)
        VALUES (p_id, p_risk_id);
    END IF;

    -- Update category links
    DELETE FROM public.project_category_link WHERE project_id = p_id;
    IF p_category_ids IS NOT NULL THEN
        FOREACH cat_id IN ARRAY p_category_ids LOOP
            INSERT INTO public.project_category_link (project_id, category_id)
            VALUES (p_id, cat_id);
        END LOOP;
    END IF;

    -- Update team links
    DELETE FROM public.project_teams_link WHERE project_id = p_id;
    IF p_teams_involved_ids IS NOT NULL THEN
        FOREACH t_id IN ARRAY p_teams_involved_ids LOOP
            INSERT INTO public.project_teams_link (project_id, team_id)
            VALUES (p_id, t_id);
        END LOOP;
    END IF;

    -- Update partner links
    DELETE FROM public.project_partners_link WHERE project_id = p_id;
    IF p_partners_ids IS NOT NULL THEN
        FOREACH part_id IN ARRAY p_partners_ids LOOP
            INSERT INTO public.project_partners_link (project_id, partner_id)
            VALUES (p_id, part_id);
        END LOOP;
    END IF;

    RETURN next_v;
END;
$$;


ALTER FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
    current_v INT;
    next_v INT;
    cat_id UUID;
    t_id UUID;
    part_id UUID;
BEGIN
    -- Get current version and check concurrency
    SELECT version INTO current_v FROM public.projects WHERE id = p_id FOR UPDATE;
    IF current_v IS NULL THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    IF p_expected_version IS NOT NULL AND current_v <> p_expected_version THEN
        RAISE EXCEPTION 'Concurrency conflict: current version is %, expected %', current_v, p_expected_version;
    END IF;

    next_v := current_v + 1;

    -- Update projects
    UPDATE public.projects SET
        demo = p_demo,
        client_id = p_client_id,
        project_title = p_project_title,
        project_description = p_project_description,
        status_id = p_status_id,
        category_id = p_category_ids[1], -- scalar category_id field
        project_manager_id = p_project_manager_id,
        field_manager_id = p_field_manager_id,
        sales_rep_id = p_sales_rep_id,
        start_date = p_start_date,
        delivery_date = p_delivery_date,
        estimated_date = p_estimated_date,
        scheduled_date = p_scheduled_date,
        forecast_date = p_forecast_date,
        completed_date = p_completed_date,
        install_project_no = p_install_project_no,
        sf_opportunity_no = p_sf_opportunity_no,
        documents = p_documents,
        budget_value = p_budget_value,
        client_contact_name = p_client_contact_name,
        client_contact_email = p_client_contact_email,
        client_contact_phone = p_client_contact_phone,
        color = p_color,
        notes = p_notes,
        is_urgent = COALESCE(p_is_urgent, FALSE),
        version = next_v,
        updated_by = p_updated_by,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- Update priority link
    DELETE FROM public.project_priority_link WHERE project_id = p_id;
    IF p_priority_id IS NOT NULL THEN
        INSERT INTO public.project_priority_link (project_id, priority_id)
        VALUES (p_id, p_priority_id);
    END IF;

    -- Update risk link
    DELETE FROM public.project_risk_link WHERE project_id = p_id;
    IF p_risk_id IS NOT NULL THEN
        INSERT INTO public.project_risk_link (project_id, risk_id)
        VALUES (p_id, p_risk_id);
    END IF;

    -- Update category links
    DELETE FROM public.project_category_link WHERE project_id = p_id;
    IF p_category_ids IS NOT NULL THEN
        FOREACH cat_id IN ARRAY p_category_ids LOOP
            INSERT INTO public.project_category_link (project_id, category_id)
            VALUES (p_id, cat_id);
        END LOOP;
    END IF;

    -- Update team links
    DELETE FROM public.project_teams_link WHERE project_id = p_id;
    IF p_teams_involved_ids IS NOT NULL THEN
        FOREACH t_id IN ARRAY p_teams_involved_ids LOOP
            INSERT INTO public.project_teams_link (project_id, team_id)
            VALUES (p_id, t_id);
        END LOOP;
    END IF;

    -- Update partner links
    DELETE FROM public.project_partners_link WHERE project_id = p_id;
    IF p_partners_ids IS NOT NULL THEN
        FOREACH part_id IN ARRAY p_partners_ids LOOP
            INSERT INTO public.project_partners_link (project_id, partner_id)
            VALUES (p_id, part_id);
        END LOOP;
    END IF;

    RETURN next_v;
END;
$$;


ALTER FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer DEFAULT NULL::integer, "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_task_title" "text" DEFAULT NULL::"text", "p_status_id" "text" DEFAULT NULL::"text", "p_task_type_id" "text" DEFAULT NULL::"text", "p_estimated_hours" interval DEFAULT NULL::interval, "p_actual_hours" interval DEFAULT NULL::interval, "p_start_date" "date" DEFAULT NULL::"date", "p_start_time" time without time zone DEFAULT NULL::time without time zone, "p_end_date" "date" DEFAULT NULL::"date", "p_end_time" time without time zone DEFAULT NULL::time without time zone, "p_estimated_date" "date" DEFAULT NULL::"date", "p_completed_date" "date" DEFAULT NULL::"date", "p_task_description" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_is_milestone" boolean DEFAULT NULL::boolean, "p_updated_by" "uuid" DEFAULT NULL::"uuid", "p_assignee_user_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_update_assignees" boolean DEFAULT false, "p_update_project_id" boolean DEFAULT false, "p_update_dates" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_current_version INTEGER;
  v_task_row RECORD;
  v_uid UUID;
  v_caller_user_id UUID;
  v_status_uuid UUID;
  v_task_type_uuid UUID;
  v_curr_start_date DATE;
  v_curr_end_date DATE;
  v_target_start_date DATE;
  v_target_end_date DATE;
BEGIN
  -- 1. Authorization check
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_approved() THEN
      RAISE EXCEPTION 'Utilizador não autorizado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('tasks:write', auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para editar tarefas.' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_caller_user_id
    FROM public.users
    WHERE (auth_user_id = auth.uid() OR id = auth.uid())
      AND approved = TRUE AND deleted = FALSE;

    IF p_updated_by IS NOT NULL AND p_updated_by <> v_caller_user_id AND p_updated_by <> auth.uid() AND NOT public.is_admin() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    ELSIF p_updated_by IS NULL OR p_updated_by = auth.uid() THEN
      p_updated_by := COALESCE(v_caller_user_id, auth.uid());
    END IF;
  ELSIF p_updated_by IS NOT NULL THEN
    IF NOT public.has_permission('tasks:write', p_updated_by) THEN
      RAISE EXCEPTION 'Sem permissão para editar tarefas.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Check current task version & dates for OCC and validation
  SELECT version, start_date, end_date INTO v_current_version, v_curr_start_date, v_curr_end_date
  FROM public.tasks
  WHERE id = p_id AND (deleted IS NOT TRUE) FOR UPDATE;

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_version IS NOT NULL AND v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência (OCC): a tarefa foi modificada por outro utilizador.' USING ERRCODE = 'P0001';
  END IF;

  -- Determine target dates to validate
  IF p_update_dates THEN
    v_target_start_date := p_start_date;
    v_target_end_date := p_end_date;
  ELSE
    v_target_start_date := CASE WHEN p_start_date IS NOT NULL THEN p_start_date ELSE v_curr_start_date END;
    v_target_end_date := CASE WHEN p_end_date IS NOT NULL THEN p_end_date ELSE v_curr_end_date END;
  END IF;

  -- Validate temporal constraints
  IF (v_target_start_date IS NOT NULL AND v_target_end_date IS NULL) OR (v_target_start_date IS NULL AND v_target_end_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Data de início e data de fim devem ser preenchidas em conjunto.' USING ERRCODE = '23514';
  END IF;

  IF v_target_start_date IS NOT NULL AND v_target_end_date IS NOT NULL AND v_target_end_date < v_target_start_date THEN
    RAISE EXCEPTION 'Data de fim não pode ser anterior à data de início.' USING ERRCODE = '23514';
  END IF;

  -- 3. Validate target project if project_id is being updated and is not null
  IF p_update_project_id AND p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND (deleted IS NOT TRUE)) THEN
      RAISE EXCEPTION 'Projeto associado não existe ou foi eliminado.' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- 4. Resolve status_id to UUID
  IF p_status_id IS NOT NULL AND trim(p_status_id) <> '' THEN
    IF p_status_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_status_uuid := p_status_id::UUID;
    ELSIF p_status_id ~ '^ts-[0-9]+$' THEN
      v_status_uuid := ('99999999-9999-9999-9999-' || lpad(substring(p_status_id from 4), 12, '0'))::UUID;
    ELSE
      v_status_uuid := NULL;
    END IF;
  ELSE
    v_status_uuid := NULL;
  END IF;

  -- 5. Resolve task_type_id to UUID
  IF p_task_type_id IS NOT NULL AND trim(p_task_type_id) <> '' THEN
    IF p_task_type_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_task_type_uuid := p_task_type_id::UUID;
    ELSIF p_task_type_id ~ '^tt-[0-9]+$' THEN
      v_task_type_uuid := ('88888888-8888-8888-8888-' || lpad(substring(p_task_type_id from 4), 12, '0'))::UUID;
    ELSE
      v_task_type_uuid := NULL;
    END IF;
  ELSE
    v_task_type_uuid := NULL;
  END IF;

  -- 6. Update task row
  UPDATE public.tasks
  SET
    project_id = CASE WHEN p_update_project_id THEN p_project_id ELSE project_id END,
    task_title = COALESCE(p_task_title, task_title),
    status_id = COALESCE(v_status_uuid, status_id),
    task_type_id = CASE WHEN p_task_type_id IS NOT NULL THEN v_task_type_uuid ELSE task_type_id END,
    estimated_hours = COALESCE(p_estimated_hours, estimated_hours),
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    start_date = CASE WHEN p_update_dates THEN p_start_date WHEN p_start_date IS NOT NULL THEN p_start_date ELSE start_date END,
    start_time = CASE WHEN p_start_time IS NOT NULL THEN p_start_time ELSE start_time END,
    end_date = CASE WHEN p_update_dates THEN p_end_date WHEN p_end_date IS NOT NULL THEN p_end_date ELSE end_date END,
    end_time = CASE WHEN p_end_time IS NOT NULL THEN p_end_time ELSE end_time END,
    estimated_date = CASE WHEN p_estimated_date IS NOT NULL THEN p_estimated_date ELSE estimated_date END,
    completed_date = CASE WHEN p_completed_date IS NOT NULL THEN p_completed_date ELSE completed_date END,
    task_description = COALESCE(p_task_description, task_description),
    notes = COALESCE(p_notes, notes),
    is_milestone = COALESCE(p_is_milestone, is_milestone),
    version = version + 1,
    updated_at = timezone('utc'::text, now()),
    updated_by = p_updated_by
  WHERE id = p_id
  RETURNING * INTO v_task_row;

  -- 7. Sync assignees
  IF p_update_assignees THEN
    DELETE FROM public.task_assignees WHERE task_id = p_id;
    IF p_assignee_user_ids IS NOT NULL AND array_length(p_assignee_user_ids, 1) > 0 THEN
      FOREACH v_uid IN ARRAY p_assignee_user_ids LOOP
        IF v_uid IS NOT NULL THEN
          INSERT INTO public.task_assignees (task_id, user_id)
          VALUES (p_id, v_uid)
          ON CONFLICT (task_id, user_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN to_jsonb(v_task_row);
END;
$_$;


ALTER FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean, "p_priority_id" "uuid", "p_update_priority" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_task JSONB;
BEGIN
  IF p_update_priority AND p_priority_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.project_priority WHERE id = p_priority_id AND deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Prioridade da tarefa inválida ou eliminada.' USING ERRCODE = '23503';
  END IF;
  v_task := public.update_task_atomic(p_id, p_expected_version, p_project_id, p_task_title, p_status_id, p_task_type_id, p_estimated_hours, p_actual_hours, p_start_date, p_start_time, p_end_date, p_end_time, p_estimated_date, p_completed_date, p_task_description, p_notes, p_is_milestone, p_updated_by, p_assignee_user_ids, p_update_assignees, p_update_project_id, p_update_dates);
  IF p_update_priority THEN UPDATE public.tasks SET priority_id = p_priority_id WHERE id = p_id; END IF;
  SELECT to_jsonb(tasks) INTO v_task FROM public.tasks WHERE id = p_id;
  RETURN v_task;
END;
$$;


ALTER FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean, "p_priority_id" "uuid", "p_update_priority" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_legacy_batch"("p_changes" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $_$
DECLARE c jsonb; t text; row_data jsonb; cols text; vals text; assignments text;
  existing_version bigint; expected bigint; saved_version bigint; result jsonb := '[]';
  tables constant text[] := ARRAY['user_groups','project_status','project_category','project_risk','project_priority',
    'project_teams','project_partners','task_status','task_types','users','app_configuration',
    'risk_categories','risk_statuses','risk_priorities','project_materials','project_risk_items',
    'comments','user_absences','special_days','default_tasks',
    'notifications','automation_rules'];
BEGIN
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) > 4000 THEN
    RAISE EXCEPTION 'Invalid legacy batch' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_changes) x
    GROUP BY x->>'table_name', x->'row'->>'id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate legacy rows' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_changes) ORDER BY value->>'table_name', value->'row'->>'id' LOOP
    t := c->>'table_name'; row_data := c->'row';
    IF t IS NULL OR NOT t = ANY(tables) OR jsonb_typeof(row_data) IS DISTINCT FROM 'object'
      OR row_data->>'id' IS NULL OR row_data ? 'sync_version' THEN
      RAISE EXCEPTION 'Forbidden legacy target' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(t || ':' || (row_data->>'id'), 0));
    EXECUTE format('SELECT sync_version FROM public.%I WHERE id = $1 FOR UPDATE', t)
      INTO existing_version USING (row_data->>'id')::uuid;
    expected := (c->>'expected_version')::bigint;
    IF existing_version IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Concurrent legacy modification' USING ERRCODE = 'PT409';
    END IF;
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(p_changes)
    ORDER BY array_position(tables, value->>'table_name'), value->'row'->>'id' LOOP
    t := c->>'table_name'; row_data := c->'row'; expected := (c->>'expected_version')::bigint;
    SELECT string_agg(format('%I', key), ',' ORDER BY key),
      string_agg(format('r.%I', key), ',' ORDER BY key),
      string_agg(format('%I = r.%I', key, key), ',' ORDER BY key) FILTER (WHERE key <> 'id')
    INTO cols, vals, assignments FROM jsonb_object_keys(row_data) key;
    IF expected IS NULL THEN
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r RETURNING sync_version', t, cols, vals, t)
        INTO saved_version USING row_data;
    ELSE
      EXECUTE format('UPDATE public.%I target SET %s FROM jsonb_populate_record(NULL::public.%I, $1) r WHERE target.id = r.id AND target.sync_version = $2 RETURNING target.sync_version', t, assignments, t)
        INTO saved_version USING row_data, expected;
      IF saved_version IS NULL THEN RAISE EXCEPTION 'Concurrent legacy modification' USING ERRCODE = 'PT409'; END IF;
    END IF;
    result := result || jsonb_build_array(jsonb_build_object('table_name', t, 'id', row_data->>'id', 'sync_version', saved_version));
  END LOOP;
  RETURN result;
END;
$_$;


ALTER FUNCTION "public"."write_legacy_batch"("p_changes" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "private"."rate_limit_windows" (
    "bucket" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "request_count" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rate_limit_windows_bucket_check" CHECK (("char_length"("bucket") = 64)),
    CONSTRAINT "rate_limit_windows_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "private"."rate_limit_windows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_idempotency" (
    "key_hash" "text" NOT NULL,
    "request_hash" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "claim_token" "uuid" NOT NULL,
    "claimed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "response_status" integer,
    "response_body" "jsonb",
    "completed_at" timestamp with time zone,
    CONSTRAINT "api_idempotency_completion" CHECK (((("response_status" IS NULL) AND ("response_body" IS NULL) AND ("completed_at" IS NULL)) OR ((("response_status" >= 200) AND ("response_status" <= 299)) AND ("response_body" IS NOT NULL) AND ("completed_at" IS NOT NULL)))),
    CONSTRAINT "api_idempotency_key_hash_check" CHECK (("length"("key_hash") = 64)),
    CONSTRAINT "api_idempotency_request_hash_check" CHECK (("length"("request_hash") = 64))
);


ALTER TABLE "public"."api_idempotency" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "permissions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "client_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "project_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    CONSTRAINT "api_integrations_key_hash_check" CHECK (("length"("key_hash") = 64)),
    CONSTRAINT "api_integrations_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 100))),
    CONSTRAINT "api_integrations_permissions" CHECK (("permissions" <@ ARRAY['projects:read'::"text", 'tasks:read'::"text"])),
    CONSTRAINT "api_integrations_rate_limit_per_minute_check" CHECK ((("rate_limit_per_minute" >= 1) AND ("rate_limit_per_minute" <= 600))),
    CONSTRAINT "api_integrations_scope_required" CHECK ((("cardinality"("client_ids") + "cardinality"("project_ids")) > 0))
);


ALTER TABLE "public"."api_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_configuration" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "app_name" "text",
    "app_description" "text",
    "footer_text" "text",
    "logo_url" "text",
    "footer_copyright_text" "text",
    "logo_image_path" "text",
    "theme_name" "text",
    "sales_rep_group_id" "text",
    "proj_manager_group_id" "text",
    "field_manager_group_id" "text",
    "task_assignee_group_id" "text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."app_configuration" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "user_id" "uuid",
    "user_name" "text",
    "user_email" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "entity_name" "text",
    "details" "text",
    "ip" "text",
    "user_agent" "text",
    "request_id" "text"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rules" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "enabled" boolean DEFAULT true,
    "trigger_type" "text" NOT NULL,
    "trigger_condition" "jsonb",
    "actions" "jsonb" NOT NULL,
    "deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."automation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_feed_tokens" (
    "user_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rotated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "calendar_feed_tokens_scope_check" CHECK (("scope" = ANY (ARRAY['mine'::"text", 'all'::"text"]))),
    CONSTRAINT "calendar_feed_tokens_token_hash_check" CHECK (("length"("token_hash") = 64))
);


ALTER TABLE "public"."calendar_feed_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_name" "text" NOT NULL,
    "short_name" "text",
    "location" "text",
    "tax_id" "text",
    "contact_person" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "code" "text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "city" "text",
    "postal_code" "text",
    "country" "text",
    "color" "text" DEFAULT '#3b82f6'::"text",
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "author_id" "uuid",
    "comment" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."default_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "estimated_hours" interval DEFAULT '08:00:00'::interval,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "task_type_id" "uuid",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."default_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "serial_number" "text",
    "brand" "text",
    "model" "text",
    "project_id" "uuid",
    "status" "text" DEFAULT 'Active'::"text",
    "installation_date" "date",
    "deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_id" "uuid",
    "sync_version" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "equipment_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Inactive'::"text", 'Decommissioned'::"text"])))
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


COMMENT ON COLUMN "public"."equipment"."client_id" IS 'Associado ao cliente quando o equipamento não pertence a um projeto ativo';



CREATE TABLE IF NOT EXISTS "public"."erp_projects" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "client_id" "text",
    "status" "text",
    "start_date" "text",
    "end_date" "text",
    "created_date" "text",
    "updated_date" "text",
    "deleted" boolean DEFAULT false
);


ALTER TABLE "public"."erp_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."erp_tasks" (
    "id" "text" NOT NULL,
    "project_id" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text",
    "estimated_hours" "text",
    "real_hours" "text",
    "created_date" "text",
    "deleted" boolean DEFAULT false
);


ALTER TABLE "public"."erp_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mechanical_design_details" (
    "request_id" "uuid" NOT NULL,
    "instructions" "text" DEFAULT ''::"text" NOT NULL,
    "deliverables" "text" DEFAULT ''::"text" NOT NULL,
    "file_identifier" "text" DEFAULT ''::"text" NOT NULL,
    "file_revision" "text" DEFAULT ''::"text" NOT NULL,
    "usage_text" "text" DEFAULT ''::"text" NOT NULL,
    "project_status_id" "uuid",
    "requested_for_id" "uuid",
    "priority_id" "uuid",
    CONSTRAINT "mechanical_design_details_usage_text_check" CHECK (("length"("usage_text") <= 10000))
);


ALTER TABLE "public"."mechanical_design_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mechanical_design_other_managers" (
    "request_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."mechanical_design_other_managers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."non_project_work" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1
);


ALTER TABLE "public"."non_project_work" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_reads" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" character varying(255) NOT NULL,
    "name" character varying(255) NOT NULL,
    "enabled" boolean DEFAULT true,
    "days_before" integer DEFAULT 0,
    "target_group" character varying(50) NOT NULL,
    CONSTRAINT "notification_settings_days_range" CHECK ((("days_before" >= 0) AND ("days_before" <= 30))),
    CONSTRAINT "notification_settings_target_group" CHECK ((("target_group")::"text" = ANY ((ARRAY['all'::character varying, 'allocated'::character varying, 'managers'::character varying])::"text"[])))
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "title" character varying(255) NOT NULL,
    "message" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "link_url" character varying(255),
    "sync_version" bigint DEFAULT 1 NOT NULL,
    "event_key" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "module" "text" NOT NULL,
    "description" "text",
    "action" "text",
    "is_system" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "deprecated_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planning_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1,
    CONSTRAINT "chk_planning_allocations_start_before_end" CHECK (("start_time" < "end_time")),
    CONSTRAINT "planning_allocations_check" CHECK (("end_time" > "start_time")),
    CONSTRAINT "planning_allocations_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'CONFIRMED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."planning_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presales_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presales_assets_media_type_check" CHECK (("media_type" = ANY (ARRAY['image/png'::"text", 'image/jpeg'::"text", 'image/webp'::"text"])))
);


ALTER TABLE "public"."presales_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presales_details" (
    "request_id" "uuid" NOT NULL,
    "technical_requirements" "text" DEFAULT ''::"text" NOT NULL,
    "technical_outcome" "text" DEFAULT ''::"text" NOT NULL,
    "commercial_manager_id" "uuid",
    "project_manager_id" "uuid",
    "execution_project_id" "uuid",
    "document_draft" "jsonb" DEFAULT '{"blocks": [], "schemaVersion": 1}'::"jsonb" NOT NULL,
    "document_version" integer DEFAULT 1 NOT NULL,
    "document_locked" boolean DEFAULT false NOT NULL,
    "process_number" bigint,
    "origin_code" "text",
    "priority_id" "uuid",
    "opportunity_sf" "text" DEFAULT ''::"text" NOT NULL,
    "client_id" "uuid",
    "request_description" "text" DEFAULT ''::"text" NOT NULL,
    "started_on" "date",
    "completed_on" "date",
    "potential_value" numeric(14,2),
    "sale_date" "date",
    "sale_value" numeric(14,2),
    CONSTRAINT "presales_basic_dates" CHECK ((("completed_on" IS NULL) OR ("started_on" IS NULL) OR ("completed_on" >= "started_on"))),
    CONSTRAINT "presales_details_document_version_check" CHECK (("document_version" > 0)),
    CONSTRAINT "presales_details_opportunity_sf_check" CHECK (("length"("opportunity_sf") <= 300)),
    CONSTRAINT "presales_details_potential_value_check" CHECK ((("potential_value" IS NULL) OR ("potential_value" >= (0)::numeric))),
    CONSTRAINT "presales_details_sale_value_check" CHECK ((("sale_value" IS NULL) OR ("sale_value" >= (0)::numeric))),
    CONSTRAINT "presales_document_shape" CHECK ((("jsonb_typeof"("document_draft") = 'object'::"text") AND (("document_draft" ->> 'schemaVersion'::"text") = '1'::"text") AND ("jsonb_typeof"(("document_draft" -> 'blocks'::"text")) = 'array'::"text"))),
    CONSTRAINT "presales_process_number_positive" CHECK (("process_number" > 0))
);


ALTER TABLE "public"."presales_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presales_document_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "revision_number" integer NOT NULL,
    "document_snapshot" "jsonb" NOT NULL,
    "items_snapshot" "jsonb" NOT NULL,
    "contacts_snapshot" "jsonb" NOT NULL,
    "published_by" "uuid" NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presales_document_revisions_revision_number_check" CHECK (("revision_number" > 0))
);


ALTER TABLE "public"."presales_document_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presales_document_templates" (
    "code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "markdown" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presales_document_templates_code_check" CHECK (("code" = ANY (ARRAY['basic'::"text", 'normal'::"text", 'advanced'::"text"]))),
    CONSTRAINT "presales_document_templates_markdown_check" CHECK (("length"("markdown") <= 50000)),
    CONSTRAINT "presales_document_templates_title_check" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 120))),
    CONSTRAINT "presales_document_templates_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."presales_document_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presales_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "unit" "text" DEFAULT 'un'::"text" NOT NULL,
    "quantity" numeric(12,3) NOT NULL,
    "unit_price" numeric(14,2) NOT NULL,
    "group_label" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presales_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "presales_items_title_check" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 300))),
    CONSTRAINT "presales_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."presales_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presales_origins" (
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "presales_origins_code_check" CHECK (("code" ~ '^[a-z_]+$'::"text"))
);


ALTER TABLE "public"."presales_origins" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."presales_process_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."presales_process_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."presales_process_number_seq" OWNED BY "public"."presales_details"."process_number";



CREATE TABLE IF NOT EXISTS "public"."project_category" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0,
    "color" "text" DEFAULT '#8b5cf6'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."project_category" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_category" IS 'Internal, Standard, Labeling, Weighing, Vision/Scanner, Cross-team support, Other';



CREATE TABLE IF NOT EXISTS "public"."project_category_link" (
    "project_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_category_link" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "description" "text" NOT NULL,
    "supplier" "text" NOT NULL,
    "quantity" numeric DEFAULT 1,
    "reference" "text",
    "budget" "text" DEFAULT ''::"text",
    "cost_price" numeric DEFAULT 0,
    "sale_price" numeric DEFAULT 0,
    "expected_delivery_date" "date",
    "status" "text" DEFAULT 'encomendado'::"text",
    "deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."project_materials" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_materials" IS 'Linhas de encomenda/material necessário por projeto';



CREATE TABLE IF NOT EXISTS "public"."project_partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0,
    "color" "text" DEFAULT '#06b6d4'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."project_partners" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_partners" IS 'JDG, Machserv, Inovasense, TSMaq, Make Industry, Aidomotic, Dibal, FFonseca';



CREATE TABLE IF NOT EXISTS "public"."project_partners_link" (
    "project_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_partners_link" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_priority" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "scale" integer,
    "deleted" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0,
    "color" "text" DEFAULT '#f59e0b'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."project_priority" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_priority" IS 'Medium, High, Urgent';



CREATE TABLE IF NOT EXISTS "public"."project_priority_link" (
    "project_id" "uuid" NOT NULL,
    "priority_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_priority_link" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_risk" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "scale" integer,
    "deleted" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0,
    "color" "text" DEFAULT '#ef4444'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."project_risk" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_risk" IS 'Low, Medium, High';



CREATE TABLE IF NOT EXISTS "public"."project_risk_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category_id" "uuid",
    "identification_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "owner_id" "uuid",
    "description" "text",
    "consequence" "text",
    "probability" integer NOT NULL,
    "impact" integer NOT NULL,
    "mitigation_plan" "text",
    "contingency_plan" "text",
    "review_date" "date",
    "status_id" "uuid",
    "priority_id" "uuid",
    "deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "sync_version" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "project_risk_items_impact_check" CHECK ((("impact" >= 1) AND ("impact" <= 5))),
    CONSTRAINT "project_risk_items_probability_check" CHECK ((("probability" >= 1) AND ("probability" <= 5)))
);


ALTER TABLE "public"."project_risk_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_risk_link" (
    "project_id" "uuid" NOT NULL,
    "risk_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_risk_link" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "scale" integer,
    "deleted" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0,
    "color" "text" DEFAULT '#3b82f6'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."project_status" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_status" IS 'Planning, Procurement, Preparation, Testing/FAT, Installation/SAT, Follow-up, On hold, Improvements';



CREATE TABLE IF NOT EXISTS "public"."project_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0,
    "color" "text" DEFAULT '#10b981'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."project_teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_teams" IS 'Software, Installations, Repairs, Partner';



CREATE TABLE IF NOT EXISTS "public"."project_teams_link" (
    "project_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_teams_link" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "demo" boolean DEFAULT false NOT NULL,
    "client_id" "uuid",
    "project_title" "text" NOT NULL,
    "project_description" "text",
    "category_id" "uuid",
    "status_id" "uuid",
    "project_manager_id" "uuid",
    "field_manager_id" "uuid",
    "sales_rep_id" "uuid",
    "start_date" "date",
    "delivery_date" "date",
    "estimated_date" "date",
    "scheduled_date" "date",
    "install_project_no" "text",
    "sf_opportunity_no" "text",
    "documents" "text",
    "budget_value" numeric(14,2),
    "created_by" "uuid",
    "deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_contact_name" "text",
    "client_contact_email" "text",
    "client_contact_phone" "text",
    "completed_date" "date",
    "is_urgent" boolean DEFAULT false,
    "color" "text",
    "notes" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "updated_by" "uuid",
    "forecast_date" "date",
    CONSTRAINT "projects_forecast_month_start" CHECK ((("forecast_date" IS NULL) OR (EXTRACT(day FROM "forecast_date") = (1)::numeric)))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_non_project_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "work_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1,
    CONSTRAINT "resource_non_project_allocations_check" CHECK (("end_time" > "start_time")),
    CONSTRAINT "resource_non_project_allocations_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'CONFIRMED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."resource_non_project_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "skill_id" "uuid" NOT NULL,
    "proficiency_level" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1,
    CONSTRAINT "resource_skills_proficiency_level_check" CHECK ((("proficiency_level" >= 1) AND ("proficiency_level" <= 5)))
);


ALTER TABLE "public"."resource_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resource_work_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1
);


ALTER TABLE "public"."resource_work_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."risk_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "color" "text" DEFAULT '#8b5cf6'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."risk_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."risk_priorities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "scale" integer DEFAULT 1,
    "deleted" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "color" "text" DEFAULT '#f59e0b'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."risk_priorities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."risk_statuses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "color" "text" DEFAULT '#ef4444'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL,
    "scale" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."risk_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid"
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1
);


ALTER TABLE "public"."skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."special_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."special_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_assignees" (
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."task_assignees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_skill_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "skill_id" "uuid" NOT NULL,
    "is_mandatory" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1
);


ALTER TABLE "public"."task_skill_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "scale" integer,
    "deleted" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "color" "text" DEFAULT '#3b82f6'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."task_status" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_status" IS 'Not started, In progress, Completed, On hold';



CREATE TABLE IF NOT EXISTS "public"."task_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "scale" integer DEFAULT 1,
    "deleted" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "color" "text" DEFAULT '#6366f1'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."task_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "task_title" "text" NOT NULL,
    "status_id" "uuid",
    "estimated_date" "date",
    "task_description" "text",
    "estimated_hours" interval,
    "actual_hours" interval,
    "start_date" "date",
    "start_time" time without time zone,
    "end_date" "date",
    "end_time" time without time zone,
    "notes" "text",
    "deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_milestone" boolean DEFAULT false,
    "task_type_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_date" "date",
    "version" integer DEFAULT 1 NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "priority_id" "uuid",
    CONSTRAINT "check_tasks_end_date_gte_start_date" CHECK ((("start_date" IS NULL) OR ("end_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "check_tasks_temporal_both_or_neither" CHECK (((("start_date" IS NULL) AND ("end_date" IS NULL)) OR (("start_date" IS NOT NULL) AND ("end_date" IS NOT NULL))))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tasks"."is_milestone" IS 'Indica se a tarefa é um Novo Marco (sem utilizador nem tempos previstos)';



CREATE TABLE IF NOT EXISTS "public"."user_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "absence_start_date" "date" NOT NULL,
    "absence_end_date" "date" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text",
    "is_full_day" boolean DEFAULT true,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "version" integer DEFAULT 1,
    "sync_version" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "user_absences_check" CHECK (("absence_end_date" >= "absence_start_date")),
    CONSTRAINT "user_absences_reason_check" CHECK (("reason" = ANY (ARRAY['Vacation'::"text", 'Sick leave'::"text", 'Other'::"text"])))
);


ALTER TABLE "public"."user_absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb",
    "color" "text" DEFAULT '#64748b'::"text",
    "sync_version" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."user_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_groups" IS 'Administrator, Project Manager, Technician, Viewer';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid"
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Multi-role assignments; changes are made only through audited server APIs.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "role_id" "uuid",
    "approved" boolean DEFAULT false NOT NULL,
    "deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_admin" boolean DEFAULT false,
    "auth_user_id" "uuid",
    "sync_version" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "users_type_check" CHECK (("type" = ANY (ARRAY['Team'::"text", 'Sales'::"text", 'External'::"text", 'Other'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_request_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_request_events_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'accept'::"text", 'reject'::"text", 'edit'::"text", 'file'::"text", 'deliver'::"text", 'add_task'::"text", 'assign_task'::"text", 'suspend'::"text", 'resume'::"text", 'won'::"text", 'lost'::"text", 'save_document'::"text", 'save_item'::"text", 'delete_item'::"text", 'publish'::"text", 'new_revision'::"text", 'link_project'::"text"])))
);


ALTER TABLE "public"."work_request_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_request_tasks" (
    "request_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "is_initial" boolean DEFAULT false NOT NULL,
    "estimated_days" numeric(6,1),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_request_tasks_estimated_days_check" CHECK (((("estimated_days" >= 0.5) AND ("estimated_days" <= (999)::numeric)) AND (("estimated_days" * (2)::numeric) = "trunc"(("estimated_days" * (2)::numeric)))))
);


ALTER TABLE "public"."work_request_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "area_owner_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "planned_start_date" "date",
    "planned_end_date" "date",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "delivered_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "work_request_planned_window" CHECK (((("planned_start_date" IS NULL) AND ("planned_end_date" IS NULL)) OR (("planned_start_date" IS NOT NULL) AND ("planned_end_date" IS NOT NULL) AND (("kind" <> 'presales'::"text") OR ("planned_end_date" > "planned_start_date")) AND (("kind" = 'presales'::"text") OR ("planned_end_date" >= "planned_start_date"))))),
    CONSTRAINT "work_requests_kind_check" CHECK (("kind" = ANY (ARRAY['mechanical_design'::"text", 'presales'::"text"]))),
    CONSTRAINT "work_requests_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'accepted'::"text", 'rejected'::"text", 'delivered'::"text", 'suspended'::"text", 'won'::"text", 'lost'::"text"]))),
    CONSTRAINT "work_requests_title_check" CHECK ((("length"("btrim"("title")) >= 2) AND ("length"("btrim"("title")) <= 200))),
    CONSTRAINT "work_requests_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."work_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_schedule_override_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "override_id" "uuid" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "work_schedule_override_periods_check" CHECK (("end_time" > "start_time"))
);


ALTER TABLE "public"."work_schedule_override_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_schedule_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "is_working_day" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1
);


ALTER TABLE "public"."work_schedule_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_schedule_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "work_schedule_periods_check" CHECK (("end_time" > "start_time")),
    CONSTRAINT "work_schedule_periods_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7)))
);


ALTER TABLE "public"."work_schedule_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1
);


ALTER TABLE "public"."work_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_task_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "reason" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_task_events_action_check" CHECK (("action" = ANY (ARRAY['start'::"text", 'block'::"text", 'resume'::"text", 'complete'::"text", 'reopen'::"text", 'assign'::"text"])))
);


ALTER TABLE "public"."work_task_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."presales_details" ALTER COLUMN "process_number" SET DEFAULT "nextval"('"public"."presales_process_number_seq"'::"regclass");



ALTER TABLE ONLY "private"."rate_limit_windows"
    ADD CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("bucket");



ALTER TABLE ONLY "public"."api_idempotency"
    ADD CONSTRAINT "api_idempotency_pkey" PRIMARY KEY ("key_hash");



ALTER TABLE ONLY "public"."api_integrations"
    ADD CONSTRAINT "api_integrations_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_integrations"
    ADD CONSTRAINT "api_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_configuration"
    ADD CONSTRAINT "app_configuration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_feed_tokens"
    ADD CONSTRAINT "calendar_feed_tokens_pkey" PRIMARY KEY ("user_id", "scope");



ALTER TABLE ONLY "public"."calendar_feed_tokens"
    ADD CONSTRAINT "calendar_feed_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."default_tasks"
    ADD CONSTRAINT "default_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."erp_projects"
    ADD CONSTRAINT "erp_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."erp_tasks"
    ADD CONSTRAINT "erp_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mechanical_design_details"
    ADD CONSTRAINT "mechanical_design_details_pkey" PRIMARY KEY ("request_id");



ALTER TABLE ONLY "public"."mechanical_design_other_managers"
    ADD CONSTRAINT "mechanical_design_other_managers_pkey" PRIMARY KEY ("request_id", "user_id");



ALTER TABLE ONLY "public"."planning_allocations"
    ADD CONSTRAINT "no_overlapping_confirmed_allocations" EXCLUDE USING "gist" ("resource_id" WITH =, "date" WITH =, "public"."planning_allocation_tsrange"("date", "start_time", "end_time") WITH &&) WHERE (("status" = 'CONFIRMED'::"text"));



ALTER TABLE ONLY "public"."non_project_work"
    ADD CONSTRAINT "non_project_work_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id", "user_id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_type_key" UNIQUE ("type");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planning_allocations"
    ADD CONSTRAINT "planning_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presales_assets"
    ADD CONSTRAINT "presales_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presales_assets"
    ADD CONSTRAINT "presales_assets_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_execution_project_id_key" UNIQUE ("execution_project_id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_pkey" PRIMARY KEY ("request_id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_process_number_key" UNIQUE ("process_number");



ALTER TABLE ONLY "public"."presales_document_revisions"
    ADD CONSTRAINT "presales_document_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presales_document_revisions"
    ADD CONSTRAINT "presales_document_revisions_request_id_revision_number_key" UNIQUE ("request_id", "revision_number");



ALTER TABLE ONLY "public"."presales_document_templates"
    ADD CONSTRAINT "presales_document_templates_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."presales_items"
    ADD CONSTRAINT "presales_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presales_origins"
    ADD CONSTRAINT "presales_origins_label_key" UNIQUE ("label");



ALTER TABLE ONLY "public"."presales_origins"
    ADD CONSTRAINT "presales_origins_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."project_category_link"
    ADD CONSTRAINT "project_category_link_pkey" PRIMARY KEY ("project_id", "category_id");



ALTER TABLE ONLY "public"."project_category"
    ADD CONSTRAINT "project_category_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_materials"
    ADD CONSTRAINT "project_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_partners_link"
    ADD CONSTRAINT "project_partners_link_pkey" PRIMARY KEY ("project_id", "partner_id");



ALTER TABLE ONLY "public"."project_partners"
    ADD CONSTRAINT "project_partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_priority_link"
    ADD CONSTRAINT "project_priority_link_pkey" PRIMARY KEY ("project_id", "priority_id");



ALTER TABLE ONLY "public"."project_priority"
    ADD CONSTRAINT "project_priority_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_risk_items"
    ADD CONSTRAINT "project_risk_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_risk_link"
    ADD CONSTRAINT "project_risk_link_pkey" PRIMARY KEY ("project_id", "risk_id");



ALTER TABLE ONLY "public"."project_risk"
    ADD CONSTRAINT "project_risk_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_status"
    ADD CONSTRAINT "project_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_teams_link"
    ADD CONSTRAINT "project_teams_link_pkey" PRIMARY KEY ("project_id", "team_id");



ALTER TABLE ONLY "public"."project_teams"
    ADD CONSTRAINT "project_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_non_project_allocations"
    ADD CONSTRAINT "resource_non_project_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_skills"
    ADD CONSTRAINT "resource_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_skills"
    ADD CONSTRAINT "resource_skills_resource_id_skill_id_key" UNIQUE ("resource_id", "skill_id");



ALTER TABLE ONLY "public"."resource_work_schedules"
    ADD CONSTRAINT "resource_work_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_work_schedules"
    ADD CONSTRAINT "resource_work_schedules_resource_id_key" UNIQUE ("resource_id");



ALTER TABLE ONLY "public"."risk_categories"
    ADD CONSTRAINT "risk_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."risk_priorities"
    ADD CONSTRAINT "risk_priorities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."risk_statuses"
    ADD CONSTRAINT "risk_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skills"
    ADD CONSTRAINT "skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."special_days"
    ADD CONSTRAINT "special_days_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."special_days"
    ADD CONSTRAINT "special_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "user_id");



ALTER TABLE ONLY "public"."task_skill_requirements"
    ADD CONSTRAINT "task_skill_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_skill_requirements"
    ADD CONSTRAINT "task_skill_requirements_task_id_skill_id_key" UNIQUE ("task_id", "skill_id");



ALTER TABLE ONLY "public"."task_status"
    ADD CONSTRAINT "task_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_types"
    ADD CONSTRAINT "task_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_absences"
    ADD CONSTRAINT "user_absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_groups"
    ADD CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_request_events"
    ADD CONSTRAINT "work_request_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_request_tasks"
    ADD CONSTRAINT "work_request_tasks_pkey" PRIMARY KEY ("task_id");



ALTER TABLE ONLY "public"."work_requests"
    ADD CONSTRAINT "work_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_schedule_override_periods"
    ADD CONSTRAINT "work_schedule_override_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_schedule_overrides"
    ADD CONSTRAINT "work_schedule_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_schedule_periods"
    ADD CONSTRAINT "work_schedule_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_schedules"
    ADD CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_pkey" PRIMARY KEY ("id");



CREATE INDEX "api_idempotency_completed_idx" ON "public"."api_idempotency" USING "btree" ("completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "api_integrations_active_idx" ON "public"."api_integrations" USING "btree" ("expires_at") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_absences_user" ON "public"."user_absences" USING "btree" ("user_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_comments_project" ON "public"."comments" USING "btree" ("project_id");



CREATE INDEX "idx_equipment_project" ON "public"."equipment" USING "btree" ("project_id");



CREATE INDEX "idx_notification_reads_user_id" ON "public"."notification_reads" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_permissions_module_active" ON "public"."permissions" USING "btree" ("module", "is_active");



CREATE INDEX "idx_planning_allocations_resource_date" ON "public"."planning_allocations" USING "btree" ("resource_id", "date");



CREATE INDEX "idx_planning_allocations_task_date" ON "public"."planning_allocations" USING "btree" ("task_id", "date");



CREATE INDEX "idx_project_category_order" ON "public"."project_category" USING "btree" ("sort_order");



CREATE INDEX "idx_project_materials_project_id" ON "public"."project_materials" USING "btree" ("project_id");



CREATE INDEX "idx_project_materials_status" ON "public"."project_materials" USING "btree" ("status");



CREATE INDEX "idx_project_materials_supplier" ON "public"."project_materials" USING "btree" ("supplier");



CREATE INDEX "idx_project_partners_order" ON "public"."project_partners" USING "btree" ("sort_order");



CREATE INDEX "idx_project_priority_order" ON "public"."project_priority" USING "btree" ("sort_order");



CREATE INDEX "idx_project_risk_order" ON "public"."project_risk" USING "btree" ("sort_order");



CREATE INDEX "idx_project_status_order" ON "public"."project_status" USING "btree" ("sort_order");



CREATE INDEX "idx_project_teams_order" ON "public"."project_teams" USING "btree" ("sort_order");



CREATE INDEX "idx_projects_client" ON "public"."projects" USING "btree" ("client_id");



CREATE INDEX "idx_projects_deleted" ON "public"."projects" USING "btree" ("deleted");



CREATE INDEX "idx_projects_manager" ON "public"."projects" USING "btree" ("project_manager_id");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status_id");



CREATE INDEX "idx_resource_non_project_allocations_resource_date" ON "public"."resource_non_project_allocations" USING "btree" ("resource_id", "date");



CREATE INDEX "idx_resource_skills_resource" ON "public"."resource_skills" USING "btree" ("resource_id");



CREATE INDEX "idx_task_assignees_task" ON "public"."task_assignees" USING "btree" ("task_id");



CREATE INDEX "idx_task_assignees_user" ON "public"."task_assignees" USING "btree" ("user_id");



CREATE INDEX "idx_task_skill_requirements_task" ON "public"."task_skill_requirements" USING "btree" ("task_id");



CREATE INDEX "idx_task_status_deleted" ON "public"."task_status" USING "btree" ("deleted");



CREATE INDEX "idx_task_status_sort_order" ON "public"."task_status" USING "btree" ("sort_order");



CREATE INDEX "idx_tasks_deleted" ON "public"."tasks" USING "btree" ("deleted");



CREATE INDEX "idx_tasks_priority_id" ON "public"."tasks" USING "btree" ("priority_id") WHERE ("deleted" IS NOT TRUE);



CREATE INDEX "idx_tasks_project" ON "public"."tasks" USING "btree" ("project_id");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status_id");



CREATE INDEX "idx_user_absences_user_date" ON "public"."user_absences" USING "btree" ("user_id", "absence_start_date", "absence_end_date");



CREATE INDEX "idx_user_roles_role_id" ON "public"."user_roles" USING "btree" ("role_id");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_users_auth_user_id_unique" ON "public"."users" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "mechanical_design_details_priority_idx" ON "public"."mechanical_design_details" USING "btree" ("priority_id") WHERE ("priority_id" IS NOT NULL);



CREATE INDEX "mechanical_design_details_project_status_idx" ON "public"."mechanical_design_details" USING "btree" ("project_status_id") WHERE ("project_status_id" IS NOT NULL);



CREATE INDEX "mechanical_design_details_requested_for_idx" ON "public"."mechanical_design_details" USING "btree" ("requested_for_id") WHERE ("requested_for_id" IS NOT NULL);



CREATE INDEX "mechanical_design_other_managers_user_idx" ON "public"."mechanical_design_other_managers" USING "btree" ("user_id");



CREATE UNIQUE INDEX "notifications_event_key_unique" ON "public"."notifications" USING "btree" ("event_key");



CREATE INDEX "notifications_recipient_recent" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "presales_assets_request_idx" ON "public"."presales_assets" USING "btree" ("request_id");



CREATE INDEX "presales_assets_uploaded_by_idx" ON "public"."presales_assets" USING "btree" ("uploaded_by");



CREATE INDEX "presales_details_client_idx" ON "public"."presales_details" USING "btree" ("client_id") WHERE ("client_id" IS NOT NULL);



CREATE INDEX "presales_details_commercial_manager_idx" ON "public"."presales_details" USING "btree" ("commercial_manager_id") WHERE ("commercial_manager_id" IS NOT NULL);



CREATE INDEX "presales_details_project_manager_idx" ON "public"."presales_details" USING "btree" ("project_manager_id") WHERE ("project_manager_id" IS NOT NULL);



CREATE INDEX "presales_items_request_order" ON "public"."presales_items" USING "btree" ("request_id", "sort_order", "id");



CREATE INDEX "presales_revisions_published_by_idx" ON "public"."presales_document_revisions" USING "btree" ("published_by");



CREATE INDEX "work_request_events_request_idx" ON "public"."work_request_events" USING "btree" ("request_id", "occurred_at" DESC);



CREATE UNIQUE INDEX "work_request_initial_task_unique" ON "public"."work_request_tasks" USING "btree" ("request_id") WHERE "is_initial";



CREATE INDEX "work_request_tasks_request_idx" ON "public"."work_request_tasks" USING "btree" ("request_id");



CREATE INDEX "work_requests_active_kind_idx" ON "public"."work_requests" USING "btree" ("kind", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "work_requests_owner_status_idx" ON "public"."work_requests" USING "btree" ("area_owner_id", "status", "created_at" DESC);



CREATE INDEX "work_requests_presales_recent_idx" ON "public"."work_requests" USING "btree" ("created_at" DESC, "id") WHERE ("kind" = 'presales'::"text");



CREATE INDEX "work_requests_project_idx" ON "public"."work_requests" USING "btree" ("project_id") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "work_task_events_task_idx" ON "public"."work_task_events" USING "btree" ("task_id", "occurred_at" DESC);



CREATE OR REPLACE TRIGGER "activate_assigned_work_request" AFTER INSERT ON "public"."work_request_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."activate_assigned_work_request"();



CREATE OR REPLACE TRIGGER "guard_mechanical_design_assignees" BEFORE INSERT OR DELETE OR UPDATE ON "public"."task_assignees" FOR EACH ROW EXECUTE FUNCTION "public"."guard_mechanical_design_assignees_write"();



CREATE OR REPLACE TRIGGER "guard_mechanical_design_manager_event" BEFORE INSERT ON "public"."work_request_events" FOR EACH ROW EXECUTE FUNCTION "public"."guard_mechanical_design_manager_event"();



CREATE OR REPLACE TRIGGER "guard_mechanical_design_owner" BEFORE INSERT OR UPDATE OF "area_owner_id" ON "public"."work_requests" FOR EACH ROW EXECUTE FUNCTION "public"."guard_mechanical_design_owner"();



CREATE OR REPLACE TRIGGER "guard_mechanical_design_reopen" BEFORE INSERT ON "public"."work_task_events" FOR EACH ROW EXECUTE FUNCTION "public"."guard_mechanical_design_reopen"();



CREATE OR REPLACE TRIGGER "guard_mechanical_design_task" BEFORE DELETE OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."guard_mechanical_design_task_write"();



CREATE OR REPLACE TRIGGER "guard_presales_assignees_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."task_assignees" FOR EACH ROW EXECUTE FUNCTION "public"."guard_presales_assignees_write"();



CREATE OR REPLACE TRIGGER "guard_presales_contacts" BEFORE INSERT OR UPDATE OF "commercial_manager_id", "project_manager_id" ON "public"."presales_details" FOR EACH ROW EXECUTE FUNCTION "public"."guard_presales_contacts"();



CREATE OR REPLACE TRIGGER "guard_presales_revision_assets" BEFORE INSERT ON "public"."presales_document_revisions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_presales_revision_assets"();



CREATE OR REPLACE TRIGGER "guard_presales_revision_immutable" BEFORE DELETE OR UPDATE ON "public"."presales_document_revisions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_presales_revision_immutable"();



CREATE OR REPLACE TRIGGER "guard_presales_task_estimate" BEFORE INSERT OR UPDATE OF "estimated_days", "is_initial" ON "public"."work_request_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."guard_presales_task_estimate"();



CREATE OR REPLACE TRIGGER "guard_presales_task_write" BEFORE DELETE OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."guard_presales_task_write"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."app_configuration" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."automation_rules" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."default_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."equipment" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_category" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_materials" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_partners" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_priority" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_risk" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_risk_items" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_status" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."project_teams" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."risk_categories" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."risk_priorities" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."risk_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."special_days" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."task_status" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."task_types" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."user_absences" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."user_groups" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "legacy_sync_version" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."bump_legacy_sync_version"();



CREATE OR REPLACE TRIGGER "mechanical_design_task_link_rule" AFTER INSERT ON "public"."work_request_tasks" FOR EACH ROW EXECUTE FUNCTION "notification_internal"."mechanical_design_task_link_rule"();



CREATE OR REPLACE TRIGGER "mechanical_design_task_status_rule" AFTER UPDATE OF "status_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "notification_internal"."mechanical_design_task_status_rule"();



CREATE OR REPLACE TRIGGER "presales_request_event" AFTER INSERT OR UPDATE OF "status" ON "public"."work_requests" FOR EACH ROW EXECUTE FUNCTION "notification_internal"."presales_request_event"();



CREATE OR REPLACE TRIGGER "project_assignment_notice" AFTER INSERT OR UPDATE OF "project_manager_id", "field_manager_id" ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "notification_internal"."project_assignment_notice"();



CREATE OR REPLACE TRIGGER "sync_presales_initial_task" AFTER UPDATE OF "technical_requirements" ON "public"."presales_details" FOR EACH ROW EXECUTE FUNCTION "public"."sync_presales_initial_task"();



CREATE OR REPLACE TRIGGER "task_assignment_notice" AFTER INSERT ON "public"."task_assignees" FOR EACH ROW EXECUTE FUNCTION "notification_internal"."task_assignment_notice"();



CREATE OR REPLACE TRIGGER "trg_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "users_assign_primary_role" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."assign_primary_role_on_user_insert"();



ALTER TABLE ONLY "public"."api_integrations"
    ADD CONSTRAINT "api_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_feed_tokens"
    ADD CONSTRAINT "calendar_feed_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."mechanical_design_details"
    ADD CONSTRAINT "mechanical_design_details_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."project_priority"("id");



ALTER TABLE ONLY "public"."mechanical_design_details"
    ADD CONSTRAINT "mechanical_design_details_project_status_id_fkey" FOREIGN KEY ("project_status_id") REFERENCES "public"."project_status"("id");



ALTER TABLE ONLY "public"."mechanical_design_details"
    ADD CONSTRAINT "mechanical_design_details_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."mechanical_design_details"
    ADD CONSTRAINT "mechanical_design_details_requested_for_id_fkey" FOREIGN KEY ("requested_for_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."mechanical_design_other_managers"
    ADD CONSTRAINT "mechanical_design_other_managers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."mechanical_design_details"("request_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mechanical_design_other_managers"
    ADD CONSTRAINT "mechanical_design_other_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_allocations"
    ADD CONSTRAINT "planning_allocations_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."planning_allocations"
    ADD CONSTRAINT "planning_allocations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."presales_assets"
    ADD CONSTRAINT "presales_assets_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."presales_details"("request_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."presales_assets"
    ADD CONSTRAINT "presales_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_commercial_manager_id_fkey" FOREIGN KEY ("commercial_manager_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_execution_project_id_fkey" FOREIGN KEY ("execution_project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_origin_code_fkey" FOREIGN KEY ("origin_code") REFERENCES "public"."presales_origins"("code");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."project_priority"("id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."presales_details"
    ADD CONSTRAINT "presales_details_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."presales_document_revisions"
    ADD CONSTRAINT "presales_document_revisions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."presales_document_revisions"
    ADD CONSTRAINT "presales_document_revisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."presales_details"("request_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."presales_document_templates"
    ADD CONSTRAINT "presales_document_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."presales_items"
    ADD CONSTRAINT "presales_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."presales_details"("request_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_category_link"
    ADD CONSTRAINT "project_category_link_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."project_category"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_category_link"
    ADD CONSTRAINT "project_category_link_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_materials"
    ADD CONSTRAINT "project_materials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_partners_link"
    ADD CONSTRAINT "project_partners_link_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."project_partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_partners_link"
    ADD CONSTRAINT "project_partners_link_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_priority_link"
    ADD CONSTRAINT "project_priority_link_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."project_priority"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_priority_link"
    ADD CONSTRAINT "project_priority_link_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_risk_items"
    ADD CONSTRAINT "project_risk_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."risk_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_risk_items"
    ADD CONSTRAINT "project_risk_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_risk_items"
    ADD CONSTRAINT "project_risk_items_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."risk_priorities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_risk_items"
    ADD CONSTRAINT "project_risk_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_risk_items"
    ADD CONSTRAINT "project_risk_items_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."risk_statuses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_risk_link"
    ADD CONSTRAINT "project_risk_link_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_risk_link"
    ADD CONSTRAINT "project_risk_link_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "public"."project_risk"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_teams_link"
    ADD CONSTRAINT "project_teams_link_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_teams_link"
    ADD CONSTRAINT "project_teams_link_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."project_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."project_category"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_field_manager_id_fkey" FOREIGN KEY ("field_manager_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."project_status"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resource_non_project_allocations"
    ADD CONSTRAINT "resource_non_project_allocations_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."resource_non_project_allocations"
    ADD CONSTRAINT "resource_non_project_allocations_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "public"."non_project_work"("id");



ALTER TABLE ONLY "public"."resource_skills"
    ADD CONSTRAINT "resource_skills_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."resource_skills"
    ADD CONSTRAINT "resource_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id");



ALTER TABLE ONLY "public"."resource_work_schedules"
    ADD CONSTRAINT "resource_work_schedules_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."resource_work_schedules"
    ADD CONSTRAINT "resource_work_schedules_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_skill_requirements"
    ADD CONSTRAINT "task_skill_requirements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id");



ALTER TABLE ONLY "public"."task_skill_requirements"
    ADD CONSTRAINT "task_skill_requirements_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."project_priority"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



COMMENT ON CONSTRAINT "tasks_project_id_fkey" ON "public"."tasks" IS 'Garante que nenhum projeto pode ser fisicamente eliminado no PostgreSQL enquanto contiver tarefas associadas.';



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."task_status"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_absences"
    ADD CONSTRAINT "user_absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_request_events"
    ADD CONSTRAINT "work_request_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."work_request_events"
    ADD CONSTRAINT "work_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_request_tasks"
    ADD CONSTRAINT "work_request_tasks_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_request_tasks"
    ADD CONSTRAINT "work_request_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_requests"
    ADD CONSTRAINT "work_requests_area_owner_id_fkey" FOREIGN KEY ("area_owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."work_requests"
    ADD CONSTRAINT "work_requests_delivered_by_fkey" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."work_requests"
    ADD CONSTRAINT "work_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."work_requests"
    ADD CONSTRAINT "work_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."work_schedule_override_periods"
    ADD CONSTRAINT "work_schedule_override_periods_override_id_fkey" FOREIGN KEY ("override_id") REFERENCES "public"."work_schedule_overrides"("id");



ALTER TABLE ONLY "public"."work_schedule_overrides"
    ADD CONSTRAINT "work_schedule_overrides_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."work_schedule_periods"
    ADD CONSTRAINT "work_schedule_periods_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id");



ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."work_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT;



ALTER TABLE "private"."rate_limit_windows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Admins can delete non_project_work" ON "public"."non_project_work" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete planning_allocations" ON "public"."planning_allocations" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete resource_non_project_allocations" ON "public"."resource_non_project_allocations" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete resource_skills" ON "public"."resource_skills" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete resource_work_schedules" ON "public"."resource_work_schedules" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete skills" ON "public"."skills" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete task_skill_requirements" ON "public"."task_skill_requirements" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete work_schedule_override_periods" ON "public"."work_schedule_override_periods" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete work_schedule_overrides" ON "public"."work_schedule_overrides" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete work_schedule_periods" ON "public"."work_schedule_periods" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete work_schedules" ON "public"."work_schedules" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow read access to permissions for authenticated users" ON "public"."permissions" FOR SELECT TO "authenticated", "service_role" USING (true);



CREATE POLICY "Allow read access to role_permissions for authenticated users" ON "public"."role_permissions" FOR SELECT TO "authenticated", "service_role" USING (true);



CREATE POLICY "Allow read access to roles for authenticated users" ON "public"."roles" FOR SELECT TO "authenticated", "service_role" USING (true);



CREATE POLICY "Approved users can insert non_project_work" ON "public"."non_project_work" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert planning_allocations" ON "public"."planning_allocations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert resource_non_project_allocations" ON "public"."resource_non_project_allocations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert resource_skills" ON "public"."resource_skills" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert resource_work_schedules" ON "public"."resource_work_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert skills" ON "public"."skills" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert task_skill_requirements" ON "public"."task_skill_requirements" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert work_schedule_override_periods" ON "public"."work_schedule_override_periods" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert work_schedule_overrides" ON "public"."work_schedule_overrides" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert work_schedule_periods" ON "public"."work_schedule_periods" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can insert work_schedules" ON "public"."work_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update non_project_work" ON "public"."non_project_work" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update planning_allocations" ON "public"."planning_allocations" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update resource_non_project_allocations" ON "public"."resource_non_project_allocations" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update resource_skills" ON "public"."resource_skills" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update resource_work_schedules" ON "public"."resource_work_schedules" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update skills" ON "public"."skills" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update task_skill_requirements" ON "public"."task_skill_requirements" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update work_schedule_override_periods" ON "public"."work_schedule_override_periods" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update work_schedule_overrides" ON "public"."work_schedule_overrides" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update work_schedule_periods" ON "public"."work_schedule_periods" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can update work_schedules" ON "public"."work_schedules" FOR UPDATE TO "authenticated" USING ("public"."is_approved"()) WITH CHECK ("public"."is_approved"());



CREATE POLICY "Approved users can view non_project_work" ON "public"."non_project_work" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view planning_allocations" ON "public"."planning_allocations" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view resource_non_project_allocations" ON "public"."resource_non_project_allocations" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view resource_skills" ON "public"."resource_skills" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view resource_work_schedules" ON "public"."resource_work_schedules" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view skills" ON "public"."skills" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view task_skill_requirements" ON "public"."task_skill_requirements" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view work_schedule_override_periods" ON "public"."work_schedule_override_periods" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view work_schedule_overrides" ON "public"."work_schedule_overrides" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view work_schedule_periods" ON "public"."work_schedule_periods" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Approved users can view work_schedules" ON "public"."work_schedules" FOR SELECT TO "authenticated" USING ("public"."is_approved"());



CREATE POLICY "Public can read app branding" ON "public"."app_configuration" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."api_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_configuration" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "backend_only_no_direct_api" ON "public"."audit_logs" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."automation_rules" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."clients" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."comments" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."default_tasks" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."equipment" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."erp_projects" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."erp_tasks" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."notification_reads" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."notification_settings" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."notifications" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_category" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_category_link" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_materials" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_partners" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_partners_link" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_priority" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_priority_link" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_risk" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_risk_items" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_risk_link" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_status" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_teams" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."project_teams_link" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."projects" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."risk_categories" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."risk_priorities" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."risk_statuses" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."special_days" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."task_assignees" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."task_status" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."task_types" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."tasks" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."user_absences" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."user_groups" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."user_roles" TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "backend_only_no_direct_api" ON "public"."users" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."calendar_feed_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."default_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."erp_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."erp_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mechanical_design_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mechanical_design_other_managers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."non_project_work" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planning_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presales_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presales_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presales_document_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presales_document_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presales_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presales_origins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_category" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_category_link" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_partners_link" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_priority" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_priority_link" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_risk" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_risk_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_risk_link" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_teams_link" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_non_project_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resource_work_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."risk_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."risk_priorities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."risk_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."special_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_assignees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_skill_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_absences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_request_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_request_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_schedule_override_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_schedule_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_schedule_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_task_events" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "notification_internal" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "notification_internal"."generate_mechanical_design_due"("p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "notification_internal"."generate_mechanical_design_due"("p_today" "date") TO "service_role";



REVOKE ALL ON FUNCTION "notification_internal"."generate_presales_due"("p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "notification_internal"."generate_presales_due"("p_today" "date") TO "service_role";



REVOKE ALL ON FUNCTION "notification_internal"."presales_recipients"("p_group" "text", "p_request" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "notification_internal"."presales_request_event"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "notification_internal"."project_assignment_notice"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "notification_internal"."recipients"("p_group" "text", "p_project" "uuid", "p_task" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "notification_internal"."recipients"("p_group" "text", "p_project" "uuid", "p_task" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "notification_internal"."run_mechanical_design_task_rules"("p_task_id" "uuid", "p_event" "text", "p_from_status" "uuid", "p_to_status" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "notification_internal"."task_assignment_notice"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."activate_assigned_work_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_assigned_work_request"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_mechanical_design_task"("p_request_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text", "p_assignee_ids" "uuid"[], "p_estimated_days" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_mechanical_design_task"("p_request_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_title" "text", "p_description" "text", "p_assignee_ids" "uuid"[], "p_estimated_days" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_role"("p_id" "uuid", "p_code" "text", "p_name" "text", "p_description" "text", "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_role"("p_id" "uuid", "p_code" "text", "p_name" "text", "p_description" "text", "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_replace_role_permissions"("p_role_id" "uuid", "p_permission_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_replace_role_permissions"("p_role_id" "uuid", "p_permission_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_replace_user_roles"("p_user_id" "uuid", "p_role_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_replace_user_roles"("p_user_id" "uuid", "p_role_ids" "uuid"[], "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_role"("p_role_id" "uuid", "p_changes" "jsonb", "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_role"("p_role_id" "uuid", "p_changes" "jsonb", "p_actor_id" "uuid", "p_ip" "text", "p_user_agent" "text", "p_request_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_work_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_work_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_mechanical_design_task"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_assignee_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_mechanical_design_task"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_assignee_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_primary_role_on_user_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_primary_role_on_user_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_legacy_sync_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_legacy_sync_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_owner_id" "uuid", "p_title" "text", "p_instructions" "text", "p_deliverables" "text", "p_project_id" "uuid", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_created_by" "uuid", "p_is_urgent" boolean, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_created_by" "uuid", "p_assignee_user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_created_by" "uuid", "p_assignee_user_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_created_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_priority_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_task_atomic"("p_id" "uuid", "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_created_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_priority_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_project_transaction"("p_id" "uuid", "p_expected_version" integer, "p_updated_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_project_transaction"("p_id" "uuid", "p_expected_version" integer, "p_updated_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_updated_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_updated_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."edit_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_mechanical_design_request_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."edit_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_mechanical_design_request_v3"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_planned_start_date" "date", "p_planned_end_date" "date", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[], "p_requested_for_id" "uuid", "p_priority_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_due_notifications"("p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_due_notifications"("p_today" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_mechanical_design_assignees_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_mechanical_design_assignees_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_mechanical_design_manager_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_mechanical_design_manager_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_mechanical_design_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_mechanical_design_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_mechanical_design_reopen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_mechanical_design_reopen"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_mechanical_design_task_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_mechanical_design_task_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_presales_assignees_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_presales_assignees_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_presales_contacts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_presales_contacts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_presales_revision_assets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_presales_revision_assets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_presales_revision_immutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_presales_revision_immutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_presales_task_estimate"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_presales_task_estimate"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_presales_task_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_presales_task_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_permission_code" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_permission_code" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_approved"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_approved"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_mechanical_design_manager"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_mechanical_design_manager"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_calendar_feed_events"("p_scope" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_calendar_feed_events"("p_scope" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_integration_changes"("p_kind" "text", "p_client_ids" "uuid"[], "p_project_ids" "uuid"[], "p_project_id" "uuid", "p_since" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_integration_changes"("p_kind" "text", "p_client_ids" "uuid"[], "p_project_ids" "uuid"[], "p_project_id" "uuid", "p_since" timestamp with time zone, "p_cursor_at" timestamp with time zone, "p_cursor_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."manage_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_assignee_ids" "uuid"[], "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_estimated_days" numeric, "p_planned_start_date" "date", "p_planned_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_mechanical_design_request"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_assignee_ids" "uuid"[], "p_instructions" "text", "p_deliverables" "text", "p_file_identifier" "text", "p_file_revision" "text", "p_estimated_days" numeric, "p_planned_start_date" "date", "p_planned_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mechanical_design_actor"("p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mechanical_design_actor"("p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mechanical_design_task_action"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_task_version" integer, "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mechanical_design_task_action"("p_request_id" "uuid", "p_task_id" "uuid", "p_actor_id" "uuid", "p_expected_task_version" integer, "p_action" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."planning_allocation_tsrange"("d" "date", "s_time" time without time zone, "e_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."planning_allocation_tsrange"("d" "date", "s_time" time without time zone, "e_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."planning_allocation_tsrange"("d" "date", "s_time" time without time zone, "e_time" time without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."presales_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."presales_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."presales_mutate_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."presales_mutate_v2"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."presales_registry_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."presales_registry_mutate"("p_id" "uuid", "p_actor_id" "uuid", "p_expected_version" integer, "p_action" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_mechanical_design_project_fields"("p_request_id" "uuid", "p_owner_id" "uuid", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_mechanical_design_project_fields"("p_request_id" "uuid", "p_owner_id" "uuid", "p_usage_text" "text", "p_project_status_id" "uuid", "p_other_manager_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_mechanical_design_requester_priority"("p_request_id" "uuid", "p_requested_for_id" "uuid", "p_priority_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_mechanical_design_requester_priority"("p_request_id" "uuid", "p_requested_for_id" "uuid", "p_priority_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_presales_initial_task"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_presales_initial_task"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_project_transaction"("p_id" "uuid", "p_demo" boolean, "p_client_id" "uuid", "p_project_title" "text", "p_project_description" "text", "p_status_id" "uuid", "p_project_manager_id" "uuid", "p_field_manager_id" "uuid", "p_sales_rep_id" "uuid", "p_start_date" "date", "p_delivery_date" "date", "p_estimated_date" "date", "p_scheduled_date" "date", "p_completed_date" "date", "p_install_project_no" "text", "p_sf_opportunity_no" "text", "p_documents" "text", "p_budget_value" numeric, "p_client_contact_name" "text", "p_client_contact_email" "text", "p_client_contact_phone" "text", "p_color" "text", "p_notes" "text", "p_is_urgent" boolean, "p_updated_by" "uuid", "p_expected_version" integer, "p_priority_id" "uuid", "p_risk_id" "uuid", "p_category_ids" "uuid"[], "p_teams_involved_ids" "uuid"[], "p_partners_ids" "uuid"[], "p_forecast_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean, "p_priority_id" "uuid", "p_update_priority" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_task_atomic"("p_id" "uuid", "p_expected_version" integer, "p_project_id" "uuid", "p_task_title" "text", "p_status_id" "text", "p_task_type_id" "text", "p_estimated_hours" interval, "p_actual_hours" interval, "p_start_date" "date", "p_start_time" time without time zone, "p_end_date" "date", "p_end_time" time without time zone, "p_estimated_date" "date", "p_completed_date" "date", "p_task_description" "text", "p_notes" "text", "p_is_milestone" boolean, "p_updated_by" "uuid", "p_assignee_user_ids" "uuid"[], "p_update_assignees" boolean, "p_update_project_id" boolean, "p_update_dates" boolean, "p_priority_id" "uuid", "p_update_priority" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."write_legacy_batch"("p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."write_legacy_batch"("p_changes" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."api_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."api_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."app_configuration" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_feed_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."default_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."erp_projects" TO "service_role";



GRANT ALL ON TABLE "public"."erp_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."mechanical_design_details" TO "service_role";



GRANT ALL ON TABLE "public"."mechanical_design_other_managers" TO "service_role";



GRANT ALL ON TABLE "public"."non_project_work" TO "service_role";



GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."permissions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."planning_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."presales_assets" TO "service_role";



GRANT ALL ON TABLE "public"."presales_details" TO "service_role";



GRANT ALL ON TABLE "public"."presales_document_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."presales_document_templates" TO "service_role";



GRANT ALL ON TABLE "public"."presales_items" TO "service_role";



GRANT ALL ON TABLE "public"."presales_origins" TO "service_role";



GRANT ALL ON SEQUENCE "public"."presales_process_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."presales_process_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."presales_process_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."project_category" TO "service_role";



GRANT ALL ON TABLE "public"."project_category_link" TO "service_role";



GRANT ALL ON TABLE "public"."project_materials" TO "service_role";



GRANT ALL ON TABLE "public"."project_partners" TO "service_role";



GRANT ALL ON TABLE "public"."project_partners_link" TO "service_role";



GRANT ALL ON TABLE "public"."project_priority" TO "service_role";



GRANT ALL ON TABLE "public"."project_priority_link" TO "service_role";



GRANT ALL ON TABLE "public"."project_risk" TO "service_role";



GRANT ALL ON TABLE "public"."project_risk_items" TO "service_role";



GRANT ALL ON TABLE "public"."project_risk_link" TO "service_role";



GRANT ALL ON TABLE "public"."project_status" TO "service_role";



GRANT ALL ON TABLE "public"."project_teams" TO "service_role";



GRANT ALL ON TABLE "public"."project_teams_link" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."resource_non_project_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."resource_skills" TO "service_role";



GRANT ALL ON TABLE "public"."resource_work_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."risk_categories" TO "service_role";



GRANT ALL ON TABLE "public"."risk_priorities" TO "service_role";



GRANT ALL ON TABLE "public"."risk_statuses" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."role_permissions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."role_permissions" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."roles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."skills" TO "service_role";



GRANT ALL ON TABLE "public"."special_days" TO "service_role";



GRANT ALL ON TABLE "public"."task_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."task_skill_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."task_status" TO "service_role";



GRANT ALL ON TABLE "public"."task_types" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_absences" TO "service_role";



GRANT ALL ON TABLE "public"."user_groups" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."work_request_events" TO "service_role";



GRANT ALL ON TABLE "public"."work_request_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."work_requests" TO "service_role";



GRANT ALL ON TABLE "public"."work_schedule_override_periods" TO "service_role";



GRANT ALL ON TABLE "public"."work_schedule_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."work_schedule_periods" TO "service_role";



GRANT ALL ON TABLE "public"."work_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."work_task_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Existing production tables were explicitly restricted after creation.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.permissions, public.role_permissions TO authenticated;
REVOKE TRUNCATE ON public.permissions, public.role_permissions, public.roles FROM service_role;







