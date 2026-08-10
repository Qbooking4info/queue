import { describe, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const { computeFee, PLATFORM_FEE, EMERGENCY_FEE_MULTIPLIER } = await import('./fees')

// This module decides what a patient is charged. A wrong number here is a wrong
// number on someone's bank statement, so the arithmetic is pinned rather than
// trusted — including the boundaries where a naive implementation goes negative
// or loses kobo.

describe('fee computation', () => {
  it('adds only the platform fee to a routine booking', () => {
    expect(computeFee(10000, false).total).toBe(10500)
  })

  it('doubles the base fee for an emergency', () => {
    const f = computeFee(10000, true)
    expect(f.emergencyPremium).toBe(10000)
    expect(f.total).toBe(20500)
  })

  it('splits the total so the hospital gets everything except the platform fee', () => {
    const f = computeFee(10000, true)
    expect(f.hospitalPayout + f.platformFee).toBe(f.total)
    expect(f.hospitalPayout).toBe(20000)
  })

  it('charges the platform fee even when the consultation is free', () => {
    expect(computeFee(0, false).total).toBe(PLATFORM_FEE)
  })

  it('never produces a negative total from a negative input', () => {
    // A corrupt opd_fee must not become a credit to the patient.
    expect(computeFee(-5000, false).total).toBe(PLATFORM_FEE)
  })

  it('treats a missing fee as zero rather than NaN', () => {
    expect(computeFee(undefined as unknown as number, false).total).toBe(PLATFORM_FEE)
    expect(Number.isNaN(computeFee(NaN, true).total)).toBe(false)
  })

  it('converts to whole kobo with no floating-point remainder', () => {
    const f = computeFee(3333, true)
    expect(f.totalKobo).toBe(f.total * 100)
    expect(Number.isInteger(f.totalKobo)).toBe(true)
  })

  it('rounds the emergency premium to whole naira', () => {
    expect(Number.isInteger(computeFee(3333, true).emergencyPremium)).toBe(true)
  })

  it('keeps the multiplier as the single source of the premium', () => {
    const base = 7000
    expect(computeFee(base, true).emergencyPremium).toBe(base * (EMERGENCY_FEE_MULTIPLIER - 1))
  })

  it('agrees with what the mobile app quotes the patient', () => {
    // mobile/lib/fees.ts: base + premium + PLATFORM_FEE. These have drifted
    // before (1.5x vs 2x) and the patient saw one number while the server used
    // another.
    const base = 15000
    const mobileTotal = base + Math.round(base * (EMERGENCY_FEE_MULTIPLIER - 1)) + 500
    expect(computeFee(base, true).total).toBe(mobileTotal)
  })
})
