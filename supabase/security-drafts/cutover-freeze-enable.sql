-- Temporary operational guard. Not a business-schema migration.
-- Apply only after rehearsal and with the reviewed flag in THIS transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
  IF current_setting('app.cutover_freeze_reviewed', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Cutover freeze requires explicit review';
  END IF;
  IF to_regnamespace('cutover_control') IS NOT NULL THEN
    RAISE EXCEPTION 'Cutover control already exists; inspect instead of overwriting';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')) <> 55 THEN
    RAISE EXCEPTION 'Public table inventory changed';
  END IF;
END $guard$;
CREATE SCHEMA cutover_control;
REVOKE ALL ON SCHEMA cutover_control FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION cutover_control.reject_application_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $function$
BEGIN
  -- session_user survives SECURITY DEFINER. Request context also catches owner-run RPCs.
  -- Only direct trusted administration without REST context remains available.
  IF session_user NOT IN ('postgres','supabase_admin')
     OR current_user IN ('anon','authenticated','service_role','authenticator')
     OR nullif(current_setting('request.jwt.claims',true),'') IS NOT NULL
     OR nullif(current_setting('request.jwt.claim.role',true),'') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT503', MESSAGE='Application writes paused for maintenance';
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION cutover_control.reject_application_writes() FROM PUBLIC, anon, authenticated, service_role;
DO $install$
DECLARE target record;
BEGIN
  -- Deterministic order; locks drain in-flight table writers before commit.
  FOR target IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', target.relname);
    EXECUTE format('CREATE TRIGGER cutover_write_freeze BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION cutover_control.reject_application_writes()', target.relname);
  END LOOP;
END $install$;
COMMIT;
