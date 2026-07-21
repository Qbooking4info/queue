import { SupabaseClient } from '@supabase/supabase-js'

// DB-backed rate limiter — works correctly on Vercel's multi-instance serverless.
// Key format: "<action>:<identifier>"  e.g. "onboarding:user_abc123"
//
// BH9 — TOCTOU fix: we INSERT first (registering our intent), then COUNT.
// This ensures we always include ourselves in the count and dramatically reduces
// the race window compared to the previous count-then-insert pattern (where two
// concurrent requests could both see count < max before either inserts).
// A true atomic fix would require a UNIQUE constraint on (key, window_bucket) with
// an UPSERT counter, but that requires a schema change; insert-first is the best
// mitigation within the current single-column schema.
export async function checkRateLimit(
  db: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()

  // Insert first — this registers the request before we count, so we always
  // see ourselves in the window and concurrent requests are less likely to all slip through.
  const { data: inserted, error: insertErr } = await (db as any)
    .from('rate_limit_log')
    .insert({ key })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    // If the insert itself fails (e.g. RLS misconfiguration) allow the request
    // rather than false-positive blocking all traffic.
    return true
  }

  // Count all entries within the window — includes the row we just inserted.
  const { count } = await (db as any)
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', since)

  if ((count ?? 0) > max) {
    // Over limit — undo our insert so it doesn't inflate future counts
    await (db as any).from('rate_limit_log').delete().eq('id', inserted.id)
    return false
  }

  // Best-effort cleanup of entries older than 24 h for this key
  ;(db as any)
    .from('rate_limit_log')
    .delete()
    .eq('key', key)
    .lt('created_at', new Date(Date.now() - 86_400_000).toISOString())
    .then(() => {})
    .catch(() => {})

  return true
}
