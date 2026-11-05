-- Role assignments are managed exclusively by audited server APIs.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backend_only_no_direct_api" ON public.user_roles;
CREATE POLICY "backend_only_no_direct_api" ON public.user_roles
  FOR ALL TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);
REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;
