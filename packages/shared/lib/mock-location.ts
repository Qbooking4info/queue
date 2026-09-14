/**
 * Mock location — a testing switch, not a shipping feature.
 *
 * While the app is being built out it's a nuisance to grant location
 * permission on every device/emulator/browser tab, and web has no real GPS at
 * all. With MOCK_LOCATION on, nothing asks for location permission and every
 * user / ambulance / hospital gets a stable, made-up coordinate scattered
 * around Lagos instead — enough for dispatch, distance ranking, and the maps
 * to have something real-shaped to work with.
 *
 * Coordinates are DETERMINISTIC per seed (a user id, an ambulance id, a
 * hospital id): the same entity always lands on the same spot, so units don't
 * teleport between renders and distances stay stable across sessions.
 *
 * To turn it off: set EXPO_PUBLIC_MOCK_LOCATION=false in each app's env, or
 * flip the default below. Then the real expo-location paths take over again
 * unchanged.
 */

export const MOCK_LOCATION =
  (process.env.EXPO_PUBLIC_MOCK_LOCATION ?? 'true').toLowerCase() !== 'false'

// Roughly central Lagos. Every mock point sits within ~5.5 km of here, so any
// two mock entities are <~11 km apart -- comfortably inside dispatch's default
// 15 km search radius, while still spread enough that distance ranking and
// "nearest unit" actually mean something in testing.
const CENTER = { latitude: 6.5244, longitude: 3.3792 }
const SPREAD_DEG = 0.05

// FNV-1a -> [0, 1). Not cryptographic; it only needs to spread seeds out.
function unitHash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

export interface MockCoord { latitude: number; longitude: number }

/** A stable made-up coordinate for the given seed (user id, ambulance id, ...). */
export function mockCoord(seed = 'default'): MockCoord {
  const a = unitHash(seed)
  const b = unitHash(seed + '·lng')
  return {
    latitude:  CENTER.latitude  + (a - 0.5) * 2 * SPREAD_DEG,
    longitude: CENTER.longitude + (b - 0.5) * 2 * SPREAD_DEG,
  }
}

const METERS_PER_DEG_LAT = 111_320

/**
 * A point ~30 m from `base` that keeps moving on a slow ~30 s orbit.
 *
 * Repeated *identical* pings get rejected by record_unit_location /
 * record_patient_location as "stationary drift" (<15 m) and never refresh the
 * server-stamped received_at, so a mock unit that pinged the exact same spot
 * every 15 s would still go stale and fall out of dispatch. Orbiting a tiny
 * circle keeps every consecutive ping ~40 m apart — accepted as movement,
 * visually still sitting on its home base.
 */
export function mockLivePoint(base: MockCoord): MockCoord {
  const t = Date.now() / 1000
  const radiusM = 30
  const dLat = radiusM / METERS_PER_DEG_LAT
  const dLng = radiusM / (METERS_PER_DEG_LAT * Math.cos(base.latitude * Math.PI / 180))
  return {
    latitude:  base.latitude  + Math.sin(t / 5) * dLat,
    longitude: base.longitude + Math.cos(t / 5) * dLng,
  }
}

/** Shaped like an expo-location LocationObject — a drop-in for getCurrentPositionAsync(). */
export function mockPositionObject(seed?: string) {
  const c = mockCoord(seed)
  return {
    coords: {
      latitude: c.latitude,
      longitude: c.longitude,
      accuracy: 8,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  }
}
