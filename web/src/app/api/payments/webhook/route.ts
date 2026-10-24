import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, verifyTransaction, paystackConfigured } from '@/lib/paystack'
import { notifyPatient } from '@/lib/notify-patient'
import { isWalletRef, settleWalletTopup } from '@/lib/wallet'

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

  // Wallet top-ups (WAL- references) settle into the patient's wallet instead.
  if (isWalletRef(reference)) {
    try {
      const result = await settleWalletTopup(db, reference)
      if (result === 'mismatch') console.error('[wallet] AMOUNT MISMATCH', reference)
      return NextResponse.json({ wallet: result })
    } catch (err) {
      console.error('[wallet] settle failed', reference, err)
      return NextResponse.json({ error: 'wallet settle failed' }, { status: 500 })
    }
  }

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

  const settled = { paid_at: paidAt ?? new Date().toISOString(), verified_at: new Date().toISOString(), method: channel, webhook_event: event.event }

  // A booking is paid once. If another payment already settled it (the wallet, or a
  // second checkout left open), this charge is still real money: credit it to the
  // payer's wallet and record it as refunded rather than confirming the booking twice.
  if (payment.appointment_id) {
    const { data: other } = await db.from('payments')
      .select('id')
      .eq('appointment_id', payment.appointment_id)
      .eq('status', 'success')
      .neq('id', payment.id)
      .limit(1)
    if (other?.length) return creditDuplicate(db, payment, reference, confirmedKobo, settled)
  }

  // Guarded on the current status so two concurrent deliveries cannot both win.
  const { data: updated, error: updateErr } = await db
    .from('payments')
    .update({ status: 'success', ...settled } as never)
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')

  // one_success_payment_per_appointment (20261013300002): another charge for the same
  // booking won the race between the check above and this update.
  if (updateErr?.code === '23505') return creditDuplicate(db, payment, reference, confirmedKobo, settled)
  if (updateErr) {
    console.error('[payments] could not record success', reference, updateErr.message)
    return NextResponse.json({ error: 'record failed' }, { status: 500 })
  }
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

type Db = ReturnType<typeof createAdminClient>

// Credit first, then mark the payment refunded. The wallet credit is keyed on the
// Paystack reference (wallet_transactions.paystack_ref is unique), so a retried
// webhook can never credit twice, and a crash between the two steps is finished
// by the retry instead of leaving a refunded payment with no credit.
async function creditDuplicate(
  db: Db,
  payment: { id: string; appointment_id: string | null; patient_id: string | null },
  reference: string,
  amountKobo: number,
  settled: Record<string, unknown>,
) {
  if (!payment.patient_id) {
    console.error('[payments] DUPLICATE CHARGE with no payer to credit', reference)
    return NextResponse.json({ error: 'duplicate charge needs manual refund' }, { status: 500 })
  }
  const { error: creditErr } = await (db as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
    .rpc('wallet_apply', {
      p_user: payment.patient_id,
      p_amount_kobo: amountKobo,
      p_type: 'refund',
      p_ref: reference,
      p_appointment: payment.appointment_id,
      p_description: 'Booking was already paid: this payment was credited to your wallet',
    })
  if (creditErr && !/duplicate key|wallet_transactions_paystack_ref/.test(creditErr.message)) {
    console.error('[payments] DUPLICATE CHARGE could not be credited', reference, creditErr.message)
    return NextResponse.json({ error: 'credit failed' }, { status: 500 })   // Paystack retries
  }

  const { data: marked } = await db.from('payments')
    .update({
      status: 'refunded',
      refund_reason: 'duplicate payment for an already-paid booking; credited to wallet',
      refunded_at: new Date().toISOString(),
      ...settled,
    } as never)
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')

  if (marked?.length && payment.appointment_id) {
    await notifyPatient(db, payment.appointment_id, 'payment_refunded', 'Payment credited to your wallet',
      'This booking was already paid, so your second payment has been added to your Queue wallet.')
  }
  return NextResponse.json({ duplicate: true, credited: true })
}
