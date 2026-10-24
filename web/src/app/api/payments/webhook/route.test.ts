import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/paystack', () => ({
  paystackConfigured: () => true,
  verifyWebhookSignature: () => true,
  verifyTransaction: vi.fn(() => Promise.resolve({ status: 'success', amount: 500000, channel: 'card', paid_at: '2026-10-13T10:00:00Z' })),
}))
vi.mock('@/lib/wallet', () => ({ isWalletRef: () => false, settleWalletTopup: vi.fn() }))
const notifyPatient = vi.fn((..._args: unknown[]) => Promise.resolve())
vi.mock('@/lib/notify-patient', () => ({ notifyPatient: (...a: unknown[]) => notifyPatient(...a) }))

type Upd = { table: string; row: Record<string, unknown> }
const PAYMENT = { id: 'pay-2', appointment_id: 'appt-1', amount: 5000, status: 'pending', patient_id: 'U_PAYER' }

function mockDb(opts: {
  otherSuccess?: boolean
  updateError?: { code: string; message: string } | null
  rpcError?: { message: string } | null
}) {
  const updates: Upd[] = []
  const rpc = vi.fn(() => Promise.resolve({ error: opts.rpcError ?? null }))
  return {
    updates, rpc,
    from: vi.fn((table: string) => {
      let mode: 'select' | 'update' = 'select'
      let row: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      const chain = () => b
      Object.assign(b, { eq: chain, neq: chain, in: chain })
      b.select = vi.fn(() => b)
      b.update = vi.fn((r: Record<string, unknown>) => { mode = 'update'; row = r; return b })
      b.maybeSingle = vi.fn(() => Promise.resolve({ data: { ...PAYMENT } }))
      b.limit = vi.fn(() => Promise.resolve({ data: opts.otherSuccess ? [{ id: 'pay-1' }] : [] }))
      b.then = (ok: (v: unknown) => unknown) => {
        if (mode === 'update') {
          updates.push({ table, row })
          if (table === 'payments' && row.status === 'success' && opts.updateError) {
            return Promise.resolve({ data: null, error: opts.updateError }).then(ok)
          }
          return Promise.resolve({ data: [{ id: 'x' }], error: null }).then(ok)
        }
        return Promise.resolve({ data: [], error: null }).then(ok)
      }
      return b
    }),
  }
}
const dbMock = { current: mockDb({}) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { POST } = await import('./route')
const hook = () => new NextRequest('http://localhost/api/payments/webhook', {
  method: 'POST',
  headers: { 'x-paystack-signature': 'sig' },
  body: JSON.stringify({ event: 'charge.success', data: { reference: 'QUE-ref-2', amount: 500000 } }),
})

describe('POST /api/payments/webhook — one payment per booking', () => {
  beforeEach(() => notifyPatient.mockClear())

  it('confirms the booking on a normal first payment', async () => {
    dbMock.current = mockDb({})
    const res = await POST(hook())
    expect(res.status).toBe(200)
    expect(dbMock.current.updates.find(u => u.table === 'payments')?.row.status).toBe('success')
    expect(dbMock.current.updates.find(u => u.table === 'appointments')?.row.status).toBe('confirmed')
    expect(dbMock.current.rpc).not.toHaveBeenCalled()
  })

  it('credits a second charge for an already-paid booking to the wallet', async () => {
    dbMock.current = mockDb({ otherSuccess: true })
    const res = await POST(hook())
    expect(await res.json()).toMatchObject({ duplicate: true, credited: true })
    expect(dbMock.current.rpc).toHaveBeenCalledWith('wallet_apply', expect.objectContaining({
      p_user: 'U_PAYER', p_amount_kobo: 500000, p_type: 'refund', p_ref: 'QUE-ref-2', p_appointment: 'appt-1',
    }))
    const pay = dbMock.current.updates.filter(u => u.table === 'payments')
    expect(pay.map(u => u.row.status)).toEqual(['refunded'])
    expect(dbMock.current.updates.some(u => u.table === 'appointments')).toBe(false)
    expect(notifyPatient).toHaveBeenCalledWith(expect.anything(), 'appt-1', 'payment_refunded', expect.any(String), expect.any(String))
  })

  it('a retried webhook whose credit already landed still finishes the refund (no double credit)', async () => {
    dbMock.current = mockDb({ otherSuccess: true, rpcError: { message: 'duplicate key value violates unique constraint "wallet_transactions_paystack_ref_key"' } })
    const res = await POST(hook())
    expect(res.status).toBe(200)
    expect(dbMock.current.updates.filter(u => u.table === 'payments').map(u => u.row.status)).toEqual(['refunded'])
  })

  it('returns 500 (so Paystack retries) and leaves the payment pending when the credit fails', async () => {
    dbMock.current = mockDb({ otherSuccess: true, rpcError: { message: 'connection reset' } })
    const res = await POST(hook())
    expect(res.status).toBe(500)
    expect(dbMock.current.updates).toEqual([])
  })

  it('takes the credit path when the unique index rejects a raced second success', async () => {
    dbMock.current = mockDb({ updateError: { code: '23505', message: 'duplicate key one_success_payment_per_appointment' } })
    const res = await POST(hook())
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(dbMock.current.rpc).toHaveBeenCalledTimes(1)
    expect(dbMock.current.updates.some(u => u.table === 'appointments')).toBe(false)
  })
})
