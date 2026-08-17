import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, verifyTransaction, paystackConfigured } from '@/lib/paystack'
import { notifyPatient } from '@/lib/notify-patient'

/**
 * POST /api/payments/webhook — Paystack charge notifications.
 *
 * This is the only thing in the system that believes a payment happened. A
 * client returning from checkout claiming success proves nothing; anyone can
 * call that endpoint with any reference.
 *
 * Three invariants, each guarding a specific way this goes wrong:
 *
 *  1. SIGNATURE. HMAC SHA512 of the raw body against the secret key. Without it
 *     this URL is a public API for marking any appointment paid.
 *
 *  2. AMOUNT RE-CHECK. The webhook's amount is compared against what we recorded
 *     when initialising. A mismatch is never accepted — it means the charge was
 *     tampered with or attributed to the wrong booking.
 *
 *  3. IDEMPOTENCY. Paystack delivers at-least-once and retries. Processing twice
 *     would double-count revenue and re-notify the patient, so a payment already
 *     marked success short-circuits.
 */

export const dynamic = 'force-dynamic'

/**
 * Paystack only ever POSTs here, so a GET has no business meaning. Next.js
 * answers an unhandled method with a bare 405 and no body, which renders as a
 * blank page — indistinguishable from a broken deployment when someone pastes
 * the URL into a browser to check it exists. This says what the endpoint is
 * instead. It exposes nothing: no secrets, no data, and it does not process
 * anything.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: 'paystack-webhook',
    ok: true,
    message: 'This is a webhook endpoint. Paystack POSTs signed events here; there is nothing to view in a browser.',
    expects: 'POST with an x-paystack-signature header',
    configured: paystackConfigured(),
  })
}

export async function POST(req: NextRequest) {
  if (!paystackConfigured()) return NextResponse.json({ ignored: true }, { status: 200 })

  // Raw body — re-serialising parsed JSON changes the bytes and the HMAC never
  // matches.
  const raw = await req.text()
  const signature = req.headers.get('x-paystack-signature')

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn('[payments] webhook rejected: bad signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { event?: string; data?: { reference?: string; amount?: number; status?: string; channel?: string; paid_at?: string } }
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const reference = event.data?.reference
  if (!reference) return NextResponse.json({ ignored: 'no reference' })

  // Anything other than a successful charge is recorded, not acted on.
  if (event.event !== 'charge.success') {
    return NextResponse.json({ ignored: event.event ?? 'unknown' })
  }

  const db = createAdminClient()

  const { data: payment } = await db
    .from('payments')
    .select('id, appointment_id, amount, status, patient_id')
    .eq('paystack_ref', reference)
    .maybeSingle()

  if (!payment) {
    // A reference we never issued. Logged loudly — either a spoofed call that
    // somehow passed signature checking, or an initialise that failed to record.
    console.error('[payments] webhook for unknown reference', reference)
    return NextResponse.json({ ignored: 'unknown reference' })
  }

  if (payment.status === 'success') {
    return NextResponse.json({ idempotent: true })   // retry, already handled
  }

  // Independently confirm with Paystack rather than trusting the payload alone.
  let confirmedKobo: number
  let channel: string | null = null
  let paidAt: string | null = null
  try {
    const v = await verifyTransaction(reference)
    if (v.status !== 'success') {
      await db.from('payments')
        .update({ status: 'failed', failure_reason: `verify returned ${v.status}`, webhook_event: event.event } as never)
        .eq('id', payment.id)
      return NextResponse.json({ ignored: `verify: ${v.status}` })
    }
    confirmedKobo = v.amount
    channel = v.channel
    paidAt = v.paid_at
  } catch (err) {
    console.error('[payments] verify failed', reference, err)
    return NextResponse.json({ error: 'verify failed' }, { status: 500 })
  }

  // Amount must match what we asked for. Under-payment must never confirm a
  // booking.
  const expectedKobo = Math.round(Number(payment.amount) * 100)
  if (confirmedKobo !== expectedKobo) {
    console.error('[payments] AMOUNT MISMATCH', reference, { expectedKobo, confirmedKobo })
    await db.from('payments')
      .update({
        status: 'failed',
        failure_reason: `amount mismatch: expected ${expectedKobo} kobo, got ${confirmedKobo}`,
        webhook_event: event.event,
      } as never)
      .eq('id', payment.id)
    return NextResponse.json({ error: 'amount mismatch' }, { status: 400 })
  }

  // Guarded on the current status so two concurrent deliveries cannot both win.
  const { data: updated } = await db
    .from('payments')
    .update({
      status: 'success',
      paid_at: paidAt ?? new Date().toISOString(),
      verified_at: new Date().toISOString(),
      method: channel,
      webhook_event: event.event,
    } as never)
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')

  if (!updated?.length) return NextResponse.json({ idempotent: true })

  // Payment confirms the booking — but only from a state where that is valid.
  if (payment.appointment_id) {
    await db.from('appointments')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() } as never)
      .eq('id', payment.appointment_id)
      .in('status', ['pending'])

    await notifyPatient(
      db,
      payment.appointment_id,
      'confirmed',
      'Payment received',
      'Your payment has been received and your booking is confirmed.',
    )
  }

  return NextResponse.json({ received: true })
}
