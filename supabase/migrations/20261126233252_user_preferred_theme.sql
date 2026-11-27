-- NULL follows the shared application scheme for existing and new profiles.
ALTER TABLE public.users ADD COLUMN preferred_theme text
  CONSTRAINT users_preferred_theme_check CHECK (
    preferred_theme IN ('domino', 'blue', 'emerald', 'violet', 'amber', 'slate', 'rose')
  );

-- Keep the existing signature and server-only permissions while returning the preference.
CREATE OR REPLACE FUNCTION public.api_actor_context(p_auth_user_id uuid, p_permission text, p_include_permissions boolean)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH profile AS (
    SELECT id, auth_user_id, name, email, role_id, is_admin, type, approved, deleted, preferred_theme
    FROM public.users
    WHERE auth_user_id = p_auth_user_id
  ), active_roles AS (
    SELECT DISTINCT r.id, r.code, r.name
    FROM profile AS p
    JOIN public.user_roles AS ur ON ur.user_id = p.id
    JOIN public.roles AS r ON r.id = ur.role_id AND r.is_active IS TRUE
    WHERE p.approved IS TRUE AND p.deleted IS NOT TRUE AND p.type IS DISTINCT FROM 'External'
  )
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM profile AS p),
    'roles', COALESCE((SELECT jsonb_agg(r ORDER BY r.id) FROM active_roles AS r), '[]'::jsonb),
    'allowed', CASE WHEN p_permission IS NULL THEN NULL
      ELSE public.has_permission(p_permission, p_auth_user_id) END,
    'permissions', CASE WHEN p_include_permissions THEN COALESCE((
      SELECT jsonb_agg(DISTINCT p.code ORDER BY p.code)
      FROM active_roles AS r
      JOIN public.role_permissions AS rp ON rp.role_id = r.id
      JOIN public.permissions AS p ON p.id = rp.permission_id AND p.is_active IS TRUE
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
$$;
