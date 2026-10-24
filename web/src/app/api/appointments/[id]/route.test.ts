import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const callerMock = { current: { role: 'doctor', hospitalId: 'HOSP', doctorId: 'DOC_B' } as Record<string, unknown> }
vi.mock('@/lib/supabase/auth-server', () => ({
  requireRole: () => Promise.resolve({ caller: callerMock.current }),
}))
vi.mock('@/lib/notify-patient', () => ({ notifyPatient: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/appointment-checkin', () => ({ checkInAppointment: vi.fn() }))

const APPT = {
  hospital_id: 'HOSP', doctor_id: 'DOC_A', assigned_doctor_id: null, urgency: null,
  clinic_id: null, status: 'checked_in', check_in_date: '2026-10-13',
}

function mockDb() {
  const updates: { table: string; row: unknown }[] = []
  return {
    updates,
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {}
      ;['select', 'eq', 'in', 'is', 'neq', 'not', 'order', 'limit'].forEach(m => { b[m] = vi.fn(() => b) })
      b.update = vi.fn((row: unknown) => { updates.push({ table, row }); return b })
      b.single = vi.fn(() => Promise.resolve({ data: table === 'appointments' ? APPT : { title: 'Dr', full_name: 'TEST' }, error: null }))
      b.maybeSingle = b.single
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
      return b
    }),
  }
}
const dbMock = { current: mockDb() }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { PATCH } = await import('./route')
const patch = (body: unknown) => PATCH(
  new NextRequest('http://localhost/api/appointments/appt-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id: 'appt-1' }) },
)

describe('PATCH /api/appointments/[id] — doctor scoping', () => {
  beforeEach(() => { dbMock.current = mockDb() })

  it('forbids a doctor from starting another doctor\'s consultation', async () => {
    callerMock.current = { role: 'doctor', hospitalId: 'HOSP', doctorId: 'DOC_B' }
    const res = await patch({ action: 'start_consultation' })
    expect(res.status).toBe(403)
    expect(dbMock.current.updates).toEqual([])
  })

  it('forbids a doctor from staff-only actions on their own patient', async () => {
    callerMock.current = { role: 'doctor', hospitalId: 'HOSP', doctorId: 'DOC_A' }
    for (const body of [{ action: 'approve' }, { action: 'set_status', status: 'completed' }, { action: 'assign_doctor', doctorId: 'DOC_B' }]) {
      const res = await patch(body)
      expect(res.status).toBe(403)
    }
    expect(dbMock.current.updates).toEqual([])
  })

  it('lets the doctor on the appointment ring their patient', async () => {
    callerMock.current = { role: 'doctor', hospitalId: 'HOSP', doctorId: 'DOC_A' }
    const res = await patch({ action: 'ring' })
    expect(res.status).toBe(200)
  })

  it('still lets front desk at the hospital approve', async () => {
    callerMock.current = { role: 'front_desk', hospitalId: 'HOSP' }
    const res = await patch({ action: 'approve' })
    expect(res.status).not.toBe(403)
  })
})
