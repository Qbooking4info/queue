import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// BM6 — IMPORTANT: This in-process cache is INEFFECTIVE on Vercel serverless.
// Each lambda invocation may run in a different container/process, so `cache` and
// `lastCallAt` are reset on cold starts and not shared between concurrent instances.
// As a result:
//   1. Duplicate Nominatim calls can still occur when multiple lambda instances
//      handle concurrent requests for the same query.
//   2. The per-process rate-limit (RATE_LIMIT_MS) does not prevent one instance
//      from calling Nominatim immediately after another instance just did.
//
// For a robust fix, persist geocode results in a Supabase table (e.g. geocode_cache)
// keyed on the normalised query string.  Example migration:
//   CREATE TABLE geocode_cache (
//     query text PRIMARY KEY,
//     lat   text NOT NULL,
//     lon   text NOT NULL,
//     cached_at timestamptz NOT NULL DEFAULT now()
//   );
// Then: SELECT FROM geocode_cache WHERE query = $1, and INSERT on miss.
// Until that migration exists this route remains best-effort serverless-safe.
//
// The cache below still helps within a single warm lambda instance.
const cache = new Map<string, { lat: string; lon: string } | null>()
let lastCallAt = 0
const RATE_LIMIT_MS = 1100

export async function GET(req: NextRequest) {
  // getServerUser (any authenticated user) allows the onboarding flow to geocode
  // before a hospital record (and therefore a role) exists.
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return Errors.validation('q is required')

  const key = q.toLowerCase()
  if (cache.has(key)) {
    const hit = cache.get(key)!
    return hit ? NextResponse.json(hit) : NextResponse.json(null)
  }

  // Enforce Nominatim's 1 req/sec policy server-side (best-effort within one instance)
  const wait = RATE_LIMIT_MS - (Date.now() - lastCallAt)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastCallAt = Date.now()

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
    { headers: { 'Accept-Language': 'en', 'User-Agent': 'QueueApp/1.0 (qbooking4info@gmail.com)' } },
  )
  const data = await res.json() as { lat: string; lon: string }[]

  if (!data.length) {
    cache.set(key, null)
    return NextResponse.json(null)
  }

  const result = { lat: data[0].lat, lon: data[0].lon }
  cache.set(key, result)
  return NextResponse.json(result)
}
