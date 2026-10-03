import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { safePatientName, calcAge, nameToColor, nameToInitials, todayLocalDate } from '@/lib/dashboard-utils'

interface VitalsRow {
  appointment_id: string
  weight_kg: number | null
  height_cm: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  blood_sugar: number | null
  bmi: number | null
  recorded_at: string
}

async function fetchVitalsBatch(db: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Map<string, VitalsRow>> {
  if (!ids.length) return new Map()
  const { data } = await db
    .from('vitals_audit_log')
    .select('appointment_id, weight_kg, height_cm, bp_systolic, bp_diastolic, blood_sugar, bmi, recorded_at')
    .in('appointment_id', ids)
    .order('recorded_at', { ascending: false })
  const map = new Map<string, VitalsRow>()
  for (const v of (data ?? []) as VitalsRow[]) {
    if (!map.has(v.appointment_id)) map.set(v.appointment_id, v)
  }
  return map
}

const FULL_SELECT = `
  id, booking_ref, appointment_date, start_time, status, type, reason,
  booking_mode, approval_status, urgency, symptom_description, approval_note,
  assigned_doctor_id, no_show_at, reschedule_deadline, clinic_id,
  refund_pct, walkin_patient_name, walkin_patient_phone,
  queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, check_in_date,
  referral_reason,
  patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
  doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name)),
  assigned_doctor:doctors!appointments_assigned_doctor_id_fkey(full_name),
  clinic:hospital_clinics!appointments_clinic_id_fkey(name),
  referred_by:doctors!appointments_referred_by_doctor_id_fkey(full_name, title),
  referring_hospital:hospitals!appointments_referring_hospital_id_fkey(name),
  referring_clinic:hospital_clinics!appointments_referring_clinic_id_fkey(name)
`

function mapRow(a: any, v: VitalsRow | undefined) {
  const isWalkin = a.booking_mode === 'walkin'
  return {
    id: a.id,
    booking_ref: a.booking_ref,
    appointment_date: a.appointment_date,
    start_time: (a.start_time ?? '').slice(0, 5),
    status: a.status,
    type: a.type,
    reason: a.reason,
    booking_mode: a.booking_mode ?? 'doctor',
    approval_status: a.approval_status ?? 'auto_approved',
    urgency: a.urgency ?? 'routine',
    symptom_description: a.symptom_description ?? null,
    approval_note: a.approval_note ?? null,
    assigned_doctor_id: a.assigned_doctor_id ?? null,
    assigned_doctor_name: a.assigned_doctor?.full_name ?? null,
    no_show_at: a.no_show_at ?? null,
    reschedule_deadline: a.reschedule_deadline ?? null,
    clinic_id: a.clinic_id ?? null,
    clinic_name: a.clinic?.name ?? null,
    refund_pct: a.refund_pct ?? 100,
    walkin_patient_name: a.walkin_patient_name ?? null,
    walkin_patient_phone: a.walkin_patient_phone ?? null,
    patient_id: isWalkin ? null : (a.patient?.id ?? null),
    vitals_weight_kg: v?.weight_kg ?? null,
    vitals_height_cm: v?.height_cm ?? null,
    vitals_bp_systolic: v?.bp_systolic ?? null,
    vitals_bp_diastolic: v?.bp_diastolic ?? null,
    vitals_blood_sugar: v?.blood_sugar ?? null,
    vitals_bmi: v?.bmi ?? null,
    vitals_recorded_at: v?.recorded_at ?? null,
    queue_position: a.queue_position ?? null,
    estimated_wait: a.estimated_wait ?? null,
    consult_started_at: a.consult_started_at ?? null,
    consult_ended_at: a.consult_ended_at ?? null,
    consult_duration_secs: a.consult_duration_secs ?? null,
    check_in_date: a.check_in_date ?? null,
    patient_name: isWalkin ? (a.walkin_patient_name ?? 'Walk-in Patient') : safePatientName(a.patient?.full_name, 'Unknown'),
    patient_age: isWalkin ? null : calcAge(a.patient?.date_of_birth ?? null),
    patient_gender: isWalkin ? null : (a.patient?.gender ?? null),
    doctor_name: a.doctor?.full_name ?? (a.assigned_doctor?.full_name ?? 'Unassigned'),
    doctor_id: a.doctor?.id ?? a.assigned_doctor_id ?? '',
    specialty_name: a.doctor?.specialty?.name ?? null,
    referral_reason: a.referral_reason ?? null,
    referred_by_doctor_name: a.referred_by ? [a.referred_by.title, a.referred_by.full_name].filter(Boolean).join(' ') : null,
    referring_hospital_name: a.referring_hospital?.name ?? null,
    referring_clinic_name: a.referring_clinic?.name ?? null,
  }
}

// GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
// Replaces admin-api.ts's getAppointments/getClinicAppointments/getDoctorAppointments
// (Task 15). Scope (whole hospital / one clinic / one doctor) is derived
// entirely from the server-verified caller -- from/to are the only
// client-supplied values, and they're just a date range, not an
// authorization boundary.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return Errors.validation('from and to are required')

  // Single-day queries (from === to, e.g. "today") are the live-queue case: a booking
  // dated for another day that physically checked in on that day belongs in it too --
  // same convention as get_doctor_queue and GET /api/appointments/queue. A genuine
  // multi-day range (analytics, browsing a month) stays scoped to appointment_date only,
  // so a check-in doesn't make a booking appear to move to a different day's totals.
  const dateFilter = from === to
    ? (q: any) => q.or(`appointment_date.eq.${from},check_in_date.eq.${from}`)
    : (q: any) => q.gte('appointment_date', from).lte('appointment_date', to)

  // ── Doctor: only their own appointments ────────────────────────────────────
  if (caller.role === 'doctor') {
    if (!caller.doctorId) return Errors.forbidden()
    const { data } = await dateFilter(db
      .from('appointments')
      .select(FULL_SELECT)
      .eq('doctor_id', caller.doctorId))
      .order('appointment_date', { ascending: false })
      .order('start_time')
    const rows = (data ?? []) as any[]
    const vitalsMap = await fetchVitalsBatch(db, rows.map(a => a.id))
    // doctorDayLoad stays empty here for response-shape consistency: a doctor sees only
    // their own appointments and never gets the assign-doctor picker that reads it.
    return NextResponse.json({ appointments: rows.map(a => mapRow(a, vitalsMap.get(a.id))), doctors: [], doctorDayLoad: {} })
  }

  if (!caller.hospitalId) return Errors.forbidden()

  // ── Clinic admin / front desk: scoped to their clinic ──────────────────────
  let query = dateFilter(db
    .from('appointments')
    .select(FULL_SELECT)
    .eq('hospital_id', caller.hospitalId))
    .order('appointment_date', { ascending: false })
    .order('start_time')

  let doctorsQuery = db
    .from('doctors')
    .select(`
      id, full_name, email, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience, clinic_id,
      availability_status,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('hospital_id', caller.hospitalId)
    .eq('is_active', true)

  if ((caller.role === 'clinic_admin' || caller.role === 'front_desk') && caller.clinicId) {
    const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', caller.clinicId)
    const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)
    const orFilter = doctorIds.length > 0
      ? `clinic_id.eq.${caller.clinicId},doctor_id.in.(${doctorIds.join(',')})`
      : `clinic_id.eq.${caller.clinicId}`
    query = query.or(orFilter)
    doctorsQuery = doctorsQuery.eq('clinic_id', caller.clinicId)
  }

  // Today's per-doctor load, for the assign-doctor picker ("seen 5 of 13 today").
  // Deliberately keyed to today and NOT to the caller's from/to range: the figure has
  // to mean the same thing whether the page is showing today, this week or a month, and
  // "how loaded is this doctor right now" is only ever a question about today. Same
  // single-day convention as the live queue -- a booking dated for another day that
  // physically checked in today belongs to today.
  const today = todayLocalDate()
  const dayLoadQuery = db
    .from('appointments')
    .select('doctor_id, assigned_doctor_id, status')
    .eq('hospital_id', caller.hospitalId)
    .or(`appointment_date.eq.${today},check_in_date.eq.${today}`)

  const [{ data, error }, { data: doctorRows }, { data: dayRows }] = await Promise.all([
    query,
    doctorsQuery.order('avg_rating', { ascending: false }),
    dayLoadQuery,
  ])
  if (error) return Errors.internal(error.message)

  // "Seen" counts in_progress as well as completed -- the patient currently in the room
  // has been seen, and excluding them would make the ratio read as one behind all day.
  // Out of the denominator: 'cancelled', which is also where a *rejected* booking lands
  // (the reject action writes status='cancelled' with approval_status='rejected', so
  // there is no status='rejected' to match on). Still IN the denominator: 'no_show' --
  // it was on the doctor's list for today, so it's part of how loaded they were, and
  // dropping it would silently flatter the ratio.
  const SEEN_STATUSES = ['completed', 'in_progress']
  const NEVER_ASSIGNED = ['cancelled']
  const visibleDoctorIds = new Set(((doctorRows ?? []) as any[]).map(d => d.id))
  const doctorDayLoad: Record<string, { completed: number; assigned: number }> = {}
  for (const r of (dayRows ?? []) as any[]) {
    // assign_doctor writes doctor_id and assigned_doctor_id to the same value, so
    // preferring doctor_id matches how every other route resolves the treating doctor.
    const docId: string | null = r.doctor_id ?? r.assigned_doctor_id
    // Scoped to the doctors this caller can already see, so a clinic-scoped front desk
    // doesn't get counts for another clinic's doctors along the way.
    if (!docId || !visibleDoctorIds.has(docId)) continue
    if (NEVER_ASSIGNED.includes(r.status)) continue
    const entry = (doctorDayLoad[docId] ??= { completed: 0, assigned: 0 })
    entry.assigned++
    if (SEEN_STATUSES.includes(r.status)) entry.completed++
  }

  const rows = (data ?? []) as any[]
  const vitalsMap = await fetchVitalsBatch(db, rows.map(a => a.id))

  return NextResponse.json({
    appointments: rows.map(a => mapRow(a, vitalsMap.get(a.id))),
    doctors: ((doctorRows ?? []) as any[]).map(d => ({
      id: d.id,
      full_name: d.full_name,
      email: d.email ?? null,
      title: d.title,
      specialty_name: d.specialty?.name ?? null,
      avg_rating: d.avg_rating,
      review_count: d.review_count,
      is_active: d.is_active,
      accepts_virtual: d.accepts_virtual,
      consultation_fee: d.consultation_fee,
      years_experience: d.years_experience,
      avatar: nameToInitials(d.full_name),
      color: nameToColor(d.full_name),
      clinic_id: d.clinic_id ?? null,
      availability_status: d.availability_status ?? 'on_duty',
    })),
    doctorDayLoad,
  })
}
