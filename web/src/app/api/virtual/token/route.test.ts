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

// notify-patient pulls in lib/push, which is marked 'server-only' and throws
// when loaded outside a server component. Mocking it here also lets us assert
// that starting a call actually rings the patient.
const notifyIncomingCallMock = vi.fn()
vi.mock('@/lib/notify-patient', () => ({
  notifyIncomingCall: (...args: unknown[]) => notifyIncomingCallMock(...args),
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
    notifyIncomingCallMock.mockReset()
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

  // The patient used to be told nothing when a doctor started the call -- they
  // only found out if they were already sitting on the consultation screen.
  it('rings the patient when the doctor starts the call', async () => {
    process.env.AGORA_APP_ID = 'test-app-id'
    process.env.AGORA_APP_CERTIFICATE = 'test-cert'
    getServerUserMock.mockResolvedValue({ id: 'AUTH_THE_REAL_DOCTOR' })
    dbMock.current = mockDb({
      appointments: {
        data: { id: 'appt-1', type: 'virtual', status: 'confirmed', doctor_id: 'DOC_1', patient_id: 'PAT_1' },
      },
      doctors: { data: { id: 'DOC_1', auth_user_id: 'AUTH_THE_REAL_DOCTOR', user_id: null } },
      users: { data: { full_name: 'Emeka Obi' } },
      virtual_sessions: { data: null, error: null },
    })

    await POST(makeRequest({ appointmentId: 'appt-1' }))

    expect(notifyIncomingCallMock).toHaveBeenCalledTimes(1)
    const [, appointmentId, doctorName] = notifyIncomingCallMock.mock.calls[0]
    expect(appointmentId).toBe('appt-1')
    expect(doctorName).toBe('Dr. Emeka Obi')
  })

  // A misconfigured deploy must not hand out a token signed with an empty app id.
  it('refuses to build a token when Agora credentials are missing', async () => {
    delete process.env.AGORA_APP_ID
    delete process.env.AGORA_APP_CERTIFICATE
    getServerUserMock.mockResolvedValue({ id: 'AUTH_THE_REAL_DOCTOR' })
    dbMock.current = mockDb({
      appointments: {
        data: { id: 'appt-1', type: 'virtual', status: 'confirmed', doctor_id: 'DOC_1', patient_id: 'PAT_1' },
      },
      doctors: { data: { id: 'DOC_1', auth_user_id: 'AUTH_THE_REAL_DOCTOR', user_id: null } },
    })

    const res = await POST(makeRequest({ appointmentId: 'appt-1' }))
    expect(res.status).toBe(500)
    expect(notifyIncomingCallMock).not.toHaveBeenCalled()
  })
})
