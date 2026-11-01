-- Retire the unused equipment domain without deleting historical records.
BEGIN;

DELETE FROM public.role_permissions rp
USING public.permissions p
WHERE rp.permission_id = p.id
  AND p.code IN ('equipment:read', 'equipment:write', 'equipment:delete');

DELETE FROM public.permissions
WHERE code IN ('equipment:read', 'equipment:write', 'equipment:delete');

-- Preserve the deployed function's other targets and security settings.
DO $$
DECLARE
  definition text;
  revised text;
BEGIN
  definition := pg_get_functiondef('public.write_legacy_batch(jsonb)'::regprocedure);
  revised := replace(definition, ',''equipment'',''special_days''', ',''special_days''');
  IF revised = definition OR position('''equipment''' IN revised) > 0 THEN
    RAISE EXCEPTION 'Unexpected write_legacy_batch equipment target';
  END IF;
  EXECUTE revised;
END;
$$;

COMMIT;
