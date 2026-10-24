import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

// Regression for the 2026-10-13 audit M6: approving a direct booking for a slot the
// doctor already has confirmed must be refused clearly, not 500 or double-book.
// The uniqueness itself is enforced by appointments_direct_doctor_slot_live; this
// checks the route turns that violation into a 409 the doctor can act on.

vi.mock('@/lib/supabase/auth-server', () => ({
  getServerUser: vi.fn(async () => ({ id: 'auth-doc' })),
}))

const updateResult = { current: { error: null as null | { code: string; message: string } } }

function builder(single: unknown) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) b[m] = vi.fn(() => b)
  b.single = vi.fn(async () => ({ data: single, error: null }))
  b.update = vi.fn(() => ({ eq: vi.fn(async () => updateResult.current) }))
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => table === 'users'
      ? builder({ id: 'doc-user' })
      : builder({ id: 'appt-1', status: 'pending', type: 'virtual', doctor_user_id: 'doc-user', hospital_id: null }),
  }),
}))

const { PATCH } = await import('./route')

function approve() {
  return PATCH(
    new NextRequest('http://localhost/api/appointments/direct/appt-1', { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) }),
    { params: Promise.resolve({ id: 'appt-1' }) },
  )
}

beforeEach(() => { updateResult.current = { error: null } })

describe('PATCH /api/appointments/direct/[id] approve', () => {
  it('approves a free slot', async () => {
    const res = await approve()
    expect(res.status).toBe(200)
  })

  it('returns 409 when the doctor already has a confirmed booking in that slot', async () => {
    updateResult.current = { error: { code: '23505', message: 'duplicate key value violates unique constraint "appointments_direct_doctor_slot_live"' } }
    const res = await approve()
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('CONFLICT')
  })
})
