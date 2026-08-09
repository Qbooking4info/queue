import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'
import { fmtLocalDate } from '@/lib/dashboard-utils'
import { notifyPatient } from '@/lib/notify-patient'
import { randomBytes } from 'crypto'

// POST /api/appointments/refer -- a doctor refers a patient they're seeing, at a specific
// appointment of theirs, to a different hospital (or a specific doctor there) for further
// care -- or to a different clinic at their own hospital. Doctors only: this is not a
// general booking-on-behalf-of-a-patient endpoint like /api/appointments/walkin, which is
// scoped to front desk creating bookings at their OWN hospital. A referral's whole point is
// (usually) crossing hospitals, so unlike every other appointment-creation path there's no
// caller.hospitalId === target check here (though a same-hospital referral to a
// colleague/clinic is allowed too).
export async function POST(req: NextRequest) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.doctorId || !caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  try {
    const body = await req.json()
    const {
      appointmentId, receivingHospitalId, receivingDoctorId, receivingClinicId,
      date, startTime, type, reason, referralReason, urgency, paymentMethod,
    } = body

    if (!appointmentId || !receivingHospitalId || !date || !startTime || !referralReason?.trim()) {
      return Errors.validation('appointmentId, receivingHospitalId, date, startTime and referralReason are required')
    }

    // The referral is always made *from* a specific appointment of the caller's -- this
    // both proves the doctor-patient relationship (no arbitrary "refer anyone" path) and,
    // for a walk-in with no linked account (patient_id null -- the common case, since most
    // patients here are registered by front desk rather than self-booked), is the only
    // source of who's actually being referred: their name/phone live on this row, not a
    // users row. Also doubles as the "original consultation" lookup for the auto-complete
    // behaviour below -- referring is commonly done mid-consult, and completing the
    // referral then also completes it, so the doctor doesn't need two separate taps.
    const { data: source } = await db
      .from('appointments')
      .select('id, patient_id, walkin_patient_name, walkin_patient_phone, type, status, doctor_id, assigned_doctor_id')
      .eq('id', appointmentId)
      .eq('hospital_id', caller.hospitalId)
      .single()
    if (!source) return Errors.notFound('Appointment')
    if ((source as any).doctor_id !== caller.doctorId && (source as any).assigned_doctor_id !== caller.doctorId) {
      return Errors.forbidden('You can only refer a patient you have an appointment with')
    }

    const patientId          = (source as any).patient_id as string | null
    const walkinPatientName  = patientId ? null : ((source as any).walkin_patient_name ?? null)
    const walkinPatientPhone = patientId ? null : ((source as any).walkin_patient_phone ?? null)
    if (!patientId && !walkinPatientName) {
      return Errors.validation('This appointment has no identifiable patient to refer')
    }

    const { data: receivingHospital } = await db
      .from('hospitals')
      .select('id, name, approval_mode')
      .eq('id', receivingHospitalId)
      .single()
    if (!receivingHospital) return Errors.notFound('Receiving hospital')

    if (receivingDoctorId) {
      const { data: doc } = await db.from('doctors').select('hospital_id, clinic_id, is_active').eq('id', receivingDoctorId).single()
      if (!doc || (doc as any).hospital_id !== receivingHospitalId) {
        return Errors.validation('Doctor does not belong to the receiving hospital')
      }
      if (!(doc as any).is_active) return Errors.validation('Receiving doctor is not active')
    }

    if (receivingClinicId) {
      const { data: cl } = await db.from('hospital_clinics').select('hospital_id').eq('id', receivingClinicId).single()
      if (!cl || (cl as any).hospital_id !== receivingHospitalId) {
        return Errors.validation('Clinic does not belong to the receiving hospital')
      }
    }

    // Referring doctor's own info, denormalised onto the new row so the receiving
    // side can display "Referred by Dr. X, [Clinic], [Hospital]" without needing a
    // join through a doctor who might later be deactivated, switch hospitals, or
    // move clinics.
    const { data: referringDoctor } = await db.from('doctors').select('full_name, clinic_id').eq('id', caller.doctorId).single()

    const allowed = await checkRateLimit(db, `refer:${caller.doctorId}`, 20, 3600)
    if (!allowed) return Errors.forbidden('Too many referrals. Please try again later.')

    // ── Plan: receiving hospital's subscription status + monthly booking cap ──
    // Mirrors /api/appointments/walkin -- a referral counts against the
    // receiving hospital's plan like any other incoming booking.
    const { data: sub } = await db
      .from('hospital_subscriptions')
      .select('status, subscription_plans(max_monthly_bookings)')
      .eq('hospital_id', receivingHospitalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as { data: { status: string; subscription_plans: { max_monthly_bookings: number | null } | null } | null; error: unknown }

    if (sub?.status === 'suspended' || sub?.status === 'cancelled') {
      return NextResponse.json(
        { error: `Receiving hospital's subscription is ${sub.status}.` },
        { status: 403 },
      )
    }

    const maxMonthly: number | null =
      (sub?.status === 'active' || sub?.status === 'trialing')
        ? ((sub?.subscription_plans as any)?.max_monthly_bookings ?? null)
        : null

    if (maxMonthly !== null) {
      const now = new Date()
      const monthStartDate = fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
      const nextMonthDate = fmtLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1))
      const { count } = await db.from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('hospital_id', receivingHospitalId)
        .gte('appointment_date', monthStartDate)
        .lt('appointment_date', nextMonthDate)
        .neq('status', 'cancelled')
      if ((count ?? 0) >= maxMonthly) return Errors.planLimitMonthly(maxMonthly)
    }

    const approvalStatus = receivingHospital.approval_mode === 'manual' ? 'pending_approval' : 'auto_approved'
    const status = approvalStatus === 'auto_approved' ? 'confirmed' : 'pending'
    const bookingRef = `REF-${randomBytes(4).toString('hex').toUpperCase()}`

    const { data, error } = await db
      .from('appointments')
      .insert({
        hospital_id:            receivingHospitalId,
        patient_id:              patientId,
        walkin_patient_name:     walkinPatientName,
        walkin_patient_phone:    walkinPatientPhone,
        doctor_id:               receivingDoctorId ?? null,
        clinic_id:               receivingClinicId ?? null,
        appointment_date:        date,
        start_time:              startTime,
        type:                    type === 'virtual' ? 'virtual' : 'in-person',
        reason:                  reason?.trim() || null,
        urgency:                 urgency ?? 'routine',
        status,
        approval_status:         approvalStatus,
        booking_mode:            'referral',
        booking_ref:             bookingRef,
        refund_pct:              100,
        payment_method:          paymentMethod ?? 'card',
        referred_by_doctor_id:   caller.doctorId,
        referring_hospital_id:   caller.hospitalId,
        referring_clinic_id:     (referringDoctor as any)?.clinic_id ?? null,
        referral_reason:         referralReason.trim(),
      } as any)
      .select('id, booking_ref')
      .single()

    if (error) return Errors.internal(error.message)

    if (status === 'confirmed') {
      await notifyPatient(
        db, data.id, 'confirmed', 'Referral Booked',
        `Dr. ${(referringDoctor as any)?.full_name ?? 'your doctor'} referred you to ${receivingHospital.name} (${bookingRef}). ` +
        `Check your appointments for details.`,
      )
    }

    // Close out the consultation this referral was made from, if it's still in progress.
    // Best-effort at this point: the referral itself already succeeded and is the primary
    // outcome, so a failure here (e.g. someone else already completed it in the meantime)
    // is reported back but doesn't roll back or fail the request.
    let originalCompleted = false
    if ((source as any).status === 'in_progress') {
      const { data: closed } = await db.from('appointments').update({
        status: 'completed', consult_ended_at: new Date().toISOString(),
      }).eq('id', (source as any).id).eq('status', 'in_progress').select('id')
      originalCompleted = !!closed?.length
      if (originalCompleted && (source as any).type === 'virtual') {
        await db.from('virtual_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('appointment_id', (source as any).id).eq('status', 'active')
      }
    }

    return NextResponse.json({
      id: data.id,
      bookingRef: data.booking_ref,
      approvalStatus,
      originalCompleted,
    })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}
