import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const requireRoleMock = vi.fn()
vi.mock('@/lib/supabase/auth-server', () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(true)),
}))

function mockDb(responses: Record<string, { data: unknown; error?: unknown; count?: number }>) {
  return {
    from: vi.fn((table: string) => {
      const response = responses[table] ?? { data: null, error: null, count: 0 }
      const builder: any = {}
      ;['select', 'eq', 'in', 'limit', 'order', 'insert', 'update', 'neq', 'gte'].forEach((m) => {
        builder[m] = vi.fn(() => builder)
      })
      builder.single = vi.fn(() => Promise.resolve(response))
      builder.maybeSingle = vi.fn(() => Promise.resolve(response))
      // walkin route awaits some select(...).eq(...) chains directly (count queries)
      // without a terminal method -- make the builder itself thenable.
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve)
      return builder
    }),
  }
}

const dbMock = { current: mockDb({}) }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => dbMock.current,
}))

const { GET, POST } = await import('./route')

function makeRequest(method: string, body?: unknown, qs = '') {
  return new NextRequest(`http://localhost/api/appointments/walkin${qs}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  })
}

describe('POST /api/appointments/walkin', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
    dbMock.current = mockDb({})
  })

  it('rejects walk-in creation for another hospital (Task 5 IDOR)', async () => {
    requireRoleMock.mockResolvedValue({
      caller: { authId: 'auth-1', role: 'front_desk', hospitalId: 'HOSP_A', clinicId: 'CLINIC_A' },
    })

    const res = await POST(
      makeRequest('POST', {
        hospitalId: 'HOSP_B', // foreign hospital
        patientName: 'Walk-in Patient',
        date: '2026-07-26',
        startTime: '10:00',
      }),
    )

    expect(res.status).toBe(403)
  })

  it('rejects a doctor that does not belong to the named hospital', async () => {
    requireRoleMock.mockResolvedValue({
      caller: { authId: 'auth-1', role: 'hospital_admin', hospitalId: 'HOSP_A' },
    })
    dbMock.current = mockDb({
      doctors: { data: { hospital_id: 'HOSP_OTHER' } },
    })

    const res = await POST(
      makeRequest('POST', {
        hospitalId: 'HOSP_A',
        doctorId: 'DOC_FOREIGN',
        patientName: 'Walk-in Patient',
        date: '2026-07-26',
        startTime: '10:00',
      }),
    )

    expect(res.status).toBe(400)
  })
})

describe('GET /api/appointments/walkin', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
    dbMock.current = mockDb({})
  })

  it('requires the caller to have a hospital association', async () => {
    requireRoleMock.mockResolvedValue({
      caller: { authId: 'auth-1', role: 'front_desk', hospitalId: undefined },
    })

    const res = await GET(makeRequest('GET', undefined, '?phone=08000000000'))
    expect(res.status).toBe(403)
  })
})
