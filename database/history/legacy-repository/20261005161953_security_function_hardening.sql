-- Staging first; keep bodies, permissions, update flags and SQLSTATE semantics.
DO $$
DECLARE f record; definition text; changed text;
BEGIN
  FOR f IN SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('create_project_transaction','update_project_transaction','generate_ticket_number',
       'is_admin','is_approved','planning_allocation_tsrange','set_updated_at','update_ticket_timestamp') LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp', f.proname, f.args);
  END LOOP;
  -- Lock the row before checking OCC; otherwise two sessions can accept the same version.
  FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('update_project_transaction','delete_project_transaction','update_task_atomic','delete_task_atomic') LOOP
    definition := pg_get_functiondef(f.oid);
    IF definition ~* 'FOR[[:space:]]+UPDATE' THEN CONTINUE; END IF;
    changed := regexp_replace(definition,
      '(WHERE id = p_id(?: AND \(deleted IS NOT TRUE\))?)(;)', '\1 FOR UPDATE\2', 'i');
    IF changed = definition THEN RAISE EXCEPTION 'Unexpected OCC body: %', f.proname; END IF;
    EXECUTE changed;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin(), public.is_approved() FROM PUBLIC, anon;
-- Policy helpers remain callable by authenticated for existing policies; they
-- derive identity from auth.uid(), never from caller-supplied user IDs.
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_approved() TO authenticated, service_role;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
