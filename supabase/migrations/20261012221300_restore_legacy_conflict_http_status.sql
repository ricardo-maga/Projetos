-- A later redefinition of write_legacy_batch restored SQLSTATE 40001.
-- PostgREST may retry that code; optimistic concurrency is instead an HTTP 409.
DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.write_legacy_batch(jsonb)'::regprocedure);
  IF position('''40001''' IN definition) > 0 THEN
    EXECUTE replace(definition, '''40001''', '''PT409''');
  END IF;
END;
$$;
