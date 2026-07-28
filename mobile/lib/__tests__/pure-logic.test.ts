/// <reference types="jest" />

jest.mock('../supabase')

import { isOpenNow, findEmergencyClinic, type DayHours, type Clinic } from '../api'

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
