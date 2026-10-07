-- Extensible RBAC foundation for the canonical 10000000 role IDs.
-- Keep the direct Data API closed: application routes use the server-only admin client
-- after checking public.has_permission().

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.permissions
SET action = split_part(code, ':', 2)
WHERE action IS NULL AND position(':' IN code) > 0;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module_active ON public.permissions(module, is_active);

UPDATE public.roles
SET is_system = TRUE, is_active = TRUE, updated_at = NOW()
WHERE code IN ('SUPER_ADMIN','ADMIN','PROJECT_MANAGER','TECHNICIAN','COMMERCIAL','SOLUTIONS','VIEWER');

-- Migrate current single-role assignments without changing canonical role IDs.
INSERT INTO public.user_roles (user_id, role_id)
SELECT id, role_id FROM public.users
WHERE role_id IS NOT NULL AND deleted IS NOT TRUE
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Keep profiles created by the existing signup flow usable until that flow is
-- moved to the role-assignment API. This only adds the initial primary role.
CREATE OR REPLACE FUNCTION public.assign_primary_role_on_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, NEW.role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_primary_role_on_user_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS users_assign_primary_role ON public.users;
CREATE TRIGGER users_assign_primary_role
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.assign_primary_role_on_user_insert();

-- Canonical dot-separated catalog. Legacy colon codes remain as deprecated aliases
-- so existing callers/RPCs continue to work during the application rollout.
INSERT INTO public.permissions (code, module, action, description, is_system, is_active)
SELECT DISTINCT
  split_part(code, ':', 1) || '.' ||
    CASE split_part(code, ':', 2)
      WHEN 'write' THEN 'update'
      ELSE split_part(code, ':', 2)
    END,
  split_part(code, ':', 1),
  CASE split_part(code, ':', 2) WHEN 'write' THEN 'update' ELSE split_part(code, ':', 2) END,
  description, TRUE, TRUE
FROM public.permissions
WHERE position(':' IN code) > 0
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_active = TRUE,
  deprecated_at = NULL,
  updated_at = NOW();

-- Preserve existing grants. A legacy *.write grant maps to both create and update.
INSERT INTO public.permissions (code, module, action, description, is_system, is_active)
SELECT DISTINCT split_part(p.code, ':', 1) || '.create', split_part(p.code, ':', 1), 'create',
       'Criar ' || split_part(p.code, ':', 1), TRUE, TRUE
FROM public.permissions p
WHERE split_part(p.code, ':', 2) = 'write'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, canonical.id
FROM public.role_permissions rp
JOIN public.permissions legacy ON legacy.id = rp.permission_id
JOIN public.permissions canonical
  ON canonical.code = split_part(legacy.code, ':', 1) || '.' ||
    CASE split_part(legacy.code, ':', 2) WHEN 'write' THEN 'update' ELSE split_part(legacy.code, ':', 2) END
WHERE position(':' IN legacy.code) > 0
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, canonical.id
FROM public.role_permissions rp
JOIN public.permissions legacy ON legacy.id = rp.permission_id AND split_part(legacy.code, ':', 2) = 'write'
JOIN public.permissions canonical ON canonical.code = split_part(legacy.code, ':', 1) || '.create'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.permissions (code, module, action, description, is_system, is_active)
VALUES
  ('app.access','app','access','Aceder à aplicação interna',TRUE,TRUE),
  ('roles.read','roles','read','Consultar funções e permissões',TRUE,TRUE),
  ('roles.manage','roles','manage','Gerir funções e atribuições',TRUE,TRUE)
ON CONFLICT (code) DO UPDATE SET is_active = TRUE, deprecated_at = NULL, updated_at = NOW();

-- Only users already assigned a system role receive app access. External profiles
-- are deliberately excluded even if they currently have a legacy role.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT ur.role_id, p.id
FROM public.user_roles ur
JOIN public.users u ON u.id = ur.user_id
JOIN public.permissions p ON p.code = 'app.access'
WHERE u.approved IS TRUE AND u.deleted IS NOT TRUE AND COALESCE(u.type, '') <> 'External'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Security administration is reserved to the canonical Super Administrator role.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'SUPER_ADMIN' AND p.code IN ('roles.read','roles.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

UPDATE public.permissions
SET is_active = FALSE, deprecated_at = COALESCE(deprecated_at, NOW()), updated_at = NOW()
WHERE position(':' IN code) > 0;

-- Multi-role authorization. For the trusted service role, p_user_id remains an
-- explicit server-side target; authenticated callers can only check themselves.
CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_code TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_auth_uid UUID;
  v_profile RECORD;
  v_canonical_code TEXT;
  v_module TEXT;
  v_action TEXT;
BEGIN
  IF auth.role() = 'authenticated' THEN
    v_auth_uid := auth.uid();
  ELSE
    v_auth_uid := p_user_id;
  END IF;

  IF v_auth_uid IS NULL THEN RETURN FALSE; END IF;

  SELECT id, auth_user_id, role_id, is_admin, approved, deleted, type
  INTO v_profile
  FROM public.users
  WHERE auth_user_id = v_auth_uid OR id = v_auth_uid
  ORDER BY (auth_user_id = v_auth_uid) DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND OR v_profile.approved IS NOT TRUE OR v_profile.deleted IS TRUE
     OR COALESCE(v_profile.type, '') = 'External' THEN
    RETURN FALSE;
  END IF;

  v_canonical_code := regexp_replace(p_permission_code, '^([^_:]+)[:_]', '\1.');
  v_module := split_part(v_canonical_code, '.', 1);
  v_action := split_part(v_canonical_code, '.', 2);

  -- is_admin remains a narrowly scoped compatibility flag during rollout.
  IF v_profile.is_admin IS TRUE AND v_canonical_code IN ('admin.access','config.manage') THEN
    RETURN TRUE;
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

REVOKE EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) TO authenticated, service_role;

-- Role assignment and catalog administration remain server-only; do not add
-- authenticated policies, which would undermine the backend-only API boundary.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO service_role;

COMMENT ON TABLE public.user_roles IS 'Multi-role assignments; changes are made only through audited server APIs.';
COMMENT ON FUNCTION public.has_permission(TEXT, UUID) IS
  'RBAC union across active user_roles. Authenticated identity is always derived from auth.uid(); External profiles are denied.';
