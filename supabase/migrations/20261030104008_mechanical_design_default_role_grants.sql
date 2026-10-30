-- Existing active roles can all consult and submit mechanical design requests.
-- Administrators may change these defaults through the role-permission matrix.
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM public.roles AS r
CROSS JOIN public.permissions AS p
WHERE r.is_active IS TRUE
  AND p.code IN ('mechanical_design.read', 'mechanical_design.create')
ON CONFLICT (role_id, permission_id) DO NOTHING;
