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
