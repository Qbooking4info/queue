import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'
import { fmtLocalDate } from '@/lib/dashboard-utils'
import { checkInAppointment } from '@/lib/appointment-checkin'
import { randomBytes } from 'crypto'

// Only auto-links (or surfaces via lookup) a patient who has an existing
// relationship with this hospital -- otherwise the walk-in is recorded
// against the free-text name and phone, and staff can link it properly once
// the patient confirms identity in person. Prevents front desk at any
// hospital from using patient_number/phone as a platform-wide probe to
// confirm whether a given person is registered on Queue at all.
async function findLinkablePatient(
  db: ReturnType<typeof createAdminClient>,
  hospitalId: string,
  column: 'patient_number' | 'phone',
  value: string,
): Promise<{ id: string; full_name: string; phone: string; patient_number: string; email: string } | null> {
  const { data: user } = await (db.from('users') as any)
    .select('id, full_name, phone, patient_number, email')
    .eq(column, value)
    .limit(1)
    .single()
  if (!user) return null

  const { count } = await db
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('patient_id', user.id)
    .eq('hospital_id', hospitalId)

  return (count ?? 0) > 0 ? user : null
}

// GET — look up a registered patient by patient_number or phone, scoped to
// patients who have previously booked with the caller's own hospital.
// super_admin excluded: patient contact details are PHI and super_admin
// has no operational need to query individual patients.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()
  const { searchParams } = new URL(req.url)
  const patientNumber = searchParams.get('patientNumber')?.trim().toUpperCase()
  const phone         = searchParams.get('phone')?.trim()

  if (!patientNumber && !phone) {
    return NextResponse.json({ error: 'patientNumber or phone required' }, { status: 400 })
  }

  if (!caller.hospitalId) return Errors.forbidden()

  const data = patientNumber
    ? await findLinkablePatient(db, caller.hospitalId, 'patient_number', patientNumber)
    : await findLinkablePatient(db, caller.hospitalId, 'phone', phone!)

  if (!data) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    patient: {
      id:             data.id,
      full_name:      data.full_name,
      phone:          data.phone,
      patient_number: data.patient_number,
      email:          data.email,
    },
  })
}

