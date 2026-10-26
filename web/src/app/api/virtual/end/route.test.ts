import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getServerUserMock = vi.fn()
vi.mock('@/lib/supabase/auth-server', () => ({
  getServerUser: (...args: unknown[]) => getServerUserMock(...args),
}))

type Resp = { data: unknown; error?: unknown }

// Per-table responses; `users` is keyed by the id passed to .eq('id', ...), since the
// route looks up the doctor's and the patient's auth ids separately.
function mockDb(tables: Record<string, Resp>, users: Record<string, Resp> = {}) {
  const updates: { table: string; row: Record<string, unknown> }[] = []
  const db = {
    updates,
    from: vi.fn((table: string) => {
      let idFilter: string | null = null
      const resolve = () => table === 'users'
        ? Promise.resolve(users[idFilter ?? ''] ?? { data: null })
        : Promise.resolve(tables[table] ?? { data: null })
      const b: Record<string, unknown> = {}
      ;['select', 'in', 'is'].forEach(m => { b[m] = vi.fn(() => b) })
      b.eq = vi.fn((col: string, val: string) => { if (col === 'id') idFilter = val; return b })
      b.update = vi.fn((row: Record<string, unknown>) => { updates.push({ table, row }); return b })
      b.single = vi.fn(resolve)
      b.maybeSingle = vi.fn(resolve)
      b.then = (ok: (v: Resp) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
      return b
    }),
  }
  return db
}

const dbMock = { current: mockDb({}) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { POST } = await import('./route')

const req = (body: unknown) => new NextRequest('http://localhost/api/virtual/end', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
})

const virtualAppt = {
  id: 'appt-1', type: 'virtual', status: 'in_progress',
  doctor_id: null, doctor_user_id: 'DOC_USER', patient_id: 'PAT_USER',
}
const users = { DOC_USER: { data: { auth_id: 'AUTH_DOC' } }, PAT_USER: { data: { auth_id: 'AUTH_PAT' } } }

describe('POST /api/virtual/end', () => {
  beforeEach(() => getServerUserMock.mockReset())

  it('does not complete the appointment when the patient leaves', async () => {
    getServerUserMock.mockResolvedValue({ id: 'AUTH_PAT' })
    dbMock.current = mockDb({ appointments: { data: virtualAppt } }, users)

    const res = await POST(req({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ended: false })
    expect(dbMock.current.updates).toEqual([])
  })

  it('completes the appointment and ends the session when the doctor ends it', async () => {
    getServerUserMock.mockResolvedValue({ id: 'AUTH_DOC' })
    dbMock.current = mockDb({
      appointments: { data: virtualAppt },
      virtual_sessions: { data: { started_at: new Date(Date.now() - 60_000).toISOString(), ended_at: null } },
    }, users)

    const res = await POST(req({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(200)
    const appt = dbMock.current.updates.find(u => u.table === 'appointments')
    expect(appt?.row).toMatchObject({ status: 'completed' })
    expect(appt?.row.consult_ended_at).toBeTruthy()
    const session = dbMock.current.updates.find(u => u.table === 'virtual_sessions')
    expect(session?.row).toMatchObject({ status: 'ended' })
    expect(session?.row.duration_secs).toBeGreaterThanOrEqual(59)
  })

  it('is idempotent: a second end does not rewrite the duration', async () => {
    getServerUserMock.mockResolvedValue({ id: 'AUTH_DOC' })
    dbMock.current = mockDb({
      appointments: { data: virtualAppt },
      virtual_sessions: { data: { started_at: '2026-10-13T10:00:00Z', ended_at: '2026-10-13T10:20:00Z' } },
    }, users)

    const res = await POST(req({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(200)
    expect(dbMock.current.updates).toEqual([])
  })

  it('refuses to end an in-person appointment', async () => {
    getServerUserMock.mockResolvedValue({ id: 'AUTH_PAT' })
    dbMock.current = mockDb({ appointments: { data: { ...virtualAppt, type: 'in_person' } } }, users)

    const res = await POST(req({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(400)
    expect(dbMock.current.updates).toEqual([])
  })

  it('rejects a caller who is neither doctor nor patient', async () => {
    getServerUserMock.mockResolvedValue({ id: 'AUTH_STRANGER' })
    dbMock.current = mockDb({ appointments: { data: virtualAppt } }, users)

    const res = await POST(req({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(403)
  })
})
