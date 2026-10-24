import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { resolveAppointmentFee } from '@/lib/fees'
import { notifyPatient } from '@/lib/notify-patient'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() { return corsOptions() }

/**
 * POST /api/wallet/pay { appointmentId }
 * Pays a booking from the caller's wallet. Amount comes from the database, the debit
 * is atomic and can't overdraw (wallet_apply), and a unique index stops a second
 * wallet payment for the same appointment.
 */
export async function POST(req: NextRequest) {
  const res = await handle(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handle(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()
  const { appointmentId } = await req.json().catch(() => ({})) as { appointmentId?: string }
  if (!appointmentId) return Errors.validation('appointmentId is required')

  const db = createAdminClient()
  const { data: caller } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!caller) return Errors.notFound('User')

  const resolved = await resolveAppointmentFee(db, appointmentId)
  if (!resolved) return Errors.notFound('Appointment')
  if (resolved.patientId && resolved.patientId !== caller.id) {
    const { data: link } = await db.from('dependent_links').select('id')
      .eq('caretaker_id', caller.id).eq('dependent_id', resolved.patientId).eq('status', 'active').maybeSingle()
    if (!link) return Errors.forbidden('This booking belongs to another patient')
  }

  const { data: appt } = await db.from('appointments').select('status, booking_ref').eq('id', appointmentId).single()
  if (!appt) return Errors.notFound('Appointment')
  if (['cancelled', 'completed', 'no_show'].includes((appt as any).status)) return Errors.validation(`Cannot pay for a ${(appt as any).status} appointment`)

  // limit(1), not maybeSingle(): with two success rows maybeSingle errors and returns null.
  const { data: paid } = await db.from('payments').select('id').eq('appointment_id', appointmentId).eq('status', 'success').limit(1)
  if (paid?.length) return NextResponse.json({ alreadyPaid: true })

  const { fee } = resolved
  const { error: debitErr } = await (db as any).rpc('wallet_apply', {
    p_user: caller.id, p_amount_kobo: -fee.totalKobo, p_type: 'payment', p_ref: null,
    p_appointment: appointmentId, p_description: `Booking ${(appt as any).booking_ref ?? ''}`.trim(),
  })
  if (debitErr) {
    if (/insufficient_funds/.test(debitErr.message)) return NextResponse.json({ error: 'Not enough in your wallet', code: 'INSUFFICIENT_FUNDS' }, { status: 402 })
    if (/duplicate key|wallet_tx_one_payment_per_appt/.test(debitErr.message)) return NextResponse.json({ alreadyPaid: true })
    return Errors.internal(debitErr.message)
  }

  const now = new Date().toISOString()
  const { error: payErr } = await db.from('payments').insert({
    appointment_id: appointmentId, patient_id: caller.id, hospital_id: resolved.hospitalId,
    amount: fee.total, platform_fee: fee.platformFee, hospital_payout: fee.hospitalPayout, currency: 'NGN',
    status: 'success', method: 'wallet', paid_at: now, verified_at: now,
    metadata: { booking_ref: (appt as any).booking_ref, source: 'wallet' },
  } as never)
  if (payErr) {
    // Put the money back rather than leave a debit with no payment record.
    await (db as any).rpc('wallet_apply', { p_user: caller.id, p_amount_kobo: fee.totalKobo, p_type: 'refund', p_appointment: appointmentId, p_description: 'Reversed: payment could not be recorded' })
    return Errors.internal(payErr.message)
  }

  await db.from('appointments').update({ status: 'confirmed', updated_at: now } as never).eq('id', appointmentId).in('status', ['pending'])
  await notifyPatient(db, appointmentId, 'confirmed', 'Payment received', 'Paid from your Queue wallet. Your booking is confirmed.')
  return NextResponse.json({ success: true, amount: fee.total })
}
