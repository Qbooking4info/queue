import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/auth-server', () => ({ getServerUser: () => Promise.resolve({ id: 'AUTH_CALLER' }) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => Promise.resolve(true) }))

const ADULT = { id: 'U_ADULT', auth_id: 'AUTH_ADULT', full_name: 'TEST Adult', date_of_birth: '1990-05-05' }
const CHILD = { id: 'U_CHILD', auth_id: 'AUTH_CHILD', full_name: 'TEST Child', date_of_birth: '2016-05-05' }

// users: caller lookup by auth_id, target lookup by patient_code.
// privileged: set of user ids that have a staff/doctor/admin row.
function mockDb(target: typeof ADULT | null, privileged: string[] = []) {
  const inserts: unknown[] = []
  return {
    inserts,
    from: vi.fn((table: string) => {
      const f: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = vi.fn(() => b)
      b.eq = vi.fn((c: string, v: unknown) => { f[c] = v; return b })
      b.limit = vi.fn(() => Promise.resolve({
        data: (f.user_id && privileged.includes(f.user_id as string)) ? [{ id: 'x' }] : [],
      }))
      b.single = vi.fn(() => {
        if (table === 'users' && f.auth_id === 'AUTH_CALLER') return Promise.resolve({ data: { id: 'U_CALLER' } })
        if (table === 'users' && f.patient_code) return Promise.resolve({ data: target })
        return Promise.resolve({ data: null })
      })
      b.maybeSingle = vi.fn(() => Promise.resolve({ data: null }))
      b.insert = vi.fn((row: unknown) => {
        inserts.push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'link-1' }, error: null }) }) }
      })
      return b
    }),
  }
}
const dbMock = { current: mockDb(null) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { GET, POST } = await import('./route')
const post = (body: unknown) => new NextRequest('http://localhost/api/dependents/link', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const get = (qs: string) => new NextRequest(`http://localhost/api/dependents/link?${qs}`)

describe('/api/dependents/link', () => {
  beforeEach(() => { dbMock.current = mockDb(null) })

  it('refuses to let a caretaker claim an adult by code (account takeover)', async () => {
    dbMock.current = mockDb(ADULT)
    const res = await POST(post({ code: 'ABC123', relationship: 'other' }))
    expect(res.status).toBe(403)
    expect(dbMock.current.inserts).toHaveLength(0)
  })

  it('lets a caretaker link a minor by code', async () => {
    dbMock.current = mockDb(CHILD)
    const res = await POST(post({ code: 'ABC123', relationship: 'child' }))
    expect(res.status).toBe(200)
    expect(dbMock.current.inserts).toEqual([expect.objectContaining({ caretaker_id: 'U_CALLER', dependent_id: 'U_CHILD' })])
  })

  it('lets an adult link themselves to a caretaker (as=dependent)', async () => {
    dbMock.current = mockDb(ADULT) // the looked-up account is the caretaker here
    const res = await POST(post({ code: 'ABC123', relationship: 'spouse', as: 'dependent' }))
    expect(res.status).toBe(200)
    expect(dbMock.current.inserts).toEqual([expect.objectContaining({ caretaker_id: 'U_ADULT', dependent_id: 'U_CALLER' })])
  })

  it('never links a staff/doctor/admin account as a dependent', async () => {
    dbMock.current = mockDb({ ...CHILD, id: 'U_STAFF' }, ['U_STAFF'])
    const res = await POST(post({ code: 'ABC123', relationship: 'child' }))
    expect(res.status).toBe(403)
    expect(dbMock.current.inserts).toHaveLength(0)
  })

  it('lookup does not reveal an adult to a caretaker, and never returns date of birth', async () => {
    dbMock.current = mockDb(ADULT)
    expect((await GET(get('code=ABC123'))).status).toBe(403)

    dbMock.current = mockDb(CHILD)
    const res = await GET(get('code=ABC123'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ fullName: 'TEST Child', dateOfBirth: null })
  })
})
