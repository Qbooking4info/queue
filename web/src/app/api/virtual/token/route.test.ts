import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getServerUserMock = vi.fn()
vi.mock('@/lib/supabase/auth-server', () => ({
  getServerUser: (...args: unknown[]) => getServerUserMock(...args),
}))

vi.mock('agora-token', () => ({
  RtcTokenBuilder: { buildTokenWithUid: vi.fn(() => 'fake-token') },
  RtcRole: { PUBLISHER: 1 },
}))

function mockDb(responses: Record<string, { data: unknown; error?: unknown }>) {
  return {
    from: vi.fn((table: string) => {
      const response = responses[table] ?? { data: null, error: null }
      const builder: any = {}
      ;['select', 'eq', 'in', 'upsert', 'update'].forEach((m) => {
        builder[m] = vi.fn(() => builder)
      })
      builder.single = vi.fn(() => Promise.resolve(response))
      builder.maybeSingle = vi.fn(() => Promise.resolve(response))
      return builder
    }),
  }
}

const dbMock = { current: mockDb({}) }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => dbMock.current,
}))

const { POST } = await import('./route')

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/virtual/token', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/virtual/token', () => {
  beforeEach(() => {
    getServerUserMock.mockReset()
  })

  // This already worked correctly before the audit -- this test locks it in
  // per Task 9b, so a future refactor of this route can't silently drop it.
  it('rejects a caller who is not the assigned doctor', async () => {
    getServerUserMock.mockResolvedValue({ id: 'AUTH_NOT_THE_DOCTOR' })
    dbMock.current = mockDb({
      appointments: {
        data: { id: 'appt-1', type: 'virtual', status: 'confirmed', doctor_id: 'DOC_1', patient_id: 'PAT_1' },
      },
      doctors: {
        data: { id: 'DOC_1', auth_user_id: 'AUTH_THE_REAL_DOCTOR', user_id: null },
      },
    })

    const res = await POST(makeRequest({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(403)
  })

  it('allows the assigned doctor to start the call', async () => {
    process.env.AGORA_APP_ID = 'test-app-id'
    process.env.AGORA_APP_CERTIFICATE = 'test-cert'
    getServerUserMock.mockResolvedValue({ id: 'AUTH_THE_REAL_DOCTOR' })
    dbMock.current = mockDb({
      appointments: {
        data: { id: 'appt-1', type: 'virtual', status: 'confirmed', doctor_id: 'DOC_1', patient_id: 'PAT_1' },
      },
      doctors: {
        data: { id: 'DOC_1', auth_user_id: 'AUTH_THE_REAL_DOCTOR', user_id: null },
      },
      virtual_sessions: { data: null, error: null },
    })

    const res = await POST(makeRequest({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(200)
  })
})
