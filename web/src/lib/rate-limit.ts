import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// DB-backed rate limiter — works correctly on Vercel's multi-instance serverless.
// Key format: "<action>:<identifier>"  e.g. "onboarding:user_abc123"
//
// Fixed-window counter via UPSERT: one atomic round trip per request instead
// of the old insert-then-count-then-conditional-delete (3 round trips, plus
// a growing rate_limit_log table). Postgres serializes concurrent UPSERTs on
// the same (key, window_bucket) row, so there's no app-level TOCTOU logic —
// the database does the mutual exclusion.
export async function checkRateLimit(
  db: SupabaseClient<Database>,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const windowBucket = Math.floor(Date.now() / 1000 / windowSeconds)

  const { data, error } = await db.rpc('increment_rate_limit', {
    p_key: key,
    p_window_bucket: windowBucket,
  })

  if (error || data == null) {
    // If the RPC itself fails (e.g. misconfiguration) allow the request
    // rather than false-positive blocking all traffic -- but log it, since
    // failing open silently means a misconfiguration disables rate
    // limiting everywhere with no signal.
    console.error('[checkRateLimit] increment_rate_limit RPC failed, failing open:', key, error?.message)
    return true
  }

  // Best-effort cleanup of buckets more than a day old — cheap, fire-and-forget,
  // only runs on a small fraction of requests so it doesn't add latency.
  if (Math.random() < 0.01) {
    db
      .from('rate_limit_counters')
      .delete()
      .lt('updated_at', new Date(Date.now() - 86_400_000).toISOString())
      .then(() => {}, () => {})
  }

  return (data as number) <= max
}
