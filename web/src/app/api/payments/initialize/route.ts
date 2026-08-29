import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { resolveAppointmentFee } from '@/lib/fees'
import { paystackConfigured, initializeTransaction, buildReference } from '@/lib/paystack'

/**
 * POST /api/payments/initialize   { appointmentId }
 *
 * Starts a Paystack transaction for an appointment and returns a checkout URL.
 *
 * The request body carries ONLY an appointment id. The amount is resolved from
 * the database — accepting an amount from the client would let a patient pay ₦1
 * for a ₦20,500 consultation, and the webhook would confirm it.
 */
export async function POST(req: NextRequest) {
  if (!paystackConfigured()) {
    // Explicit rather than a 500: payment is off until keys are configured, and
    // the app should show "pay at the hospital" rather than a broken button.
    return NextResponse.json(
      { error: 'Online payment is not enabled', code: 'PAYMENTS_DISABLED' },
      { status: 503 },
    )
  }

  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const { appointmentId } = await req.json().catch(() => ({})) as { appointmentId?: string }
  if (!appointmentId) return Errors.validation('appointmentId is required')

  const db = createAdminClient()

  const { data: caller } = await db.from('users').select('id, email').eq('auth_id', user.id).single()
  if (!caller) return Errors.notFound('User')

  // Paystack requires a deliverable email — it is the receipt destination and
  // the transaction's identity. Checked here so a missing or malformed address
  // gives a fixable message instead of a generic "could not start the payment"
  // from deep inside the provider call.
  const email = (caller.email ?? user.email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Errors.validation('A valid email address is required to pay. Add one to your profile and try again.')
  }

  const resolved = await resolveAppointmentFee(db, appointmentId)
  if (!resolved) return Errors.notFound('Appointment')

  // Only the patient on the booking, or their active caretaker, may pay for it --
  // a linked dependent's booking has the DEPENDENT'S OWN id as patient_id (see
  // 20260827000001_dependent_account_linking.sql), so "caretaker always pays"
  // needs this explicit check rather than relying on patient_id === caller.id.
  if (resolved.patientId && resolved.patientId !== caller.id) {
    const { data: link } = await db.from('dependent_links')
      .select('id')
      .eq('caretaker_id', caller.id)
      .eq('dependent_id', resolved.patientId)
      .eq('status', 'active')
      .maybeSingle()
    if (!link) return Errors.forbidden('This booking belongs to another patient')
  }

  const { data: appt } = await db
    .from('appointments').select('status, booking_ref').eq('id', appointmentId).single()
  if (!appt) return Errors.notFound('Appointment')
  if (['cancelled', 'completed', 'no_show'].includes(appt.status)) {
    return Errors.validation(`Cannot pay for a ${appt.status} appointment`)
  }

  // Don't start a second transaction for an appointment already paid.
  const { data: existing } = await db
    .from('payments')
    .select('id, status, paystack_ref')
    .eq('appointment_id', appointmentId)
    .in('status', ['success', 'pending'])
    .maybeSingle()

  if (existing?.status === 'success') {
    return NextResponse.json({ alreadyPaid: true })
  }

  const { data: hospital } = await db
    .from('hospitals')
    .select('paystack_subaccount_code')
    .eq('id', resolved.hospitalId)
    .single()

  const subaccount = (hospital as { paystack_subaccount_code: string | null } | null)?.paystack_subaccount_code ?? null
  if (!subaccount) {
    // Failing closed on purpose. Without a subaccount the hospital's share would
    // settle into Queue's balance, which turns a booking platform into a holder
    // of someone else's revenue. Better to keep this hospital on pay-at-desk.
    return NextResponse.json(
      { error: 'This hospital has not set up online payments yet', code: 'HOSPITAL_NOT_ONBOARDED' },
      { status: 503 },
    )
  }

  const reference = buildReference(appointmentId)
  const { fee } = resolved

  // Record the intent BEFORE calling Paystack. If initialize succeeds and we
  // crash before writing, the webhook arrives with a reference we've never seen
  // and cannot attribute.
  const { error: insertErr } = await db.from('payments').insert({
    appointment_id: appointmentId,
    patient_id: caller.id,
    hospital_id: resolved.hospitalId,
    amount: fee.total,
    platform_fee: fee.platformFee,
    hospital_payout: fee.hospitalPayout,
    currency: 'NGN',
    status: 'pending',
    paystack_ref: reference,
    // method is left NULL: the channel the patient actually uses is unknown
    // until the charge succeeds, and writing a placeholder conflates the
    // processor with the instrument.
    metadata: { booking_ref: appt.booking_ref },
  } as never)
  if (insertErr) return Errors.internal(insertErr.message)

  try {
    const result = await initializeTransaction({
      email,
      amountKobo: fee.totalKobo,
      reference,
      subaccount,
      platformFeeKobo: fee.platformFee * 100,
      callbackUrl: process.env.NEXT_PUBLIC_SITE_URL
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/payment/complete`
        : undefined,
      metadata: { appointment_id: appointmentId, booking_ref: appt.booking_ref },
    })

    await db.from('payments')
      .update({ paystack_access_code: result.access_code } as never)
      .eq('paystack_ref', reference)

    return NextResponse.json({
      authorizationUrl: result.authorization_url,
      reference: result.reference,
      amount: fee.total,
      breakdown: fee,
    })
  } catch (err) {
    await db.from('payments')
      .update({ status: 'failed', failure_reason: err instanceof Error ? err.message : String(err) } as never)
      .eq('paystack_ref', reference)
    // Paystack's messages are user-safe and specific ("Invalid Email Address
    // Passed", "Subaccount not found"). Swallowing them turned every failure
    // into an unactionable "could not start the payment".
    const reason = err instanceof Error ? err.message : 'Could not start the payment'
    console.error('[payments] initialize failed', reference, reason)
    return NextResponse.json({ error: reason, code: 'PAYSTACK_ERROR' }, { status: 502 })
  }
}
