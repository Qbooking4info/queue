import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const caller = { current: { role: 'clinic_admin', hospitalId: 'HOSP', clinicId: 'CLINIC_X' } as Record<string, unknown> }
vi.mock('@/lib/supabase/auth-server', () => ({ requireRole: () => Promise.resolve({ caller: caller.current }) }))

const updateUserById = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById } },
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      b.select = () => b; b.eq = () => b
      b.single = () => Promise.resolve({
        data: table === 'clinic_admins' ? { user_id: 'U1', hospital_id: 'HOSP', clinic_id: 'CLINIC_Y' } : { auth_id: 'AUTH_U1' },
      })
      return b
    },
  }),
}))

const { POST } = await import('./route')
const req = () => new NextRequest('http://localhost/api/clinic-staff/reset-password', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ staffId: 'CA_1', newPassword: 'a-long-enough-password' }),
})

describe('POST /api/clinic-staff/reset-password', () => {
  beforeEach(() => updateUserById.mockClear())

  it('forbids a clinic admin resetting staff of another clinic in the same hospital', async () => {
    caller.current = { role: 'clinic_admin', hospitalId: 'HOSP', clinicId: 'CLINIC_X' }
    expect((await POST(req())).status).toBe(403)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('lets the hospital admin reset any clinic\'s staff at their hospital', async () => {
    caller.current = { role: 'hospital_admin', hospitalId: 'HOSP' }
    expect((await POST(req())).status).toBe(200)
    expect(updateUserById).toHaveBeenCalledWith('AUTH_U1', { password: 'a-long-enough-password' })
  })

  it('lets a clinic admin reset their own clinic\'s staff', async () => {
    caller.current = { role: 'clinic_admin', hospitalId: 'HOSP', clinicId: 'CLINIC_Y' }
    expect((await POST(req())).status).toBe(200)
  })
})
