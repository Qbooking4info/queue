import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const verifyTransaction = vi.fn()
vi.mock('@/lib/paystack', () => ({
  paystackConfigured: () => true,
  verifyTransaction: (ref: string) => verifyTransaction(ref),
}))
const notifyPatient = vi.fn(() => Promise.resolve())
vi.mock('@/lib/notify-patient', () => ({ notifyPatient: (...a: unknown[]) => notifyPatient(...(a as [])) }))

const stale = {
  current: [{ id: 'pay-1', appointment_id: 'appt-1', amount: 5000, patient_id: 'U1', paystack_ref: 'ref-1' }],
}

function mockDb() {
  const updates: { table: string; row: Record<string, unknown> }[] = []
  return {
    updates,
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {}
      ;['select', 'eq', 'in', 'not', 'lt', 'order', 'limit'].forEach(m => { b[m] = vi.fn(() => b) })
      b.update = vi.fn((row: Record<string, unknown>) => { updates.push({ table, row }); return b })
      // Only the payments listing resolves to rows; the guarded updates return one.
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve(
        table === 'payments' && !updates.length
          ? { data: stale.current, error: null }
          : { data: [{ id: 'pay-1' }], error: null },
      ).then(ok)
      b.select = vi.fn(() => b)
      return b
    }),
  }
}
const dbMock = { current: mockDb() }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { POST } = await import('./route')
const call = (auth?: string) => POST(new NextRequest('http://localhost/api/payments/reconcile', {
  method: 'POST', headers: auth ? { authorization: auth } : {},
}))

const payUpdates = () => dbMock.current.updates.filter(u => u.table === 'payments')

beforeEach(() => {
  dbMock.current = mockDb()
  verifyTransaction.mockReset()
  notifyPatient.mockClear()
  process.env.CRON_SECRET = 's3cret'
  stale.current = [{ id: 'pay-1', appointment_id: 'appt-1', amount: 5000, patient_id: 'U1', paystack_ref: 'ref-1' }]
})

describe('POST /api/payments/reconcile — authorisation', () => {
  it('refuses without the cron secret', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
  })

  it('fails closed when no secret is configured', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer anything')).status).toBe(401)
  })
})

describe('POST /api/payments/reconcile — settling', () => {
  it('marks a genuinely paid checkout success and confirms the booking', async () => {
    verifyTransaction.mockResolvedValue({ status: 'success', amount: 500000, channel: 'card', paid_at: '2026-10-28T09:00:00Z' })
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ settled: 1 })

    const row = payUpdates()[0].row
    expect(row.status).toBe('success')
    expect(row.webhook_event).toBe('reconcile.cron')
    expect(notifyPatient).toHaveBeenCalled()
  })

  it('writes off an abandoned checkout with Paystack as the reason', async () => {
    verifyTransaction.mockResolvedValue({ status: 'abandoned', amount: 0 })
    const res = await call('Bearer s3cret')
    expect(await res.json()).toMatchObject({ failed: 1 })
    expect(payUpdates()[0].row).toMatchObject({ status: 'failed', failure_reason: 'paystack: abandoned' })
  })

  it('leaves a still-processing payment alone', async () => {
    verifyTransaction.mockResolvedValue({ status: 'ongoing', amount: 0 })
    const res = await call('Bearer s3cret')
    expect(await res.json()).toMatchObject({ stillOpen: 1, settled: 0, failed: 0 })
    expect(payUpdates()).toEqual([])
  })

  it('never accepts a success whose amount disagrees with the booking', async () => {
    // Paying ₦100 for a ₦5,000 consultation must not confirm it.
    verifyTransaction.mockResolvedValue({ status: 'success', amount: 10000, channel: 'card' })
    const res = await call('Bearer s3cret')
    expect(await res.json()).toMatchObject({ failed: 1, settled: 0 })
    expect(String(payUpdates()[0].row.failure_reason)).toContain('amount mismatch')
    expect(notifyPatient).not.toHaveBeenCalled()
  })

  it('one unreachable reference does not stop the batch', async () => {
    verifyTransaction.mockRejectedValue(new Error('paystack down'))
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ errored: 1 })
  })
})
