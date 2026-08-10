/// <reference types="jest" />

jest.mock('../supabase')

// emergency-directory imports AsyncStorage for its offline cache. The pure
// filtering/formatting helpers under test don't touch it, but the module-level
// import still has to resolve under jest-expo.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

import { isOpenNow, findEmergencyClinic, type DayHours, type Clinic } from '../api'
import { totalBookingFee, emergencyPremium, EMERGENCY_FEE_MULTIPLIER, PLATFORM_FEE } from '../fees'
import { filterForState, telHref, type EmergencyContact } from '../emergency-directory'

function hoursAllOpen(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '18:00', closed: false }))
}

describe('isOpenNow', () => {
  it('is always open when the hospital is flagged 24 hours, regardless of the hours table', () => {
    expect(isOpenNow([], true)).toBe(true)
  })

  it('is closed when today has no hours row at all', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T10:00:00'))
    expect(isOpenNow([], false)).toBe(false)
    jest.useRealTimers()
  })

  it('is closed when today is explicitly marked closed', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T10:00:00'))
    const hours = hoursAllOpen()
    const today = new Date().getDay()
    hours[today].closed = true
    expect(isOpenNow(hours, false)).toBe(false)
    jest.useRealTimers()
  })

  it('is open when the current time falls within today\'s open/close window', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T10:00:00'))
    expect(isOpenNow(hoursAllOpen(), false)).toBe(true)
    jest.useRealTimers()
  })

  it('is closed just before opening and at/after closing', () => {
    const hours = hoursAllOpen()
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T07:59:00'))
    expect(isOpenNow(hours, false)).toBe(false)
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T18:00:00'))
    expect(isOpenNow(hours, false)).toBe(false)
    jest.useRealTimers()
  })
})

describe('findEmergencyClinic', () => {
  function clinic(overrides: Partial<Clinic>): Clinic {
    return {
      id: '1', hospital_id: 'h1', name: 'Clinic', description: null,
      is_opd: false, is_active: true, is_emergency: false, sort_order: 0,
      daily_booking_limit: null, service_tags: [],
      ...overrides,
    }
  }

  it('prefers a clinic explicitly flagged is_emergency over name matching', () => {
    const clinics = [clinic({ id: 'a', name: 'General OPD' }), clinic({ id: 'b', name: 'ICU', is_emergency: true })]
    expect(findEmergencyClinic(clinics)?.id).toBe('b')
  })

  it('falls back to name matching when nothing is explicitly flagged', () => {
    const clinics = [clinic({ id: 'a', name: 'General OPD' }), clinic({ id: 'b', name: 'Accident and Emergency' })]
    expect(findEmergencyClinic(clinics)?.id).toBe('b')
  })

  it('matches common emergency-department naming variants', () => {
    for (const name of ['A&E', 'Casualty', 'Trauma Center', 'Emergency Room']) {
      const clinics = [clinic({ id: 'x', name })]
      expect(findEmergencyClinic(clinics)?.id).toBe('x')
    }
  })

  it('returns null when no clinic is flagged or named like an emergency department', () => {
    const clinics = [clinic({ id: 'a', name: 'General OPD' }), clinic({ id: 'b', name: 'Pediatrics' })]
    expect(findEmergencyClinic(clinics)).toBeNull()
  })
})

// ── Booking fees ─────────────────────────────────────────────────────────────
// These two screens quoted different prices for the same emergency booking
// (2x in EmergencyBookingScreen, 1.5x in BookingFlowScreen) while the server
// booked revenue at 2x. Locked down here because the drift was silent — both
// numbers looked plausible in isolation.

describe('booking fees', () => {
  it('charges only the flat platform fee on top of base for a routine booking', () => {
    expect(totalBookingFee(10000, false)).toBe(10500)
  })

  it('doubles the base fee for an emergency, matching the server revenue calc', () => {
    // web/src/app/api/appointments/stats/route.ts: base * 2 + PLATFORM_FEE
    expect(totalBookingFee(10000, true)).toBe(20500)
  })

  it('derives the premium from the multiplier rather than a hardcoded fraction', () => {
    expect(emergencyPremium(10000)).toBe(10000 * (EMERGENCY_FEE_MULTIPLIER - 1))
  })

  it('rounds the premium to whole naira', () => {
    expect(Number.isInteger(emergencyPremium(3333))).toBe(true)
  })

  it('treats a zero base fee as platform-fee-only, even for an emergency', () => {
    expect(totalBookingFee(0, true)).toBe(PLATFORM_FEE)
  })
})

// ── Emergency fallback directory ─────────────────────────────────────────────
// Stage one of the ambulance scope. The rule that matters: never hand someone
// in Lagos a number for Kano, but never show them nothing either.

function contact(over: Partial<EmergencyContact> & { id: string }): EmergencyContact {
  return {
    name: 'Service', kind: 'state', phone: '+2340000000000', alt_phone: null,
    country: 'Nigeria', state: null, city: null, priority: 100, notes: null,
    ...over,
  } as EmergencyContact
}

describe('filterForState', () => {
  const national = contact({ id: 'n', state: null, priority: 1, name: 'National' })
  const lagos    = contact({ id: 'l', state: 'Lagos', priority: 10, name: 'Lagos Service' })
  const kano     = contact({ id: 'k', state: 'Kano',  priority: 10, name: 'Kano Service' })

  it('always keeps nationwide entries, which have no state', () => {
    expect(filterForState([national, kano], 'Lagos').map(c => c.id)).toEqual(['n'])
  })

  it('drops entries belonging to another state', () => {
    expect(filterForState([lagos, kano], 'Lagos').map(c => c.id)).toEqual(['l'])
  })

  it('shows everything when the caller location is unknown, rather than nothing', () => {
    // Better to over-offer than to leave someone in an emergency with an empty list.
    expect(filterForState([national, lagos, kano], null)).toHaveLength(3)
  })

  it('matches state case-insensitively', () => {
    expect(filterForState([lagos], 'lagos').map(c => c.id)).toEqual(['l'])
  })

  it('orders by priority so the national line outranks a local one', () => {
    expect(filterForState([lagos, national], 'Lagos').map(c => c.id)).toEqual(['n', 'l'])
  })

  it('does not mutate the array it was given', () => {
    const rows = [lagos, national]
    filterForState(rows, null)
    expect(rows.map(c => c.id)).toEqual(['l', 'n'])
  })

  it('returns empty for an empty directory instead of throwing', () => {
    expect(filterForState([], 'Lagos')).toEqual([])
  })
})

describe('telHref', () => {
  it('strips spaces, dashes and brackets the dialer would choke on', () => {
    expect(telHref('+234 (0)80 1234-5678')).toBe('tel:+23408012345678')
  })

  it('keeps the leading + so international dialling still works', () => {
    expect(telHref('+2348012345678')).toBe('tel:+2348012345678')
  })

  it('handles a short national code', () => {
    expect(telHref('112')).toBe('tel:112')
  })
})
