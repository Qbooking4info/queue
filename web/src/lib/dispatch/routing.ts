/**
 * Queue — routing adapter
 *
 * Road ETAs, batched into one matrix call per dispatch round.
 *
 * Straight line distance is close to useless for dispatch in Lagos. A unit 2 km
 * away across a bridge can be 25 minutes out while one 6 km away on the same
 * axis is 9 minutes. Ranking on distance sends the wrong ambulance often enough
 * to matter clinically.
 *
 * Every failure path returns null rather than throwing. A routing outage should
 * degrade ranking to distance based, not stop dispatch.
 */

import 'server-only'
import { routingProvider, roadEta } from './eta'

export interface LatLng {
  lat: number
  lng: number
}

const MATRIX_TIMEOUT_MS = 2500
const CACHE_TTL_MS = 90_000

const CACHE_MAX_ENTRIES = 500

const cache = new Map<string, { etas: (number | null)[]; at: number }>()

/**
 * Bounded, or a long-lived server instance accumulates one entry per distinct
 * unit-set/pickup pair for the life of the process. Drops expired entries
 * first, then the oldest, since Map preserves insertion order.
 */
function rememberEtas(key: string, etas: (number | null)[]) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now - v.at >= CACHE_TTL_MS) cache.delete(k)
    }
    while (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next()
      if (oldest.done) break
      cache.delete(oldest.value)
    }
  }
  cache.set(key, { etas, at: Date.now() })
}

/**
 * Mapbox caps the driving-traffic matrix at 10 coordinates per request, and the
 * destination is one of them — so at most 9 origins per call. find_candidate_units
 * returns up to 12, which silently 422'd the whole batch and dropped EVERY unit to
 * a null ETA, degrading the round to straight-line ranking with nothing in the logs
 * beyond a warning. Origins are chunked to stay under the limit.
 */
const MAX_ORIGINS_PER_MATRIX_CALL = 9

export async function roadEtas(
  origins: LatLng[],
  destination: LatLng,
): Promise<(number | null)[]> {
  if (!origins.length) return []

  if (origins.length > MAX_ORIGINS_PER_MATRIX_CALL) {
    const chunks: (number | null)[][] = []
    for (let i = 0; i < origins.length; i += MAX_ORIGINS_PER_MATRIX_CALL) {
      chunks.push(await roadEtas(origins.slice(i, i + MAX_ORIGINS_PER_MATRIX_CALL), destination))
    }
    return chunks.flat()
  }

  const key = cacheKey(origins, destination)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.etas

  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) {
    // No Mapbox matrix, but Google may well be configured — it is what the
    // patient-facing ETA already uses. Ranking was silently degrading to
    // straight-line distance while the app showed the patient a Google
    // road ETA: two providers, one of them unset, disagreeing about the same
    // journey. In Lagos that is not a rounding error, it is the wrong
    // ambulance across a bridge.
    if (routingProvider() !== 'estimate') {
      const etas = await googleFallbackEtas(origins, destination)
      rememberEtas(key, etas)
      return etas
    }
    console.warn('[dispatch] no routing provider configured — ranking on distance only')
    return origins.map(() => null)
  }

  try {
    const coords = [...origins, destination].map((p) => `${p.lng},${p.lat}`).join(';')
    const sources = origins.map((_, i) => i).join(';')
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/${coords}` +
      `?sources=${sources}&destinations=${origins.length}` +
      `&annotations=duration&access_token=${token}`

    const res = await fetchWithTimeout(url, MATRIX_TIMEOUT_MS)
    if (!res.ok) {
      console.warn('[dispatch] routing matrix returned', res.status)
      return origins.map(() => null)
    }

    const body = (await res.json()) as { durations?: (number | null)[][] }
    const durations = body.durations ?? []

    const etas = origins.map((_, i) => {
      const v = durations[i]?.[0]
      return typeof v === 'number' ? Math.round(v) : null
    })

    rememberEtas(key, etas)
    return etas
  } catch (err) {
    console.warn('[dispatch] routing matrix failed, degrading to distance', err)
    return origins.map(() => null)
  }
}

/**
 * Per-origin Google calls, used only when no Mapbox matrix token is present.
 *
 * A matrix call is one request for N origins; this is N requests. That is the
 * cost of not having a matrix, and it is bounded: find_candidate_units returns
 * at most 12, and dispatch rounds are not high frequency. Issued in parallel so
 * the round is not serialised behind them, and every failure degrades to null —
 * the same contract as the matrix path, so ranking still works on distance.
 *
 * If routing volume ever justifies it, Google's Routes Matrix API is the
 * like-for-like replacement here.
 */
async function googleFallbackEtas(
  origins: LatLng[],
  destination: LatLng,
): Promise<(number | null)[]> {
  const results = await Promise.allSettled(
    origins.map((o) => roadEta({ lat: o.lat, lng: o.lng }, { lat: destination.lat, lng: destination.lng })),
  )
  return results.map((r) => {
    if (r.status !== 'fulfilled') return null
    // roadEta falls back to its own straight-line estimate rather than failing.
    // For ranking we want to know we got a real road answer, so an estimate is
    // reported as null and the caller's distance ranking takes over — otherwise
    // a provider outage would look like a confident ETA.
    return r.value.source === 'estimate' ? null : r.value.seconds
  })
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * ~100 m grid. Finer than this and the cache never hits.
 *
 * Order sensitive on purpose: the cached value is an ETA array indexed
 * positionally against `origins`. Sorting here would let a later round with the
 * same units in a different order hit the entry and hand each unit another
 * unit's ETA — i.e. dispatch the wrong ambulance.
 */
function cacheKey(origins: LatLng[], dest: LatLng): string {
  const q = (n: number) => n.toFixed(3)
  return [
    ...origins.map((o) => `${q(o.lat)},${q(o.lng)}`),
    `>${q(dest.lat)},${q(dest.lng)}`,
  ].join('|')
}
