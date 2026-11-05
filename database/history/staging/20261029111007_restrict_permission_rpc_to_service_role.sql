REVOKE ALL ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO service_role;;
