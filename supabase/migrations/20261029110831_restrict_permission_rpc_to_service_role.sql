-- Authorization is evaluated by server routes using the service role.
-- The browser does not need to query another user's permissions directly.
REVOKE ALL ON FUNCTION public.has_permission(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid)
  TO service_role;
