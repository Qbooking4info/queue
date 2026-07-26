import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { safePatientName, calcAge, nameToColor, nameToInitials } from '@/lib/dashboard-utils'

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
  const { data } = await (db as any)
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
  patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
  doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name)),
  assigned_doctor:doctors!appointments_assigned_doctor_id_fkey(full_name),
  clinic:hospital_clinics!appointments_clinic_id_fkey(name)
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
  }
}

// GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
// Replaces admin-api.ts's getAppointments/getClinicAppointments/getDoctorAppointments
// (Task 15). Scope (whole hospital / one clinic / one doctor) is derived
// entirely from the server-verified caller -- from/to are the only
// client-supplied values, and they're just a date range, not an
// authorization boundary.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return Errors.validation('from and to are required')

  // ── Doctor: only their own appointments ────────────────────────────────────
  if (caller.role === 'doctor') {
    if (!caller.doctorId) return Errors.forbidden()
    const { data } = await (db as any)
      .from('appointments')
      .select(FULL_SELECT)
      .eq('doctor_id', caller.doctorId)
      .gte('appointment_date', from)
      .lte('appointment_date', to)
      .order('appointment_date', { ascending: false })
      .order('start_time')
    const rows = (data ?? []) as any[]
    const vitalsMap = await fetchVitalsBatch(db, rows.map(a => a.id))
    return NextResponse.json({ appointments: rows.map(a => mapRow(a, vitalsMap.get(a.id))), doctors: [] })
  }

  if (!caller.hospitalId) return Errors.forbidden()

  // ── Clinic admin / front desk: scoped to their clinic ──────────────────────
  let query = (db as any)
    .from('appointments')
    .select(FULL_SELECT)
    .eq('hospital_id', caller.hospitalId)
    .gte('appointment_date', from)
    .lte('appointment_date', to)
    .order('appointment_date', { ascending: false })
    .order('start_time')

  let doctorsQuery = (db as any)
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

  const [{ data, error }, { data: doctorRows }] = await Promise.all([
    query,
    doctorsQuery.order('avg_rating', { ascending: false }),
  ])
  if (error) return Errors.internal(error.message)

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
  })
}
