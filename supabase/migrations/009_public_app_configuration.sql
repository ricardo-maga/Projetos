-- The login screen needs only non-sensitive branding before a user authenticates.
-- Do not add credentials or operational settings to app_configuration.
ALTER TABLE public.app_configuration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read app branding" ON public.app_configuration;
CREATE POLICY "Public can read app branding"
ON public.app_configuration
FOR SELECT
TO anon, authenticated
USING (true);
