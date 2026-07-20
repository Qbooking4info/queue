import { SupabaseClient } from '@supabase/supabase-js'

// DB-backed rate limiter — works correctly on Vercel's multi-instance serverless.
// Key format: "<action>:<identifier>"  e.g. "onboarding:user_abc123"
export async function checkRateLimit(
  db: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()

  const { count } = await (db as any)
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', since)

  if ((count ?? 0) >= max) return false

  await (db as any).from('rate_limit_log').insert({ key })

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
