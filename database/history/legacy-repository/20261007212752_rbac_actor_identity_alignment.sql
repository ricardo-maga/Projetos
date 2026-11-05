-- Align service-only RBAC administration RPCs with the canonical auth identity.
-- The service API still supplies the internal profile ID for writes and audit;
-- has_permission receives auth_user_id (falling back for legacy linked users).
CREATE OR REPLACE FUNCTION public.admin_replace_role_permissions(
  p_role_id UUID, p_permission_ids UUID[], p_actor_id UUID,
  p_ip TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL, p_request_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_role public.roles%ROWTYPE; v_requested_count INTEGER; v_valid_count INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Server-only operation' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'')<>'External') THEN
    RAISE EXCEPTION 'Executor inválido ou inativo.' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_permission('roles.manage',COALESCE((SELECT auth_user_id FROM public.users WHERE id=p_actor_id),p_actor_id)) THEN
    RAISE EXCEPTION 'Apenas o Super Administrador pode gerir permissões.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_role FROM public.roles WHERE id=p_role_id FOR UPDATE;
  IF NOT FOUND OR v_role.is_active IS NOT TRUE THEN RAISE EXCEPTION 'Função inexistente ou inativa.' USING ERRCODE='P0002'; END IF;
  IF v_role.code='SUPER_ADMIN' THEN RAISE EXCEPTION 'As permissões do Super Administrador são sempre completas.' USING ERRCODE='23514'; END IF;
  SELECT count(DISTINCT x) INTO v_requested_count FROM unnest(COALESCE(p_permission_ids,ARRAY[]::UUID[])) x;
  SELECT count(*) INTO v_valid_count FROM public.permissions p
    WHERE p.id=ANY(COALESCE(p_permission_ids,ARRAY[]::UUID[])) AND p.is_active IS TRUE AND p.code NOT LIKE 'roles.%';
  IF v_requested_count<>v_valid_count THEN RAISE EXCEPTION 'A lista contém permissões inativas, inexistentes ou reservadas.' USING ERRCODE='22023'; END IF;
  DELETE FROM public.role_permissions WHERE role_id=p_role_id;
  INSERT INTO public.role_permissions(role_id,permission_id,granted_by)
    SELECT p_role_id,p.id,p_actor_id FROM public.permissions p WHERE p.id=ANY(COALESCE(p_permission_ids,ARRAY[]::UUID[]));
  UPDATE public.roles SET updated_at=NOW(),updated_by=p_actor_id WHERE id=p_role_id;
  INSERT INTO public.audit_logs(user_id,user_name,user_email,action,entity_type,entity_id,entity_name,details,ip,user_agent,request_id)
    SELECT p_actor_id,u.name,u.email,'SETTINGS','SYSTEM',p_role_id,'role.permissions.updated',
      jsonb_build_object('roleCode',v_role.code,'permissionIds',COALESCE(p_permission_ids,ARRAY[]::UUID[]))::text,
      p_ip,p_user_agent,p_request_id FROM public.users u WHERE u.id=p_actor_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_replace_user_roles(
  p_user_id UUID, p_role_ids UUID[], p_actor_id UUID,
  p_ip TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL, p_request_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_target public.users%ROWTYPE; v_requested_count INTEGER; v_valid_count INTEGER; v_keeps_super_admin BOOLEAN;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Server-only operation' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_actor_id AND approved IS TRUE AND deleted IS NOT TRUE AND COALESCE(type,'')<>'External') THEN
    RAISE EXCEPTION 'Executor inválido ou inativo.' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_permission('roles.manage',COALESCE((SELECT auth_user_id FROM public.users WHERE id=p_actor_id),p_actor_id)) THEN
    RAISE EXCEPTION 'Apenas o Super Administrador pode atribuir funções.' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rbac:last-super-admin',0));
  SELECT * INTO v_target FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.deleted IS TRUE THEN RAISE EXCEPTION 'Utilizador inexistente ou eliminado.' USING ERRCODE='P0002'; END IF;
  IF COALESCE(v_target.type,'')='External' AND cardinality(COALESCE(p_role_ids,ARRAY[]::UUID[]))>0 THEN
    RAISE EXCEPTION 'Utilizadores externos não podem receber funções internas.' USING ERRCODE='42501';
  END IF;
  SELECT count(DISTINCT x) INTO v_requested_count FROM unnest(COALESCE(p_role_ids,ARRAY[]::UUID[])) x;
  SELECT count(*) INTO v_valid_count FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[])) AND r.is_active IS TRUE;
  IF v_requested_count<>v_valid_count THEN RAISE EXCEPTION 'A lista contém funções inativas ou inexistentes.' USING ERRCODE='22023'; END IF;
  v_keeps_super_admin:=EXISTS(SELECT 1 FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[])) AND r.code='SUPER_ADMIN');
  IF NOT v_keeps_super_admin
    AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.code='SUPER_ADMIN')
    AND NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id JOIN public.users u ON u.id=ur.user_id
      WHERE r.code='SUPER_ADMIN' AND ur.user_id<>p_user_id AND u.approved IS TRUE AND u.deleted IS NOT TRUE) THEN
    RAISE EXCEPTION 'Não é possível remover o último Super Administrador.' USING ERRCODE='23514';
  END IF;
  DELETE FROM public.user_roles WHERE user_id=p_user_id;
  INSERT INTO public.user_roles(user_id,role_id,assigned_by)
    SELECT p_user_id,r.id,p_actor_id FROM public.roles r WHERE r.id=ANY(COALESCE(p_role_ids,ARRAY[]::UUID[]));
  UPDATE public.users SET role_id=(COALESCE(p_role_ids,ARRAY[]::UUID[]))[1] WHERE id=p_user_id;
  INSERT INTO public.audit_logs(user_id,user_name,user_email,action,entity_type,entity_id,entity_name,details,ip,user_agent,request_id)
    SELECT p_actor_id,u.name,u.email,'SETTINGS','USER',p_user_id,'user.roles.updated',
      jsonb_build_object('roleIds',COALESCE(p_role_ids,ARRAY[]::UUID[]))::text,p_ip,p_user_agent,p_request_id
      FROM public.users u WHERE u.id=p_actor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_replace_role_permissions(UUID,UUID[],UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_replace_user_roles(UUID,UUID[],UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_role_permissions(UUID,UUID[],UUID,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_replace_user_roles(UUID,UUID[],UUID,TEXT,TEXT,TEXT) TO service_role;
