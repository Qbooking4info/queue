import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Regression tests for the 2026-10-27 appointment-flow review. Each one fails
// against the code as it was before that review.

const callerMock = { current: { role: 'front_desk', hospitalId: 'HOSP' } as Record<string, unknown> }
vi.mock('@/lib/supabase/auth-server', () => ({
  requireRole: () => Promise.resolve({ caller: callerMock.current }),
}))

const notifyPatient = vi.fn(() => Promise.resolve())
vi.mock('@/lib/notify-patient', () => ({ notifyPatient: (...a: unknown[]) => notifyPatient(...(a as [])) }))
vi.mock('@/lib/appointment-checkin', () => ({ checkInAppointment: vi.fn(() => Promise.resolve({ ok: true })) }))

const appt = {
  current: {
    hospital_id: 'HOSP', doctor_id: 'DOC_A', assigned_doctor_id: null, urgency: null,
    clinic_id: null, status: 'confirmed', check_in_date: null,
    appointment_date: '2026-10-27', start_time: '09:00', slot_id: null,
  } as Record<string, unknown>,
}

// noRowsMatch models the guarded-update case: `.eq('status', ...)` matched
// nothing, which PostgREST reports as success with an empty array -- the
// silent no-op every guarded write in this route exists to catch.
function mockDb(opts: { noRowsMatch?: boolean } = {}) {
  const updates: { table: string; row: Record<string, unknown> }[] = []
  const ordered: { column: string; opts: unknown }[] = []
  const rpcs: { fn: string; args: unknown }[] = []
  return {
    updates, ordered, rpcs,
    rpc: vi.fn((fn: string, args: unknown) => { rpcs.push({ fn, args }); return Promise.resolve({ error: null }) }),
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {}
      ;['select', 'eq', 'in', 'is', 'neq', 'not', 'limit', 'or'].forEach(m => { b[m] = vi.fn(() => b) })
      b.order = vi.fn((column: string, opts: unknown) => { ordered.push({ column, opts }); return b })
      b.update = vi.fn((row: Record<string, unknown>) => { updates.push({ table, row }); return b })
      b.single = vi.fn(() => Promise.resolve({
        data: table === 'appointments' ? appt.current : { title: 'Dr', full_name: 'Ada' }, error: null,
      }))
      // The queue lookups want a row back so the alert path actually runs.
      b.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'next-1' }, error: null }))
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({
        data: opts.noRowsMatch ? [] : [{ id: 'appt-1' }], error: null,
      }).then(ok)
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

const apptUpdates = () => dbMock.current.updates.filter(u => u.table === 'appointments')

beforeEach(() => {
  dbMock.current = mockDb()
  notifyPatient.mockClear()
  callerMock.current = { role: 'front_desk', hospitalId: 'HOSP' }
  appt.current = {
    hospital_id: 'HOSP', doctor_id: 'DOC_A', assigned_doctor_id: null, urgency: null,
    clinic_id: null, status: 'confirmed', check_in_date: null,
    appointment_date: '2026-10-27', start_time: '09:00', slot_id: null,
  }
})

describe('start_consultation — the patient must land in the queue', () => {
  it('sets check_in_date when starting straight from confirmed', async () => {
    const res = await patch({ action: 'start_consultation' })
    expect(res.status).toBe(200)

    // Without this the renumber trigger returns early on a null check_in_date,
    // the patient gets no queue position, and the nightly sweep can never close
    // the consult -- which is how one stayed open for 58 days.
    const start = apptUpdates().find(u => u.row.status === 'in_progress')
    expect(start).toBeDefined()
    expect(start!.row.check_in_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('does not overwrite an existing check_in_date', async () => {
    appt.current.status = 'checked_in'
    appt.current.check_in_date = '2026-10-20'
    await patch({ action: 'start_consultation' })

    const start = apptUpdates().find(u => u.row.status === 'in_progress')
    // Rewriting it would move the patient to today's queue and discard the
    // arrival order they have been waiting in.
    expect(start!.row.check_in_date).toBeUndefined()
  })

  it('picks the next patient by lowest queue position, not position 2', async () => {
    await patch({ action: 'start_consultation' })
    // `ring` lets a free doctor call someone in early, so "position 2" is not
    // reliably the next patient; the alert has to ask who is actually first.
    expect(dbMock.current.ordered).toContainEqual(
      { column: 'queue_position', opts: { ascending: true, nullsFirst: false } },
    )
  })
})

describe('ring — the patient has to hear it', () => {
  it('sends the call on the ringing channel', async () => {
    appt.current.status = 'checked_in'
    const res = await patch({ action: 'ring' })
    expect(res.status).toBe(200)

    expect(notifyPatient).toHaveBeenCalled()
    const args = notifyPatient.mock.calls[0] as unknown[]
    // A default-channel notification in a waiting room is a missed one, and a
    // push-only one is missed outright when the token is dead or the phone is
    // on 2G -- so this ring must also be allowed to fall back to SMS.
    expect(args[5]).toEqual({ channelId: 'queue-calls', critical: true })
  })
})

describe('set_status — completing must not strand the call', () => {
  it('ends an active virtual session when the status goes terminal', async () => {
    appt.current.status = 'in_progress'
    const res = await patch({ action: 'set_status', status: 'completed' })
    expect(res.status).toBe(200)
    expect(dbMock.current.updates.some(u => u.table === 'virtual_sessions' && u.row.status === 'ended')).toBe(true)
  })

  it('leaves the session alone for a non-terminal status', async () => {
    appt.current.status = 'checked_in'
    await patch({ action: 'set_status', status: 'confirmed' })
    expect(dbMock.current.updates.some(u => u.table === 'virtual_sessions')).toBe(false)
  })
})

// 2026-10-30 product research, defect #1: a patient sent out for a lab test
// kept their original checked_in_at, so on returning they were ranked ahead of
// everyone who had arrived while they were away.
describe('leaving and re-entering the queue', () => {
  it('records where a checked-in patient was sent', async () => {
    appt.current.status = 'checked_in'
    const res = await patch({ action: 'leave_queue', reason: 'Haematology' })
    expect(res.status).toBe(200)
    const row = apptUpdates()[0].row
    expect(row.left_queue_reason).toBe('Haematology')
    expect(row.left_queue_at).toEqual(expect.any(String))
  })

  it('refuses to send out someone who is not in the queue', async () => {
    appt.current.status = 'completed'
    dbMock.current = mockDb({ noRowsMatch: true })
    const res = await patch({ action: 'leave_queue' })
    expect(res.status).toBe(400)
  })

  it('re-enters through the ordering RPC, not a direct position write', async () => {
    appt.current.status = 'checked_in'
    const res = await patch({ action: 'return_to_queue' })
    expect(res.status).toBe(200)
    expect(dbMock.current.rpcs).toEqual([
      { fn: 'return_to_queue', args: { p_appointment_id: 'appt-1' } },
    ])
    // The position must never be written from the API -- only renumber_doctor_queue
    // knows the whole queue, and a hand-set position is what the override audit exists to prevent.
    expect(apptUpdates().some(u => 'queue_position' in u.row)).toBe(false)
  })

  it('stops a doctor acting on a patient who is not theirs', async () => {
    appt.current.status = 'checked_in'
    callerMock.current = { role: 'doctor', hospitalId: 'HOSP', doctorId: 'DOC_B' }
    expect((await patch({ action: 'leave_queue' })).status).toBe(403)
    expect((await patch({ action: 'return_to_queue' })).status).toBe(403)
  })
})
