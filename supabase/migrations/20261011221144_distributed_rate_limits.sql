CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.rate_limit_windows (
  bucket text PRIMARY KEY CHECK (char_length(bucket) = 64),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.rate_limit_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.rate_limit_windows FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS TABLE(success boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE v_now timestamptz := now(); v_row private.rate_limit_windows%ROWTYPE;
BEGIN
  IF p_bucket !~ '^[0-9a-f]{64}$' OR p_limit < 1 OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN RAISE EXCEPTION 'Invalid rate limit request' USING ERRCODE = '22023'; END IF;
  INSERT INTO private.rate_limit_windows AS w (bucket, window_started_at, request_count, updated_at) VALUES (p_bucket, v_now, 1, v_now)
  ON CONFLICT (bucket) DO UPDATE SET window_started_at = CASE WHEN w.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN v_now ELSE w.window_started_at END, request_count = CASE WHEN w.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN 1 ELSE w.request_count + 1 END, updated_at = v_now
  RETURNING * INTO v_row;
  RETURN QUERY SELECT v_row.request_count <= p_limit, greatest(p_limit - v_row.request_count, 0), v_row.window_started_at + make_interval(secs => p_window_seconds);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
