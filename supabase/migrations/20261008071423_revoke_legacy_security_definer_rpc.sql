-- Legacy SECURITY DEFINER routines are not public API endpoints.
DO $$
DECLARE
  function_signature TEXT;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_task_atomic', 'update_task_atomic', 'has_permission', 'is_admin', 'is_approved')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_signature);
  END LOOP;
END $$;
