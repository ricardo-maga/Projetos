-- Branding is published only through /api/supabase/config, which selects an explicit allowlist.
REVOKE ALL PRIVILEGES ON TABLE public.app_configuration FROM anon, authenticated, PUBLIC;
