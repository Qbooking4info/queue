import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { paystackConfigured, verifyTransaction } from '@/lib/paystack'
import { notifyPatient } from '@/lib/notify-patient'

/**
 * POST /api/payments/verify   { reference }
 *
 * The reconciliation path for a payment the webhook did not close out.
 *
 * The webhook is authoritative, but it is not guaranteed to arrive promptly: a
 * patient who pays and immediately returns to the app would otherwise sit on
 * "pending" with a confirmed charge on their card. This lets the client ask,
 * once, whether a specific reference actually succeeded.
 *
 * It deliberately does NOT trust the caller's claim of success. The client
 * supplies only a reference; the outcome comes from Paystack, and the amount is
 * re-checked against what was recorded at initialisation — exactly as the
 * webhook does. The two paths converge on the same guarded update, so whichever
 * arrives second is a no-op rather than a double-confirm.
 */
export async function POST(req: NextRequest) {
  if (!paystackConfigured()) {
    return NextResponse.json({ error: 'Online payment is not enabled', code: 'PAYMENTS_DISABLED' }, { status: 503 })
  }

  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const { reference } = await req.json().catch(() => ({})) as { reference?: string }
  if (!reference) return Errors.validation('reference is required')

  const db = createAdminClient()

  const { data: caller } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!caller) return Errors.notFound('User')

  const { data: payment } = await db
    .from('payments')
    .select('id, appointment_id, amount, status, patient_id')
    .eq('paystack_ref', reference)
    .maybeSingle()

  if (!payment) return Errors.notFound('Payment')
  // A reference is guessable enough that ownership must be checked; otherwise
  // this leaks whether an arbitrary transaction succeeded.
  if (payment.patient_id !== caller.id) return Errors.forbidden()

  if (payment.status === 'success') {
    return NextResponse.json({ status: 'success', alreadyRecorded: true })
  }

  let v
  try {
    v = await verifyTransaction(reference)
  } catch (err) {
    console.error('[payments] verify failed', reference, err)
    return Errors.internal('Could not verify the payment')
  }

  if (v.status !== 'success') {
    // Not marked failed here — an abandoned checkout can still be completed, and
    // writing 'failed' would block the webhook from confirming it later.
    return NextResponse.json({ status: v.status })
  }

  const expectedKobo = Math.round(Number(payment.amount) * 100)
  if (v.amount !== expectedKobo) {
    console.error('[payments] AMOUNT MISMATCH on verify', reference, { expectedKobo, got: v.amount })
    await db.from('payments')
      .update({ status: 'failed', failure_reason: `amount mismatch: expected ${expectedKobo} kobo, got ${v.amount}` } as never)
      .eq('id', payment.id)
    return NextResponse.json({ status: 'failed', reason: 'amount_mismatch' }, { status: 400 })
  }

  const { data: updated } = await db
    .from('payments')
    .update({
      status: 'success',
      paid_at: v.paid_at ?? new Date().toISOString(),
      verified_at: new Date().toISOString(),
      method: v.channel ?? 'paystack',
      webhook_event: 'verify.manual',
    } as never)
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')

  // Lost the race with the webhook — which is a success, not an error.
  if (!updated?.length) return NextResponse.json({ status: 'success', alreadyRecorded: true })

  if (payment.appointment_id) {
    await db.from('appointments')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() } as never)
      .eq('id', payment.appointment_id)
      .in('status', ['pending'])

    await notifyPatient(
      db, payment.appointment_id, 'confirmed',
      'Payment received',
      'Your payment has been received and your booking is confirmed.',
    )
  }

  return NextResponse.json({ status: 'success' })
}
