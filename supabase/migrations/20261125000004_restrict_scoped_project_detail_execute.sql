-- The function's owner must revoke the grants attributed to that role.
SET LOCAL ROLE projetos_project_reader;
REVOKE EXECUTE ON FUNCTION public.scoped_project_detail(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.scoped_project_detail(uuid) TO authenticated;
RESET ROLE;
