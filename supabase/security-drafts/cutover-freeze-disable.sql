-- Remove only the reviewed temporary guard, never alter RLS/grants/business data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $remove$
DECLARE target record;
BEGIN
  IF current_setting('app.cutover_freeze_reviewed',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Cutover unfreeze requires explicit review';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname='cutover_write_freeze'
      AND tgfoid='cutover_control.reject_application_writes()'::regprocedure) <> 55 THEN
    RAISE EXCEPTION 'Freeze inventory changed; inspect before reopening';
  END IF;
  FOR target IN SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND t.tgname='cutover_write_freeze'
      AND t.tgfoid='cutover_control.reject_application_writes()'::regprocedure ORDER BY c.relname LOOP
    EXECUTE format('DROP TRIGGER cutover_write_freeze ON public.%I',target.relname);
  END LOOP;
END $remove$;
DROP FUNCTION cutover_control.reject_application_writes();
DROP SCHEMA cutover_control;
COMMIT;
