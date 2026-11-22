import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// The rule this file exists to pin down: a patient may move themselves LATER in
// the queue and never earlier. Moving earlier means jumping ahead of people who
// arrived before you, which only staff may authorise. The SQL function supports
// both directions and trusts this route to decide, so if this check goes, the
// queue stops meaning anything.
vi.mock('server-only', () => ({}))

const caller = { current: null as Record<string, unknown> | null }
const serverUser = { current: { id: 'AUTH_PATIENT' } as { id: string } | null }
vi.mock('@/lib/supabase/auth-server', () => ({
  requireRole: () => Promise.resolve(
    caller.current
      ? { caller: caller.current }
      : NextResponse.json({ error: 'forbidden' }, { status: 403 }),
  ),
  getServerUser: () => Promise.resolve(serverUser.current),
}))

const appt = {
  current: {
    hospital_id: 'HOSP', patient_id: 'P1', doctor_id: 'DOC', assigned_doctor_id: null,
    check_in_date: '2026-11-10', status: 'checked_in', urgency: 'routine',
    queue_position: 4, estimated_wait: 25,
  } as Record<string, unknown>,
}

const rpcs: { fn: string; args: unknown }[] = []

function mockDb() {
  return {
    rpc: vi.fn((fn: string, args: unknown) => { rpcs.push({ fn, args }); return Promise.resolve({ error: null }) }),
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'or', 'neq', 'lt', 'not', 'order', 'limit']) {
        b[m] = vi.fn(() => b)
      }
      b.single = vi.fn(() => Promise.resolve({
        data: table === 'appointments' ? appt.current : { id: 'P1' }, error: null,
      }))
      b.maybeSingle = b.single
      // Every count query resolves the same -- the counts themselves are not
      // what this file is testing.
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ count: 2, data: [], error: null }).then(ok)
      return b
    }),
  }
}
const dbMock = { current: mockDb() }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { GET, POST } = await import('./route')

const ctx = { params: Promise.resolve({ id: 'appt-1' }) }
const post = (newPosition: unknown) => POST(
  new NextRequest('http://localhost/api/appointments/appt-1/queue-position', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPosition }),
  }), ctx,
)
const get = () => GET(new NextRequest('http://localhost/api/appointments/appt-1/queue-position'), ctx)

const asPatient = () => { caller.current = null; serverUser.current = { id: 'AUTH_PATIENT' } }
const asStaff = () => { caller.current = { role: 'front_desk', hospitalId: 'HOSP' } }

beforeEach(() => {
  dbMock.current = mockDb()
  rpcs.length = 0
  appt.current = {
    hospital_id: 'HOSP', patient_id: 'P1', doctor_id: 'DOC', assigned_doctor_id: null,
    check_in_date: '2026-11-10', status: 'checked_in', urgency: 'routine',
    queue_position: 4, estimated_wait: 25,
  }
  asStaff()
})

describe('a patient moving themselves', () => {
  beforeEach(asPatient)

  it('may step back to a later position', async () => {
    const res = await post(7)
    expect(res.status).toBe(200)
    expect(rpcs).toEqual([{ fn: 'move_appointment_in_queue', args: { p_appointment_id: 'appt-1', p_new_position: 7 } }])
  })

  it('may not move to a lower number', async () => {
    const res = await post(2)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'You can only move to a later position' })
    expect(rpcs).toEqual([])
  })

  it('may not move to the front of the queue', async () => {
    expect((await post(1)).status).toBe(400)
    expect(rpcs).toEqual([])
  })

  it('may not restate their own position as a no-op move', async () => {
    expect((await post(4)).status).toBe(400)
    expect(rpcs).toEqual([])
  })

  it('may not move while they have no position yet', async () => {
    appt.current.queue_position = null
    expect((await post(5)).status).toBe(400)
    expect(rpcs).toEqual([])
  })

  it('may not move someone else', async () => {
    appt.current.patient_id = 'SOMEONE_ELSE'
    expect((await post(7)).status).toBe(403)
    expect(rpcs).toEqual([])
  })

  it('may not move once the consultation has started', async () => {
    appt.current.status = 'in_progress'
    expect((await post(7)).status).toBe(400)
    expect(rpcs).toEqual([])
  })

  it('rejects a nonsense position outright', async () => {
    for (const bad of [0, -3, null, undefined]) {
      expect((await post(bad)).status).toBe(400)
    }
    expect(rpcs).toEqual([])
  })
})

describe('staff moving a patient', () => {
  it('may move someone earlier, which a patient may not', async () => {
    const res = await post(1)
    expect(res.status).toBe(200)
    expect(rpcs).toEqual([{ fn: 'move_appointment_in_queue', args: { p_appointment_id: 'appt-1', p_new_position: 1 } }])
  })

  it('may not reach into another hospital', async () => {
    caller.current = { role: 'front_desk', hospitalId: 'OTHER' }
    expect((await post(1)).status).toBe(403)
    expect(rpcs).toEqual([])
  })

  it('lets a super admin cross hospitals', async () => {
    caller.current = { role: 'super_admin', hospitalId: 'OTHER' }
    expect((await post(1)).status).toBe(200)
  })
})

describe('reading the queue pass', () => {
  it('reports the queue in terms the patient can act on', async () => {
    const body = await (await get()).json()
    expect(body).toMatchObject({
      currentPosition: 4, status: 'checked_in', estimatedWait: 25,
      aheadOfYou: 2, emergenciesAhead: 2,
    })
    // Stamped so a frozen screen cannot pass for a live one.
    expect(Date.parse(body.asOf)).not.toBeNaN()
  })

  it('refuses a patient who is not in a queue at all', async () => {
    appt.current.status = 'completed'
    expect((await get()).status).toBe(400)
  })
})
