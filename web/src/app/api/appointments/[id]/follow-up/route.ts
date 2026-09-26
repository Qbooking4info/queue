import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { notifyPatient } from '@/lib/notify-patient'
import { fmtLocalDate } from '@/lib/dashboard-utils'
import { randomBytes } from 'crypto'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function OPTIONS() {
  return corsOptions()
}

// POST /api/appointments/[id]/follow-up   { date: 'YYYY-MM-DD' }
//
// The doctor books the patient's next visit at the same hospital/clinic --
// "book for follow-up" from the consult screen, date only. Doctor-only (the
// treating doctor on the source appointment); a hospital-linked doctor's own
// patient, same doctor, same clinic. If the doctor already has a real
// available slot open that day it's reserved properly (same reserve/release
// triggers as any other booking); otherwise this still creates the
// appointment with no slot_id and a placeholder time, exactly like a staff
// free-form reschedule does -- the doctor is picking a day for their own
// patient, not hunting for an open slot themselves.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handlePOST(req, await ctx.params)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest, { id }: { id: string }) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth

  const body = await req.json().catch(() => null) as { date?: string } | null
  if (!body?.date || !DATE_RE.test(body.date)) return Errors.validation('A valid date is required')
  if (body.date < fmtLocalDate(new Date())) return Errors.validation('Follow-up date must be today or later')

  const db = createAdminClient()

  const { data: appt } = await db.from('appointments')
    .select('id, hospital_id, clinic_id, patient_id, doctor_id, assigned_doctor_id')
    .eq('id', id).single()
  if (!appt) return Errors.notFound('Appointment')

  if (caller.doctorId !== appt.doctor_id && caller.doctorId !== appt.assigned_doctor_id) {
    return Errors.forbidden('Only the doctor on this appointment can book a follow-up for this patient')
  }
  if (!appt.hospital_id) return Errors.validation('Follow-up booking is only available for hospital-linked visits')

  const doctorId = appt.assigned_doctor_id ?? appt.doctor_id
  if (!doctorId) return Errors.internal('No doctor on record for this appointment')

  // Same plan-cap check as walk-in booking (web/src/app/api/appointments/walkin/route.ts)
  // -- a doctor auto-booking a follow-up shouldn't silently bypass the
  // hospital's monthly quota.
  const { data: sub } = await db
    .from('hospital_subscriptions')
    .select('status, subscription_plans(max_monthly_bookings)')
    .eq('hospital_id', appt.hospital_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single() as { data: { status: string; subscription_plans: { max_monthly_bookings: number | null } | null } | null }

  if (sub?.status === 'suspended' || sub?.status === 'cancelled') {
    return NextResponse.json({ error: `Hospital subscription is ${sub.status}. Contact support to restore access.` }, { status: 403 })
  }

  const maxMonthly: number | null =
    (sub?.status === 'active' || sub?.status === 'trialing')
      ? ((sub?.subscription_plans as any)?.max_monthly_bookings ?? null)
      : null

  if (maxMonthly !== null) {
    const [y, m] = body.date.split('-').map(Number)
    const monthStartDate = fmtLocalDate(new Date(y, m - 1, 1))
    const nextMonthDate  = fmtLocalDate(new Date(y, m, 1))
    const { count } = await db.from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', appt.hospital_id)
      .gte('appointment_date', monthStartDate)
      .lt('appointment_date', nextMonthDate)
      .neq('status', 'cancelled')
    if ((count ?? 0) >= maxMonthly) return Errors.planLimitMonthly(maxMonthly)
  }

  // Take the earliest open in-person slot that day for this doctor, if one
  // exists -- reserved through the ordinary insert (trg_reserve_appointment_slot
  // fires the same as any other booking). No slot available (or none
  // generated for this doctor that far out) still books the day, just
  // without a specific slot reservation.
  const { data: slot } = await db.from('time_slots')
    .select('id, start_time')
    .eq('doctor_id', doctorId)
    .eq('slot_date', body.date)
    .eq('is_available', true)
    .eq('is_virtual', false)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  const bookingRef = `FUP-${randomBytes(4).toString('hex').toUpperCase()}`

  const { data: created, error } = await db.from('appointments').insert({
    hospital_id:      appt.hospital_id,
    clinic_id:        appt.clinic_id ?? null,
    patient_id:       appt.patient_id,
    doctor_id:        doctorId,
    slot_id:          slot?.id ?? null,
    appointment_date: body.date,
    start_time:       slot?.start_time ?? '09:00:00',
    type:             'in-person',
    reason:           'Follow-up consultation',
    urgency:          'routine',
    status:           'confirmed',
    approval_status:  'auto_approved',
    booking_mode:     'staff_follow_up',
    booking_ref:      bookingRef,
    refund_pct:       100,
    follow_up_of_appointment_id: appt.id,
  } as any).select('id, booking_ref, appointment_date, start_time').single()

  if (error) return Errors.internal(error.message)

  await notifyPatient(
    db, created.id, 'follow_up_booked', 'Follow-up appointment booked',
    `Your doctor booked your follow-up visit for ${created.appointment_date}.`,
  )

  return NextResponse.json({
    id: created.id, bookingRef: created.booking_ref,
    date: created.appointment_date, startTime: created.start_time,
  })
}
