-- Project deletion is authorized in the API and executed with the server role.
-- This SECURITY DEFINER RPC must not be callable through the Data API by a
-- browser session, even when the caller knows a project UUID.
REVOKE ALL ON FUNCTION public.delete_project_transaction(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_transaction(uuid, integer, uuid)
  TO service_role;
