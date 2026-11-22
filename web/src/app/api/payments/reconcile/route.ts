import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { paystackConfigured, verifyTransaction } from '@/lib/paystack'
import { notifyPatient } from '@/lib/notify-patient'

/**
 * GET|POST /api/payments/reconcile — settle checkouts the webhook never closed.
 *
 * A payment is created 'pending' at initialisation and moved to 'success' by
 * the Paystack webhook, or by /api/payments/verify if the patient returns to
 * the app first. When neither happens — the patient abandoned the page, or the
 * webhook was lost — the row stays 'pending' for ever. In production five did,
 * the oldest for seven weeks, and three of them belonged to appointments that
 * had since been completed: the patient was seen, and the books still said the
 * payment was in flight.
 *
 * Why this asks Paystack rather than running on a timer: an abandoned checkout
 * and a successful one whose webhook was dropped look identical from inside the
 * database. Ageing rows out to 'failed' would write off real money silently and
 * nobody would find out. Only Paystack knows which it was, so this asks about
 * each one and records the answer.
 *
 * Driven by the `reconcile-payments` pg_cron job through
 * `invoke_payment_reconcile()`, every 20 minutes, with the shared cron secret.
 * Safe to call at any frequency and concurrently: every write is guarded on
 * `status = 'pending'`, so whichever caller arrives second is a no-op.
 */

// Old enough that the webhook has plainly not arrived, young enough that a
// patient still on the Paystack page is left alone.
const MIN_AGE_MINUTES = 30
// One cron tick must finish well inside the function timeout; the rest are
// picked up on the next pass.
const BATCH = 25

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false   // fail closed
  const header = req.headers.get('authorization')
  if (!header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!paystackConfigured()) {
    return NextResponse.json({ skipped: 'payments not configured' })
  }

  const db = createAdminClient()
  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60_000).toISOString()

  const { data: stale, error } = await db
    .from('payments')
    .select('id, appointment_id, amount, patient_id, paystack_ref')
    .eq('status', 'pending')
    .not('paystack_ref', 'is', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let settled = 0, failed = 0, stillOpen = 0, errored = 0

  for (const p of (stale ?? []) as {
    id: string; appointment_id: string | null; amount: number
    patient_id: string | null; paystack_ref: string
  }[]) {
    try {
      const v = await verifyTransaction(p.paystack_ref)

      if (v.status === 'success') {
        const expectedKobo = Math.round(Number(p.amount) * 100)
        if (v.amount !== expectedKobo) {
          // Same treatment as the verify route: a mismatch is never silently
          // accepted as payment.
          console.error('[payments] AMOUNT MISMATCH on reconcile', p.paystack_ref, { expectedKobo, got: v.amount })
          await db.from('payments').update({
            status: 'failed',
            failure_reason: `amount mismatch: expected ${expectedKobo} kobo, got ${v.amount}`,
          } as never).eq('id', p.id).eq('status', 'pending')
          failed++
          continue
        }

        const { data: updated } = await db.from('payments').update({
          status: 'success',
          paid_at: v.paid_at ?? new Date().toISOString(),
          verified_at: new Date().toISOString(),
          method: v.channel,
          webhook_event: 'reconcile.cron',
        } as never).eq('id', p.id).eq('status', 'pending').select('id')

        if (!updated?.length) continue   // the webhook got there first

        settled++
        if (p.appointment_id) {
          await db.from('appointments')
            .update({ status: 'confirmed', updated_at: new Date().toISOString() } as never)
            .eq('id', p.appointment_id).in('status', ['pending'])
          await notifyPatient(
            db, p.appointment_id, 'confirmed', 'Payment received',
            'Your payment has been received and your booking is confirmed.',
          )
        }
        continue
      }

      // Paystack's own verdict. 'abandoned' and 'failed' are terminal there, so
      // recording them here is reporting what happened rather than guessing.
      if (v.status === 'abandoned' || v.status === 'failed' || v.status === 'reversed') {
        await db.from('payments').update({
          status: 'failed',
          failure_reason: `paystack: ${v.status}`,
        } as never).eq('id', p.id).eq('status', 'pending')
        failed++
        continue
      }

      // Anything else ('ongoing', 'queued', 'processing') is still live at
      // Paystack: leave it alone and look again next tick.
      stillOpen++
    } catch (err) {
      // One unreachable reference must not stop the batch.
      console.error('[payments] reconcile failed', p.paystack_ref, err)
      errored++
    }
  }

  return NextResponse.json({ checked: stale?.length ?? 0, settled, failed, stillOpen, errored })
}
