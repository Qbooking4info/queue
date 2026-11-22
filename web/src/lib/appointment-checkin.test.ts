import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkInAppointment } from './appointment-checkin'

// An unapproved booking reaching the queue would put a patient in front of a
// doctor on the strength of a request nobody accepted. The database only makes
// 'rejected' final, so this guard is the only thing enforcing it.

const appt = { current: { status: 'confirmed', approval_status: 'approved' } as Record<string, unknown> }

function mockDb() {
  const updates: Record<string, unknown>[] = []
  return {
    updates,
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      ;['select', 'eq', 'in'].forEach(m => { b[m] = vi.fn(() => b) })
      b.update = vi.fn((row: Record<string, unknown>) => { updates.push(row); return b })
      b.single = vi.fn(() => Promise.resolve({ data: appt.current, error: null }))
      b.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: 'appt-1' }], error: null }).then(ok)
      return b
    }),
  }
}

let db = mockDb()
beforeEach(() => { db = mockDb() })
const run = () => checkInAppointment(db as never, 'appt-1')

describe('checkInAppointment — approval gate', () => {
  for (const approval of ['pending_approval', 'pending_review']) {
    it(`refuses a booking that is ${approval}`, async () => {
      appt.current = { status: 'confirmed', approval_status: approval }
      const res = await run()
      expect(res.ok).toBe(false)
      expect(db.updates).toEqual([])
    })
  }

  it('refuses a rejected booking', async () => {
    appt.current = { status: 'confirmed', approval_status: 'rejected' }
    const res = await run()
    expect(res.ok).toBe(false)
    expect(db.updates).toEqual([])
  })

  for (const approval of ['approved', 'auto_approved']) {
    it(`checks in an ${approval} booking and dates it today`, async () => {
      appt.current = { status: 'confirmed', approval_status: approval }
      const res = await run()
      expect(res.ok).toBe(true)
      expect(db.updates).toHaveLength(1)
      expect(db.updates[0].status).toBe('checked_in')
      expect(db.updates[0].check_in_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  }

  it('still checks in a row with no approval_status at all', async () => {
    // Older rows predate the column; refusing them would break check-in for
    // every booking made before approvals existed.
    appt.current = { status: 'confirmed', approval_status: null }
    const res = await run()
    expect(res.ok).toBe(true)
  })
})
