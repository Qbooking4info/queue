import 'server-only'
import { estimateEtaSeconds } from './matching'

/**
 * How long until this unit reaches that point, on roads.
 *
 * `estimateEtaSeconds` (matching.ts) does straight-line distance × 1.4 at
 * 22 km/h. That is good enough to *rank* candidates — every candidate is
 * wrong by roughly the same factor, so the ordering survives — but it is not
 * good enough to show a patient a number and call it an arrival time. Lagos
 * traffic is exactly the case where a winding factor is a fiction.
 *
 * So this asks a routing service, and falls back to the estimator when it
 * cannot. THE FALLBACK IS THE POINT: this runs on the emergency path, and an
 * ETA that is roughly right beats a screen that says nothing because a third
 * party had a bad minute. Every failure here is soft, logged, and degrades to
 * the number we would have shown anyway.
 *
 * Provider is chosen by whichever key is configured — Google if
 * GOOGLE_MAPS_API_KEY is set, Mapbox if MAPBOX_ACCESS_TOKEN is, neither means
 * estimator-only. Nothing else in the codebase needs to know which is in use.
 */

export type EtaSource = 'google' | 'mapbox' | 'estimate'

export interface EtaResult {
  seconds: number
  source: EtaSource
  /** Road distance in metres when the provider reported one. */
  meters?: number
}

/** Timeout for the routing call. Past this the estimator is better than waiting. */
const ROUTING_TIMEOUT_MS = 2500

export function routingProvider(): EtaSource {
  if (process.env.GOOGLE_MAPS_API_KEY) return 'google'
  if (process.env.MAPBOX_ACCESS_TOKEN) return 'mapbox'
  return 'estimate'
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ROUTING_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Google Routes API. `TRAFFIC_AWARE` rather than the cheaper unaware mode: the
 * whole reason for paying a routing provider on this path is the traffic.
 */
async function googleEta(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<EtaResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null

  const res = await fetchWithTimeout('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  })

  if (!res.ok) {
    console.warn('[eta] google routing failed', res.status, (await res.text()).slice(0, 200))
    return null
  }

  const body = await res.json() as { routes?: Array<{ duration?: string; distanceMeters?: number }> }
  const route = body.routes?.[0]
  if (!route?.duration) return null

  // Durations come back as a protobuf duration string: "834s".
  const seconds = Number(String(route.duration).replace(/s$/, ''))
  if (!Number.isFinite(seconds) || seconds <= 0) return null

  return { seconds: Math.round(seconds), source: 'google', meters: route.distanceMeters }
}

/** Mapbox Directions. Cheaper; `driving-traffic` is its live-traffic profile. */
async function mapboxEta(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<EtaResult | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return null

  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}`
    + `?overview=false&access_token=${encodeURIComponent(token)}`

  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    console.warn('[eta] mapbox routing failed', res.status)
    return null
  }

  const body = await res.json() as { routes?: Array<{ duration?: number; distance?: number }> }
  const route = body.routes?.[0]
  if (!route?.duration || route.duration <= 0) return null

  return { seconds: Math.round(route.duration), source: 'mapbox', meters: route.distance ? Math.round(route.distance) : undefined }
}

/**
 * The one entry point. Never throws and never returns null — callers on the
 * emergency path have no useful way to handle "no ETA at all", and the
 * estimator is always available.
 */
export async function roadEta(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<EtaResult> {
  const straightLine = haversineMeters(from, to)

  try {
    const provider = routingProvider()
    const result = provider === 'google' ? await googleEta(from, to)
      : provider === 'mapbox' ? await mapboxEta(from, to)
      : null
    if (result) return result
  } catch (err) {
    // Includes the AbortError from the timeout. Warn, don't escalate: a slow
    // routing provider must not turn into a failed location ping.
    console.warn('[eta] routing unavailable, falling back to estimate',
      err instanceof Error ? err.message : String(err))
  }

  return { seconds: estimateEtaSeconds(straightLine), source: 'estimate', meters: straightLine }
}
