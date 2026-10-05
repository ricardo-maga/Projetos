-- PROPOSTA: testar em staging antes de produção. Não altera corpos/OCC.
BEGIN;
DO $rpc$
DECLARE
  routine record;
  role_name text;
  names constant text[] := ARRAY['create_project_transaction','update_project_transaction',
    'delete_project_transaction','create_task_atomic','update_task_atomic','delete_task_atomic'];
  routine_name text;
BEGIN
  IF current_setting('app.rls_cutover_reviewed',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Revisão/aprovação necessária antes de aplicar';
  END IF;
  FOREACH routine_name IN ARRAY names LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=routine_name AND p.prokind='f') THEN
      RAISE EXCEPTION 'RPC esperada ausente: %',routine_name;
    END IF;
  END LOOP;
  FOR routine IN SELECT p.oid,format('%I.%I(%s)',n.nspname,p.proname,
      pg_get_function_identity_arguments(p.oid)) AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(names) AND p.prokind='f'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated',routine.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine.signature);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name,routine.oid,'EXECUTE') THEN
        RAISE EXCEPTION 'Privilégio herdado residual em % para %',routine.signature,role_name;
      END IF;
    END LOOP;
  END LOOP;
  REVOKE ALL PRIVILEGES ON SEQUENCE public.ticket_number_seq FROM PUBLIC,anon,authenticated;
  GRANT USAGE,SELECT,UPDATE ON SEQUENCE public.ticket_number_seq TO service_role;
END $rpc$;
COMMIT;
