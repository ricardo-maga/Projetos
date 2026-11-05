-- Every active team role may submit a Presales request. External profiles are
-- rejected by the API and by the actor check inside presales_mutate.
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_active AND p.code IN ('presales.read','presales.create')
ON CONFLICT(role_id,permission_id) DO NOTHING;
