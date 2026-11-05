-- Retire global Materials and Quotes RBAC entries while preserving only
-- project-scoped material permissions under an unambiguous module.
BEGIN;

INSERT INTO public.permissions (code, module, action, description, is_system, is_active)
VALUES
  ('project_materials.read', 'project_materials', 'read', 'Visualizar materiais do projeto', true, true),
  ('project_materials.create', 'project_materials', 'create', 'Criar materiais do projeto', true, true),
  ('project_materials.update', 'project_materials', 'update', 'Editar materiais do projeto', true, true),
  ('project_materials.delete', 'project_materials', 'delete', 'Eliminar materiais do projeto', true, true)
ON CONFLICT (code) DO UPDATE
SET module = EXCLUDED.module,
    action = EXCLUDED.action,
    description = EXCLUDED.description,
    is_active = true,
    deprecated_at = NULL,
    updated_at = now();

-- Preserve the existing role matrix from the active project-material permissions
-- before removing every legacy materials/quotes catalogue entry.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, replacement.id
FROM public.role_permissions rp
JOIN public.permissions legacy ON legacy.id = rp.permission_id
JOIN public.permissions replacement
  ON replacement.code = 'project_materials.' || split_part(legacy.code, '.', 2)
WHERE legacy.code IN ('materials.read', 'materials.create', 'materials.update', 'materials.delete')
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions rp
USING public.permissions p
WHERE rp.permission_id = p.id
  AND (
    p.code LIKE 'materials.%' OR p.code LIKE 'materials:%'
    OR p.code LIKE 'quotes.%' OR p.code LIKE 'quotes:%'
  );

DELETE FROM public.permissions
WHERE code LIKE 'materials.%' OR code LIKE 'materials:%'
   OR code LIKE 'quotes.%' OR code LIKE 'quotes:%';

CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code text, p_user_id uuid DEFAULT NULL::uuid)
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
  IF auth.role() = 'authenticated' THEN
    v_auth_uid := auth.uid();
  ELSE
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

  -- Colons separate module/action. Legacy underscores are normalized only at
  -- the final action separator, so project_materials:read remains intact.
  v_canonical_code := replace(p_permission_code, ':', '.');
  v_canonical_code := regexp_replace(v_canonical_code,
    '_(read|write|delete|create|update|manage)$', '.\\1');
  v_module := split_part(v_canonical_code, '.', 1);
  v_action := split_part(v_canonical_code, '.', 2);

  IF v_profile.is_admin IS TRUE AND v_canonical_code IN ('admin.access', 'config.manage') THEN
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

COMMIT;
