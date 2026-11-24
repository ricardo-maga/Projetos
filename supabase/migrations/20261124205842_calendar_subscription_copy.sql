-- Legacy subscriptions store only a token hash and remain valid until renewed.
ALTER TABLE public.calendar_feed_tokens ADD COLUMN token_nonce uuid;
