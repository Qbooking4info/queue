import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const requireRoleMock = vi.fn()
vi.mock('@/lib/supabase/auth-server', () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(true)),
}))

function mockDb(responses: Record<string, { data: unknown; error?: unknown }>) {
  return {
    auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } },
    from: vi.fn((table: string) => {
      const response = responses[table] ?? { data: null, error: null }
      const builder: any = {}
      ;['select', 'eq', 'in', 'limit', 'order', 'insert', 'update'].forEach((m) => {
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

// Imported after the mocks above so the route picks up the mocked modules.
const { POST } = await import('./route')

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/clinic-staff', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/clinic-staff', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
    dbMock.current = mockDb({})
  })

  it('rejects staff creation for another hospital (Task 4 IDOR)', async () => {
    requireRoleMock.mockResolvedValue({
      caller: { authId: 'auth-1', role: 'clinic_admin', hospitalId: 'HOSP_A', clinicId: 'CLINIC_A' },
    })

    const res = await POST(
      makeRequest({
        clinicId: 'CLINIC_B',
        hospitalId: 'HOSP_B', // foreign hospital
        staffName: 'Jane Doe',
        staffEmail: 'jane@example.com',
        tempPassword: 'a-long-enough-password',
      }),
    )

    expect(res.status).toBe(403)
  })

  it('rejects when the clinic does not belong to the named hospital', async () => {
    requireRoleMock.mockResolvedValue({
      caller: { authId: 'auth-1', role: 'hospital_admin', hospitalId: 'HOSP_A' },
    })
    dbMock.current = mockDb({
      hospital_clinics: { data: { hospital_id: 'HOSP_OTHER' } },
    })

    const res = await POST(
      makeRequest({
        clinicId: 'CLINIC_A',
        hospitalId: 'HOSP_A',
        staffName: 'Jane Doe',
        staffEmail: 'jane@example.com',
        tempPassword: 'a-long-enough-password',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('rejects a temporary password under 12 characters', async () => {
    requireRoleMock.mockResolvedValue({
      caller: { authId: 'auth-1', role: 'hospital_admin', hospitalId: 'HOSP_A' },
    })

    const res = await POST(
      makeRequest({
        clinicId: 'CLINIC_A',
        hospitalId: 'HOSP_A',
        staffName: 'Jane Doe',
        staffEmail: 'jane@example.com',
        tempPassword: 'short',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('rejects a clinic_admin trying to mint a peer clinic_admin', async () => {
    requireRoleMock.mockResolvedValue({
      caller: { authId: 'auth-1', role: 'clinic_admin', hospitalId: 'HOSP_A', clinicId: 'CLINIC_A' },
    })
    dbMock.current = mockDb({
      hospital_clinics: { data: { hospital_id: 'HOSP_A' } },
    })

    const res = await POST(
      makeRequest({
        clinicId: 'CLINIC_A',
        hospitalId: 'HOSP_A',
        staffName: 'Jane Doe',
        staffEmail: 'jane@example.com',
        tempPassword: 'a-long-enough-password',
        role: 'clinic_admin',
      }),
    )

    expect(res.status).toBe(403)
  })
})
