// Regression for the 2026-10-13 audit C5: SOS sent the position LocationContext
// read once at app launch. getFreshFix must take a new reading, bound how long it
// waits, and never hand back an old position.

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}))

import * as ExpoLocation from 'expo-location'
import { getFreshFix, LAST_KNOWN_MAX_AGE_MS } from '../fresh-location'

const L = ExpoLocation as unknown as Record<string, jest.Mock>

function loc(lat: number, lng: number, ageMs = 0, accuracy = 8) {
  return { coords: { latitude: lat, longitude: lng, accuracy }, timestamp: Date.now() - ageMs }
}

beforeEach(() => {
  jest.resetAllMocks()
  L.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' })
})

afterEach(() => jest.useRealTimers())

describe('getFreshFix', () => {
  it('takes a new high-accuracy reading', async () => {
    L.getCurrentPositionAsync.mockResolvedValue(loc(6.6, 3.35))

    const r = await getFreshFix()

    expect(L.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: ExpoLocation.Accuracy.High })
    expect(r).toEqual({ ok: true, source: 'current', fix: expect.objectContaining({ latitude: 6.6, longitude: 3.35, accuracyM: 8 }) })
  })

  it('stops waiting at the timeout and uses a recent last-known fix', async () => {
    jest.useFakeTimers()
    L.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}))   // GPS never answers
    L.getLastKnownPositionAsync.mockResolvedValue(loc(6.5, 3.3, 60_000))

    const pending = getFreshFix(1000)
    await jest.advanceTimersByTimeAsync(1000)
    const r = await pending

    expect(r).toEqual({ ok: true, source: 'last_known', fix: expect.objectContaining({ latitude: 6.5 }) })
    expect(L.getLastKnownPositionAsync).toHaveBeenCalledWith(expect.objectContaining({ maxAge: LAST_KNOWN_MAX_AGE_MS }))
  })

  it('refuses a last-known fix older than the limit rather than sending it', async () => {
    L.getCurrentPositionAsync.mockRejectedValue(new Error('Location unavailable'))
    L.getLastKnownPositionAsync.mockResolvedValue(loc(6.5, 3.3, LAST_KNOWN_MAX_AGE_MS + 60_000))

    expect(await getFreshFix()).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('asks for permission once and reports a refusal', async () => {
    L.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
    L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })

    expect(await getFreshFix()).toEqual({ ok: false, reason: 'permission_denied' })
    expect(L.getCurrentPositionAsync).not.toHaveBeenCalled()
  })
})

describe('geocodePickup (typed-address fallback when GPS is unavailable)', () => {
  // Imported lazily so the module-level API_URL picks up this env value.
  function load() {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/'
    let mod: typeof import('../fresh-location')
    jest.isolateModules(() => { mod = require('../fresh-location') })
    return mod!
  }
  afterEach(() => jest.restoreAllMocks())

  it('looks the address up in Nigeria through the authenticated geocode route', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ lat: '6.6018', lon: '3.3515' })))

    expect(await load().geocodePickup('Ikeja City Mall', 'jwt')).toEqual({ latitude: 6.6018, longitude: 3.3515 })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/geocode?q=Ikeja%20City%20Mall%2C%20Nigeria')
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer jwt' })
  })

  it('returns null when nothing matches, the server fails, or the network drops', async () => {
    const m = load()
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('null'))
      .mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('Network request failed'))

    expect(await m.geocodePickup('nowhere at all', 'jwt')).toBeNull()
    expect(await m.geocodePickup('Lekki Phase 1', 'jwt')).toBeNull()
    expect(await m.geocodePickup('Yaba', 'jwt')).toBeNull()
  })

  it('does not look up a blank or two-letter entry', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    expect(await load().geocodePickup('  ab ', 'jwt')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
