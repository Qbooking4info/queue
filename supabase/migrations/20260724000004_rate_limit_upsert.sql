-- Replaces the insert-then-count rate limiter (one write + one read + a
-- conditional delete per request) with a single atomic UPSERT against a
-- fixed-window counter. This is the fix the old rate-limit.ts comment
-- already called out as "the true atomic fix" but deferred for lack of a
-- schema change.
--
-- Fixed-window bucketing: window_bucket = floor(epoch / window_seconds).
-- Concurrent requests hitting the same (key, window_bucket) serialize on
-- the row's UPSERT — Postgres handles the mutual exclusion, no app-level
-- TOCTOU logic needed.

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key           text        NOT NULL,
  window_bucket bigint      NOT NULL,
  count         integer     NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_bucket)
);

-- Server-side only: used exclusively from the service-role admin client.
-- No RLS policies needed — service role bypasses RLS by design.
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Supports the best-effort cleanup sweep (delete old buckets by age).
CREATE INDEX IF NOT EXISTS rate_limit_counters_updated_at_idx
  ON rate_limit_counters (updated_at);

-- Atomic increment-and-read. SECURITY DEFINER so the admin client (service
-- role) can call it directly; the UPSERT is what makes this a single
-- round trip instead of insert+count+delete.
CREATE OR REPLACE FUNCTION increment_rate_limit(p_key text, p_window_bucket bigint)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO rate_limit_counters (key, window_bucket, count, updated_at)
  VALUES (p_key, p_window_bucket, 1, now())
  ON CONFLICT (key, window_bucket)
  DO UPDATE SET count = rate_limit_counters.count + 1, updated_at = now()
  RETURNING count;
$$;

REVOKE ALL ON FUNCTION increment_rate_limit(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_rate_limit(text, bigint) TO service_role;

-- rate_limit_log is superseded by rate_limit_counters above.
DROP TABLE IF EXISTS rate_limit_log;
