import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/paystack', () => ({ paystackConfigured: () => true, listBanks: vi.fn(), resolveAccount: vi.fn(), createSubaccount: vi.fn() }))
const caller = { current: {} as Record<string, unknown> }
vi.mock('@/lib/supabase/auth-server', () => ({ requireRole: () => Promise.resolve({ caller: caller.current }) }))

const hospitalUpdates: unknown[] = []
const hasOwner = { current: true }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      const chain = () => b
      Object.assign(b, { select: chain, eq: chain })
      b.limit = () => Promise.resolve({ data: table === 'hospital_admins' && hasOwner.current ? [{ id: 'owner-row' }] : [] })
      b.update = (row: unknown) => { hospitalUpdates.push(row); return b }
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
      return b
    },
  }),
}))

const { DELETE } = await import('./route')
const del = () => DELETE(new NextRequest('http://localhost/api/payments/subaccount', { method: 'DELETE' }))

describe('payout account changes are owner-only', () => {
  it('forbids a non-owner admin when the hospital has an owner', async () => {
    hospitalUpdates.length = 0; hasOwner.current = true
    caller.current = { role: 'hospital_admin', hospitalId: 'H', hospitalRole: 'admin' }
    expect((await del()).status).toBe(403)
    expect(hospitalUpdates).toHaveLength(0)
  })

  it('lets the owner detach the payout account', async () => {
    hospitalUpdates.length = 0; hasOwner.current = true
    caller.current = { role: 'hospital_admin', hospitalId: 'H', hospitalRole: 'owner' }
    expect((await del()).status).toBe(200)
    expect(hospitalUpdates).toHaveLength(1)
  })

  it('lets an admin act when the hospital has no active owner (not locked out)', async () => {
    hospitalUpdates.length = 0; hasOwner.current = false
    caller.current = { role: 'hospital_admin', hospitalId: 'H', hospitalRole: 'admin' }
    expect((await del()).status).toBe(200)
  })
})
