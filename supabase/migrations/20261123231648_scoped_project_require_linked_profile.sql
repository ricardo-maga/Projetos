CREATE FUNCTION public.scoped_project_actor_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.approved IS TRUE AND u.deleted IS NOT TRUE
      AND u.type IS DISTINCT FROM 'External'
  ) AND public.has_permission('projects.read', NULL);
$$;

REVOKE ALL ON FUNCTION public.scoped_project_actor_allowed() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scoped_project_actor_allowed() TO projetos_project_reader;
ALTER POLICY scoped_projects_read ON public.projects
  USING (deleted IS FALSE AND (SELECT public.scoped_project_actor_allowed()));
REVOKE EXECUTE ON FUNCTION public.has_permission(text, uuid) FROM projetos_project_reader;