// POST — front desk creates a walk-in appointment.
// super_admin excluded: walk-in intake creates patient records (PHI).
export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()
  try {
    const body = await req.json()
    const {
      hospitalId, patientName, patientPhone, patientNumber,
      doctorId, clinicId, date, startTime, reason, staffId,
      // Urgency and type used to be dropped on the floor here and hardcoded
      // below, so a front desk marking someone an emergency was told it
      // worked and it never reached the row -- the patient then sat in the
      // ordinary queue. Both are read and validated now.
      urgency, type,
      // A walk-in is someone standing at the desk, so they are checked in by
      // default (which is what issues their queue number). Explicit false is
      // for registering someone who is expected later today.
      checkIn,
    } = body

    if (!hospitalId || !patientName || !date || !startTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const URGENCIES = ['routine', 'urgent', 'emergency']
    if (urgency != null && !URGENCIES.includes(urgency)) {
      return Errors.validation(`urgency must be one of ${URGENCIES.join(', ')}`)
    }
    if (type != null && type !== 'in-person' && type !== 'virtual') {
      return Errors.validation("type must be 'in-person' or 'virtual'")
    }

    if (caller.role !== 'super_admin' && caller.hospitalId !== hospitalId) {
      return Errors.forbidden('Cannot create appointments for another hospital')
    }

    if (doctorId) {
      const { data: doc } = await db.from('doctors').select('hospital_id, availability_status').eq('id', doctorId).single()
      if (!doc || (doc as any).hospital_id !== hospitalId) {
        return Errors.validation('Doctor does not belong to this hospital')
      }
      // A walk-in is a patient physically present right now -- unlike a
      // scheduled hospital booking picked for some future date, "is this
      // doctor on duty" is meaningful at the moment of this insert. is_active
      // is enforced independently for every insert path by the
      // enforce_doctor_assignable trigger (supabase/migrations); this is the
      // one additional, time-sensitive half only walk-ins need at write time.
      if ((doc as any).availability_status && (doc as any).availability_status !== 'on_duty') {
        return Errors.validation('Doctor is on break or off duty and cannot be assigned a walk-in')
      }
    }

    if (clinicId) {
      const { data: cl } = await db.from('hospital_clinics').select('hospital_id').eq('id', clinicId).single()
      if (!cl || (cl as any).hospital_id !== hospitalId) {
        return Errors.validation('Clinic does not belong to this hospital')
      }
    }

    if (caller.role === 'front_desk' && caller.clinicId && clinicId && clinicId !== caller.clinicId) {
      return Errors.forbidden('Front desk staff may only book into their own clinic')
    }

    const allowed = await checkRateLimit(db, `walkin:${hospitalId}`, 100, 3600)
    if (!allowed) return Errors.forbidden('Too many walk in registrations. Please try again later.')

    // ── Plan: subscription status + monthly booking cap ──────────────────────
    // BH3+BH4: fetch subscription (any status) and block suspended/cancelled
    const { data: sub } = await db
      .from('hospital_subscriptions')
      .select('status, subscription_plans(max_monthly_bookings)')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as { data: { status: string; subscription_plans: { max_monthly_bookings: number | null } | null } | null; error: unknown }

    // BH4: explicitly block suspended or cancelled subscriptions
    if (sub?.status === 'suspended' || sub?.status === 'cancelled') {
      return NextResponse.json(
        { error: `Hospital subscription is ${sub.status}. Contact support to restore access.` },
        { status: 403 },
      )
    }

    // BH3: enforce monthly cap for active and trialing subscriptions
    const maxMonthly: number | null =
      (sub?.status === 'active' || sub?.status === 'trialing')
        ? ((sub?.subscription_plans as any)?.max_monthly_bookings ?? null)
        : null

    if (maxMonthly !== null) {
      // BL4: count by appointment_date in the current month, not created_at.
      // fmtLocalDate, not toISOString(): the latter converts to UTC first, so in
      // WAT (UTC+1) the 1st at 00:00 local serializes as the *previous* month's
      // last day, quietly widening the window by a day.
      const now = new Date()
      const monthStartDate = fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
      // Upper bound too: without it, appointments booked into future months
      // counted against this month's cap.
      const nextMonthDate = fmtLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1))
      const { count } = await db.from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('hospital_id', hospitalId)
        .gte('appointment_date', monthStartDate)
        .lt('appointment_date', nextMonthDate)
        .neq('status', 'cancelled')
      if ((count ?? 0) >= maxMonthly) return Errors.planLimitMonthly(maxMonthly)
    }

    // Try to link to a registered patient who has previously booked with this
    // hospital — look up by patient_number first, then phone. A patient with
    // no prior relationship to this hospital is not linked; the walk-in is
    // recorded against the free-text name/phone instead.
    let patientUserId: string | null = null

    if (patientNumber?.trim()) {
      const match = await findLinkablePatient(db, hospitalId, 'patient_number', patientNumber.trim().toUpperCase())
      if (match) patientUserId = match.id
    }

    if (!patientUserId && patientPhone?.trim()) {
      const match = await findLinkablePatient(db, hospitalId, 'phone', patientPhone.trim())
      if (match) patientUserId = match.id
    }

    // BM7: use cryptographically random suffix — Date.now() modulo collides every ~16 minutes
    const bookingRef = `WLK-${randomBytes(4).toString('hex').toUpperCase()}`

    const { data, error } = await db
      .from('appointments')
      .insert({
        hospital_id:          hospitalId,
        patient_id:           patientUserId,
        doctor_id:            doctorId   ?? null,
        clinic_id:            clinicId   ?? null,
        appointment_date:     date,
        start_time:           startTime,
        type:                 type === 'virtual' ? 'virtual' : 'in-person',
        reason:               reason     ?? null,
        status:               'confirmed',
        booking_mode:         'walkin',
        approval_status:      'auto_approved',
        urgency:              urgency ?? 'routine',
        booking_ref:          bookingRef,
        booked_by_staff_id:   staffId    ?? null,
        walkin_patient_name:  patientName,
        walkin_patient_phone: patientPhone ?? null,
        refund_pct:           0,
      } as any)
      .select('id, booking_ref')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Check them in unless the desk said otherwise. This is what actually
    // issues the queue number: renumber_queue_after_change assigns
    // queue_position off checked_in_at the moment status flips to
    // 'checked_in'. Filing a walk-in as 'confirmed' and stopping there left a
    // patient who was physically present with no number and no place in the
    // queue, which the desk had no way to tell from a booking for later.
    //
    // Routed through checkInAppointment rather than a second update here, so
    // walk-ins pass the same approval guards as every other check-in.
    let checkedIn = false
    let checkInError: string | null = null
    if (checkIn !== false) {
      const result = await checkInAppointment(db, data.id)
      checkedIn = result.ok
      if (!result.ok) checkInError = result.error
    }

    // The number the desk reads out, once the trigger has assigned it.
    let queuePosition: number | null = null
    if (checkedIn) {
      const { data: row } = await db
        .from('appointments')
        .select('queue_position')
        .eq('id', data.id)
        .single()
      queuePosition = (row as { queue_position: number | null } | null)?.queue_position ?? null
    }

    return NextResponse.json({
      id:         data.id,
      bookingRef: data.booking_ref,
      linked:     !!patientUserId,
      checkedIn,
      checkInError,
      queuePosition,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
