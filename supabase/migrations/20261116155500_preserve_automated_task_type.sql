-- Preserve the configured task type when an existing automation creates model tasks.
-- This patches only the two relevant expressions and preserves the installed
-- function's notification, security and transaction behaviour.
DO $migration$
DECLARE
  target regprocedure := to_regprocedure('public.run_project_status_automations()');
  original text;
  updated text;
BEGIN
  IF target IS NULL THEN
    RAISE NOTICE 'No project-status automation function is installed; nothing to patch.';
    RETURN;
  END IF;
  original := pg_get_functiondef(target);
  IF position('estimated_date, notes, status_id, task_type_id)' in original) > 0 THEN RETURN; END IF;
  updated := replace(original,
    'estimated_date, notes, status_id)',
    'estimated_date, notes, status_id, task_type_id)');
  updated := replace(updated,
    '''Gerada automaticamente pela regra de automação.'', default_status',
    '''Gerada automaticamente pela regra de automação.'', default_status, d.task_type_id');
  IF updated = original OR position('status_id, task_type_id)' in updated) = 0
      OR position('default_status, d.task_type_id' in updated) = 0 THEN
    RAISE EXCEPTION 'Unexpected project-status automation definition; review before applying.';
  END IF;
  EXECUTE updated;
END;
$migration$;
