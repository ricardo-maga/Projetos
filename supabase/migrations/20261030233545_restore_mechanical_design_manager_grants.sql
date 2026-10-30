-- Project managers are the responsible area role for mechanical design.
-- Restore the defaults after a role-matrix save removed their grants.
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code='PROJECT_MANAGER' AND r.is_active IS TRUE
  AND p.code IN ('mechanical_design.read','mechanical_design.create',
    'mechanical_design.manage','mechanical_design.coordinate','mechanical_design.execute')
ON CONFLICT (role_id,permission_id) DO NOTHING;
