import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// In-process cache: survives across requests in the same Node.js process.
// Prevents duplicate Nominatim calls for the same query and respects the 1 req/sec rate limit.
const cache = new Map<string, { lat: string; lon: string } | null>()
let lastCallAt = 0
const RATE_LIMIT_MS = 1100

export async function GET(req: NextRequest) {
  // getServerUser (any authenticated user) allows the onboarding flow to geocode
  // before a hospital record (and therefore a role) exists.
  const user = await getServerUser()
  if (!user) return Errors.unauthenticated()

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return Errors.validation('q is required')

  const key = q.toLowerCase()
  if (cache.has(key)) {
    const hit = cache.get(key)!
    return hit ? NextResponse.json(hit) : NextResponse.json(null)
  }

  // Enforce Nominatim's 1 req/sec policy server-side
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
