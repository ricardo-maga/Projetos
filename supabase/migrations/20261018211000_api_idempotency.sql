-- One claim per authenticated principal, operation and Idempotency-Key.
CREATE TABLE IF NOT EXISTS public.api_idempotency (
  key_hash text PRIMARY KEY CHECK (length(key_hash) = 64),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  entity_id uuid NOT NULL,
  claim_token uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  response_status integer,
  response_body jsonb,
  completed_at timestamptz,
  CONSTRAINT api_idempotency_completion CHECK ((response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR (response_status BETWEEN 200 AND 299 AND response_body IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS api_idempotency_completed_idx ON public.api_idempotency (completed_at)
  WHERE completed_at IS NOT NULL;
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_idempotency FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_idempotency TO service_role;
