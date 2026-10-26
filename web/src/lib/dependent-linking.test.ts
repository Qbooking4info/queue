import { describe, it, expect } from 'vitest'
import { ageOn, isMinor } from './dependent-linking'

describe('isMinor / ageOn', () => {
  const at = (iso: string) => new Date(iso)
  it('counts whole years on the Lagos calendar date', () => {
    expect(ageOn('2008-10-13', at('2026-10-13T12:00:00Z'))).toBe(18)
    expect(ageOn('2008-10-14', at('2026-10-13T12:00:00Z'))).toBe(17)
  })
  it('uses Lagos date, not UTC, around midnight', () => {
    // 23:30 UTC on the 12th is 00:30 on the 13th in Lagos: the birthday has arrived.
    expect(ageOn('2008-10-13', at('2026-10-12T23:30:00Z'))).toBe(18)
  })
  it('treats a missing or malformed date of birth as an adult', () => {
    expect(isMinor(null)).toBe(false)
    expect(isMinor('')).toBe(false)
    expect(isMinor('13/10/2015')).toBe(false)
  })
  it('flags a child', () => {
    expect(isMinor('2015-01-01', at('2026-10-13T12:00:00Z'))).toBe(true)
  })
})
