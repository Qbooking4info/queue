// First tests in the mobile app (previously zero coverage). Scoped to the
// functions with the highest blast radius if they silently regress: the
// daily-booking-limit check (touched in this session -- see
// supabase/migrations/20260727000004_secure_get_daily_booking_count.sql) and
// the medical-history Result<T> error path (a "blank list on load failure
// looks identical to a real empty list" bug fixed per AUDIT-FINDINGS.md,
// Task 14 -- these tests are the regression guard that fix never got).

jest.mock('../supabase')

import { supabase, publicDb } from '../supabase'
import { isDailyBookingLimitReached, getMedicalHistory, updateMedicalHistory } from '../api'

const mockChain = supabase as unknown as {
  from: jest.Mock; select: jest.Mock; eq: jest.Mock; upsert: jest.Mock
  maybeSingle: jest.Mock; rpc: jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('isDailyBookingLimitReached', () => {
  it('calls get_daily_booking_count with the given hospital/date/clinic and returns the boolean result', async () => {
    mockChain.rpc.mockResolvedValueOnce({ data: true, error: null })

    const result = await isDailyBookingLimitReached('hosp-1', '2026-08-01', 'clinic-1')

    expect(publicDb.rpc).toHaveBeenCalledWith('get_daily_booking_count', {
      p_hospital_id: 'hosp-1',
      p_date: '2026-08-01',
      p_clinic_id: 'clinic-1',
    })
    expect(result).toBe(true)
  })

  it('defaults p_clinic_id to null when no clinic is passed', async () => {
    mockChain.rpc.mockResolvedValueOnce({ data: false, error: null })

    await isDailyBookingLimitReached('hosp-1', '2026-08-01')

    expect(publicDb.rpc).toHaveBeenCalledWith('get_daily_booking_count', {
      p_hospital_id: 'hosp-1',
      p_date: '2026-08-01',
      p_clinic_id: null,
    })
  })

  it('fails closed (not reached) when the RPC returns no data', async () => {
    mockChain.rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await isDailyBookingLimitReached('hosp-1', '2026-08-01')

    expect(result).toBe(false)
  })
})

describe('getMedicalHistory', () => {
  it('returns ok:false with the error message on a failed load, instead of an empty history', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'network error' } })

    const result = await getMedicalHistory('patient-1')

    expect(result).toEqual({ ok: false, error: 'network error' })
  })

  it('returns ok:true with the empty-history shape when the patient genuinely has no row yet', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await getMedicalHistory('patient-1')

    expect(result).toEqual({
      ok: true,
      data: {
        conditions: [], allergies: [], medications: '', surgeries: '',
        familyHistory: '', otherConditions: '', otherAllergies: '',
      },
    })
  })

  it('maps db column names to the MedicalHistory shape on success', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        conditions: ['Asthma'], allergies: ['Penicillin'], medications: 'Ventolin',
        surgeries: null, family_history: 'Diabetes', other_conditions: null, other_allergies: null,
      },
      error: null,
    })

    const result = await getMedicalHistory('patient-1')

    expect(result).toEqual({
      ok: true,
      data: {
        conditions: ['Asthma'], allergies: ['Penicillin'], medications: 'Ventolin',
        surgeries: '', familyHistory: 'Diabetes', otherConditions: '', otherAllergies: '',
      },
    })
  })
})

describe('updateMedicalHistory', () => {
  const notes = {
    conditions: ['Asthma'], allergies: [], medications: '', surgeries: '',
    familyHistory: '', otherConditions: '', otherAllergies: '',
  }

  it('returns ok:false with the error message when the upsert fails', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'constraint violation' } })

    const result = await updateMedicalHistory('patient-1', notes)

    expect(result).toEqual({ ok: false, error: 'constraint violation' })
  })

  it('returns ok:true on success', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: null })

    const result = await updateMedicalHistory('patient-1', notes)

    expect(result).toEqual({ ok: true, data: undefined })
  })
})
