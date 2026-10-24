import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ctx = { current: { adminRecord: { hospital_id: 'HOSP_A', role: 'owner' } } }
vi.mock('@/lib/getHospitalContext', () => ({ getHospitalContext: () => Promise.resolve(ctx.current) }))

const updateUserById = vi.fn(() => Promise.resolve({ error: null }))
// hospital_admins membership + users row, both keyed off the filters the action applies.
function mockDb(opts: { memberOf?: { hospital: string; user: string; role: string }; user?: { email: string; auth_id: string } }) {
  return {
    auth: { admin: { updateUserById, getUserById: () => Promise.resolve({ data: { user: { email: opts.user?.email } } }) } },
    from: vi.fn((table: string) => {
      const f: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = vi.fn(() => b)
      b.eq = vi.fn((c: string, v: unknown) => { f[c] = v; return b })
      b.in = vi.fn((c: string, v: string[]) => { f[c] = v; return b })
      b.maybeSingle = vi.fn(() => {
        const m = opts.memberOf
        const hit = m && f.hospital_id === m.hospital && f.user_id === m.user && (f.role as string[]).includes(m.role)
        return Promise.resolve({ data: hit ? { role: m!.role } : null })
      })
      b.single = vi.fn(() => Promise.resolve({ data: table === 'users' ? opts.user ?? null : null }))
      return b
    }),
  }
}
const dbMock = { current: mockDb({}) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { resetStaffPassword } = await import('./actions')
const form = (userId: string) => { const f = new FormData(); f.set('user_id', userId); return f }

describe('resetStaffPassword', () => {
  beforeEach(() => { updateUserById.mockClear(); ctx.current = { adminRecord: { hospital_id: 'HOSP_A', role: 'owner' } } })

  it('resets a portal login belonging to the caller\'s hospital', async () => {
    dbMock.current = mockDb({
      memberOf: { hospital: 'HOSP_A', user: 'U_FD', role: 'front_desk' },
      user: { email: 'frontdesk.test@portal.queueapp.co', auth_id: 'AUTH_FD' },
    })
    const res = await resetStaffPassword(null, form('U_FD'))
    expect(res).toMatchObject({ email: 'frontdesk.test@portal.queueapp.co' })
    expect(updateUserById).toHaveBeenCalledWith('AUTH_FD', expect.objectContaining({ password: expect.any(String) }))
  })

  it('refuses a user who is not staff at the caller\'s hospital (account takeover)', async () => {
    dbMock.current = mockDb({
      memberOf: { hospital: 'HOSP_B', user: 'U_VICTIM', role: 'front_desk' },
      user: { email: 'frontdesk.b@portal.queueapp.co', auth_id: 'AUTH_VICTIM' },
    })
    const res = await resetStaffPassword(null, form('U_VICTIM'))
    expect(res).toEqual({ error: 'User not found' })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses an owner/admin account even at the same hospital', async () => {
    dbMock.current = mockDb({
      memberOf: { hospital: 'HOSP_A', user: 'U_OWNER', role: 'owner' },
      user: { email: 'owner@example.com', auth_id: 'AUTH_OWNER' },
    })
    const res = await resetStaffPassword(null, form('U_OWNER'))
    expect(res).toEqual({ error: 'User not found' })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses a staff member who signs in with their own email', async () => {
    dbMock.current = mockDb({
      memberOf: { hospital: 'HOSP_A', user: 'U_SPEC', role: 'specialist' },
      user: { email: 'dr.real@gmail.com', auth_id: 'AUTH_SPEC' },
    })
    const res = await resetStaffPassword(null, form('U_SPEC'))
    expect(res).toHaveProperty('error')
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('refuses callers who are not admin/owner', async () => {
    ctx.current = { adminRecord: { hospital_id: 'HOSP_A', role: 'front_desk' } }
    const res = await resetStaffPassword(null, form('U_FD'))
    expect(res).toEqual({ error: 'Unauthorized' })
  })
})
