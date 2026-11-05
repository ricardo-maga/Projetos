-- PostgREST 14 retries SQLSTATE 40001 indefinitely. OCC is a functional 409,
-- not a request to retry a serializable transaction.
DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.write_legacy_batch(jsonb)'::regprocedure);
  EXECUTE replace(definition, '''40001''', '''PT409''');
END;
$$;
