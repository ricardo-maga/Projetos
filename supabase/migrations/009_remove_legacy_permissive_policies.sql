-- Remove obsolete broad RLS policies left by the original schema.  Applying this
-- migration intentionally makes tables without a specific policy deny access.
-- New client operations must go through authenticated server endpoints.
DO $$
DECLARE policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'Full access to auth users on %'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  END LOOP;
END $$;

-- The legacy snapshot table must never be public, including installations where
-- migration 007 has not yet removed it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'portal_erp_snapshots') THEN
    ALTER TABLE public.portal_erp_snapshots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Permitir leitura pública de snapshots" ON public.portal_erp_snapshots;
    DROP POLICY IF EXISTS "Permitir inserção pública de snapshots" ON public.portal_erp_snapshots;
    DROP POLICY IF EXISTS "Permitir atualização pública de snapshots" ON public.portal_erp_snapshots;
    DROP POLICY IF EXISTS "Permitir eliminação pública de snapshots" ON public.portal_erp_snapshots;
  END IF;
END $$;
