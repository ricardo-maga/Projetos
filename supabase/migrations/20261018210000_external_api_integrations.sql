-- Server-only credentials for read-only external integrations.
CREATE TABLE IF NOT EXISTS public.api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  key_hash text NOT NULL UNIQUE CHECK (length(key_hash) = 64),
  key_prefix text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  client_ids uuid[] NOT NULL DEFAULT '{}',
  project_ids uuid[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 600),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT api_integrations_scope_required CHECK (cardinality(client_ids) + cardinality(project_ids) > 0),
  CONSTRAINT api_integrations_permissions CHECK (permissions <@ ARRAY['projects:read','tasks:read']::text[])
);

CREATE INDEX IF NOT EXISTS api_integrations_active_idx ON public.api_integrations (expires_at)
  WHERE revoked_at IS NULL;
ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_integrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.api_integrations TO service_role;
