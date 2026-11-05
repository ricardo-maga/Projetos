-- Align the narrow is_admin compatibility grant with the permission names
-- actually requested by the application. PostgreSQL remains authoritative.
CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_code text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
    '_(read|write|delete|create|update|manage)$', '.\\1');
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
$function$;

REVOKE ALL ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated, service_role;
