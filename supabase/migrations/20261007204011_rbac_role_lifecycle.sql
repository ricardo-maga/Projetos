-- Atomic role creation and soft lifecycle with an audit record in the same transaction.
CREATE OR REPLACE FUNCTION public.admin_create_role(
  p_id UUID, p_code TEXT, p_name TEXT, p_description TEXT, p_actor_id UUID,
  p_ip TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL, p_request_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_role public.roles%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'') <> 'External'
  ) THEN
    RAISE EXCEPTION 'Executor inválido ou operação apenas de serviço.' USING ERRCODE = '42501';
  END IF;
  IF auth.role() <> 'service_role' OR NOT public.has_permission('roles.manage',(SELECT auth_user_id FROM public.users WHERE id=p_actor_id)) THEN
    RAISE EXCEPTION 'Apenas o Super Administrador pode criar funções.' USING ERRCODE = '42501';
  END IF;
  IF p_code !~ '^CUSTOM_[A-Z0-9_]{1,48}$' OR length(trim(p_name)) NOT BETWEEN 1 AND 80
     OR length(COALESCE(p_description,'')) > 500 THEN
    RAISE EXCEPTION 'Dados da função inválidos.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.roles (id,code,name,description,is_system,is_active,updated_by)
  VALUES (p_id,p_code,trim(p_name),NULLIF(trim(p_description),''),FALSE,TRUE,p_actor_id)
  RETURNING * INTO v_role;
  INSERT INTO public.audit_logs
    (user_id,user_name,user_email,action,entity,entity_id,entity_type,entity_name,details,ip,user_agent,request_id)
  SELECT p_actor_id,u.name,u.email,'SETTINGS','SYSTEM',p_id,'SYSTEM','role.created',
    jsonb_build_object('after',to_jsonb(v_role)),p_ip,p_user_agent,p_request_id
  FROM public.users u WHERE u.id=p_actor_id;
  RETURN to_jsonb(v_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_role(
  p_role_id UUID, p_changes JSONB, p_actor_id UUID,
  p_ip TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL, p_request_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_before public.roles%ROWTYPE; v_after public.roles%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'') <> 'External'
  ) THEN
    RAISE EXCEPTION 'Executor inválido ou operação apenas de serviço.' USING ERRCODE = '42501';
  END IF;
  IF auth.role() <> 'service_role' OR NOT public.has_permission('roles.manage',(SELECT auth_user_id FROM public.users WHERE id=p_actor_id)) THEN
    RAISE EXCEPTION 'Apenas o Super Administrador pode editar funções.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object'
     OR p_changes - ARRAY['name','description','is_active'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Campos de edição inválidos.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_before FROM public.roles WHERE id=p_role_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Função não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF p_changes ? 'name' AND (jsonb_typeof(p_changes->'name') <> 'string' OR length(trim(p_changes->>'name')) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'Nome inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_changes ? 'description' AND jsonb_typeof(p_changes->'description') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'Descrição inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_changes ? 'description' AND length(COALESCE(p_changes->>'description','')) > 500 THEN
    RAISE EXCEPTION 'Descrição demasiado longa.' USING ERRCODE = '22023';
  END IF;
  IF p_changes ? 'is_active' AND jsonb_typeof(p_changes->'is_active') <> 'boolean' THEN
    RAISE EXCEPTION 'Estado inválido.' USING ERRCODE = '22023';
  END IF;
  IF v_before.is_system AND p_changes->>'is_active' = 'false' THEN
    RAISE EXCEPTION 'Funções de sistema não podem ser desativadas.' USING ERRCODE = '23514';
  END IF;
  IF p_changes->>'is_active' = 'false' AND EXISTS (SELECT 1 FROM public.user_roles WHERE role_id=p_role_id) THEN
    RAISE EXCEPTION 'Remova primeiro as atribuições desta função.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.roles SET
    name = CASE WHEN p_changes ? 'name' THEN trim(p_changes->>'name') ELSE name END,
    description = CASE WHEN p_changes ? 'description' THEN NULLIF(trim(p_changes->>'description'),'') ELSE description END,
    is_active = CASE WHEN p_changes ? 'is_active' THEN (p_changes->>'is_active')::boolean ELSE is_active END,
    updated_at=NOW(),updated_by=p_actor_id
  WHERE id=p_role_id RETURNING * INTO v_after;
  INSERT INTO public.audit_logs
    (user_id,user_name,user_email,action,entity,entity_id,entity_type,entity_name,details,ip,user_agent,request_id)
  SELECT p_actor_id,u.name,u.email,'SETTINGS','SYSTEM',p_role_id,'SYSTEM',
    CASE WHEN v_before.is_active AND NOT v_after.is_active THEN 'role.disabled' ELSE 'role.updated' END,
    jsonb_build_object('before',to_jsonb(v_before),'after',to_jsonb(v_after)),p_ip,p_user_agent,p_request_id
  FROM public.users u WHERE u.id=p_actor_id;
  RETURN to_jsonb(v_after);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_role(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_update_role(UUID,JSONB,UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_role(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_role(UUID,JSONB,UUID,TEXT,TEXT,TEXT) TO service_role;
