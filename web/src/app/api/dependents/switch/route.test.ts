import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/auth-server', () => ({ getServerUser: () => Promise.resolve({ id: 'AUTH_CARETAKER' }) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => Promise.resolve(true) }))

const generateLink = vi.fn((args: { email: string }) => Promise.resolve({
  data: { properties: { hashed_token: 'hash' }, user: { id: args.email === 'dependent-auth@example.com' ? 'AUTH_DEP' : 'AUTH_VICTIM' } },
  error: null,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: {
      generateLink,
      getUserById: () => Promise.resolve({ data: { user: { id: 'AUTH_DEP', email: 'dependent-auth@example.com' } } }),
    } },
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => { f[c] = v; return b }
      b.limit = () => Promise.resolve({ data: [] })
      b.maybeSingle = () => Promise.resolve({ data: table === 'dependent_links' ? { id: 'link' } : null })
      b.single = () => Promise.resolve({ data: table === 'users' && f.auth_id === 'AUTH_CARETAKER' ? { id: 'U_CARE' }
        // the dependent's PROFILE email was changed to the victim's
        : { full_name: 'TEST Dependent', auth_id: 'AUTH_DEP', email: 'victim@example.com' } })
      return b
    },
  }),
}))

const { POST } = await import('./route')

describe('POST /api/dependents/switch', () => {
  it('mints the link for the dependent\'s auth email, never the editable profile email', async () => {
    const res = await POST(new NextRequest('http://localhost/api/dependents/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dependentId: 'U_DEP' }),
    }))
    expect(res.status).toBe(200)
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'dependent-auth@example.com' })
    expect(generateLink).not.toHaveBeenCalledWith(expect.objectContaining({ email: 'victim@example.com' }))
  })
})
