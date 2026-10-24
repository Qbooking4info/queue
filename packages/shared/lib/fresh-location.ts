import * as ExpoLocation from 'expo-location'

export interface Fix {
  latitude:  number
  longitude: number
  accuracyM: number | null
  /** Device time of the fix, ms since epoch. */
  takenAt:   number
}

export type FreshFixResult =
  | { ok: true; fix: Fix; source: 'current' | 'last_known' }
  | { ok: false; reason: 'permission_denied' | 'unavailable' }

export const FRESH_FIX_TIMEOUT_MS = 10_000
// A last-known fix older than this, or vaguer than this, is not sent as a pickup
// point — an ambulance routed to where the patient was is worse than asking them
// to retry or call.
export const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000
export const LAST_KNOWN_MAX_ACCURACY_M = 200

function toFix(loc: ExpoLocation.LocationObject): Fix {
  return {
    latitude:  loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracyM: loc.coords.accuracy ?? null,
    takenAt:   loc.timestamp,
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms)
    p.then(v => { clearTimeout(timer); resolve(v) }, () => { clearTimeout(timer); resolve(null) })
  })
}

/**
 * A pickup location taken now, for an ambulance request.
 *
 * LocationContext reads GPS once when the app opens and never again, so an SOS
 * sent from it could carry a position hours old and kilometres away. This asks
 * for a new high-accuracy fix, bounded so a phone that can't get one (indoors,
 * GPS off) still answers within FRESH_FIX_TIMEOUT_MS; then falls back to the OS's
 * last known position only if it is recent and reasonably precise. It never
 * falls back to a stale cached value.
 */
export async function getFreshFix(timeoutMs = FRESH_FIX_TIMEOUT_MS): Promise<FreshFixResult> {
  try {
    let { status } = await ExpoLocation.getForegroundPermissionsAsync()
    if (status !== 'granted') {
      ;({ status } = await ExpoLocation.requestForegroundPermissionsAsync())
    }
    if (status !== 'granted') return { ok: false, reason: 'permission_denied' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }

  const current = await withTimeout(
    ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High }),
    timeoutMs,
  )
  if (current) return { ok: true, fix: toFix(current), source: 'current' }

  const last = await ExpoLocation.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: LAST_KNOWN_MAX_ACCURACY_M,
  }).catch(() => null)
  if (last && Date.now() - last.timestamp <= LAST_KNOWN_MAX_AGE_MS) {
    return { ok: true, fix: toFix(last), source: 'last_known' }
  }

  return { ok: false, reason: 'unavailable' }
}

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
export const GEOCODE_TIMEOUT_MS = 10_000

/**
 * Fallback pickup point when GPS can't give one: look up an address or landmark the
 * caller typed. Coarse by nature — the caller's own words go to the crew as the pickup
 * address alongside it. Biased to Nigeria, where every hospital on Queue is, so
 * "Ikeja City Mall" doesn't resolve to somewhere abroad. null = not found / failed.
 */
export async function geocodePickup(
  query: string,
  accessToken: string,
  timeoutMs = GEOCODE_TIMEOUT_MS,
): Promise<{ latitude: number; longitude: number } | null> {
  const text = query.trim()
  if (text.length < 3) return null
  const q = /nigeria/i.test(text) ? text : `${text}, Nigeria`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_URL}/api/geocode?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const hit = await res.json().catch(() => null) as { lat?: string; lon?: string } | null
    const latitude = Number(hit?.lat)
    const longitude = Number(hit?.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { latitude, longitude }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
