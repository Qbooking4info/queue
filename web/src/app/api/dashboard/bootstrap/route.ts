import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { safePatientName, calcAge, fmtLocalDate, todayLocalDate, nameToColor, nameToInitials } from '@/lib/dashboard-utils'

// Consolidates the ~9 separate admin-api.ts calls AdminContext.tsx used to
// make directly against `adminDb` in the browser (getHospital,
// getHospitalStats, getClinicStats, getDoctors, getTodayAppointments,
// getDoctorTodayAppointments, getAllHospitals, getClinicDetail,
// getDoctorProfile) into one requireRole-gated route (Task 15). Everything
// is scoped by the server-verified caller identity -- nothing here trusts a
// client-supplied hospitalId/clinicId/doctorId the way the old direct calls
// implicitly did once adminDb was reachable from the browser.
//
// Exception: super_admin may pass ?hospitalId= to view a specific hospital's
// stats (the platform admin "switch hospital" view) -- trusted only for that
// role, since super_admin already has platform-wide access.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const { data: profile } = await db
    .from('users')
    .select('full_name')
    .eq('auth_id', caller.authId)
    .maybeSingle()
  const displayName = profile?.full_name ?? undefined

  const requestedHospitalId = new URL(req.url).searchParams.get('hospitalId')

  if (caller.role === 'super_admin' && !requestedHospitalId) {
    const { data: hospitals } = await db.from('hospitals').select('*').order('name')
    return NextResponse.json({
      role: caller.role,
      displayName,
      allHospitals: hospitals ?? [],
    })
  }

  const hospitalId = caller.role === 'super_admin' && requestedHospitalId ? requestedHospitalId : caller.hospitalId
  if (!hospitalId) return Errors.forbidden()

  if (caller.role === 'super_admin') {
    const { data: hospital } = await db.from('hospitals').select('*').eq('id', hospitalId).single()
    const [stats, doctors, todayAppointments] = await Promise.all([
      getHospitalStats(db, hospitalId),
      getDoctors(db, hospitalId),
      getTodayAppointments(db, hospitalId),
    ])
    return NextResponse.json({ role: caller.role, displayName, hospital, stats, doctors, todayAppointments })
  }

  if (!caller.hospitalId) return Errors.forbidden()

  const { data: hospital } = await db.from('hospitals').select('*').eq('id', caller.hospitalId).single()

  // ── Doctor: only their own today's appointments + profile ─────────────────
  if (caller.role === 'doctor' && caller.doctorId) {
    const appts = await getDoctorTodayAppointments(db, caller.doctorId)
    const { data: docProfile } = await (db.from('doctors') as any)
      .select('avg_rating, review_count, total_bookings, availability_status')
      .eq('id', caller.doctorId)
      .single()

    return NextResponse.json({
      role: caller.role,
      displayName,
      doctorId: caller.doctorId,
      hospital,
      todayAppointments: appts,
      doctorAvailability: docProfile?.availability_status ?? 'on_duty',
      stats: {
        todayTotal:     appts.length,
        todayCompleted: appts.filter((a: any) => a.status === 'completed').length,
        activeDoctors:  0,
        avgRating:      docProfile?.avg_rating ?? 0,
        reviewCount:    docProfile?.review_count ?? 0,
        totalBookings:  docProfile?.total_bookings ?? 0,
      },
    })
  }

  // ── Clinic admin / front desk: scoped to their clinic ──────────────────────
  if ((caller.role === 'clinic_admin' || caller.role === 'front_desk') && caller.clinicId) {
    const [stats, doctors, todayAppointments, clinic] = await Promise.all([
      getClinicStats(db, caller.hospitalId, caller.clinicId),
      getDoctors(db, caller.hospitalId, caller.clinicId),
      getTodayAppointments(db, caller.hospitalId, caller.clinicId),
      db.from('hospital_clinics').select('name').eq('id', caller.clinicId).single(),
    ])
    return NextResponse.json({
      role: caller.role,
      displayName,
      clinicId: caller.clinicId,
      clinicName: (clinic.data as any)?.name ?? null,
      hospital,
      stats,
      doctors,
      todayAppointments,
    })
  }

  // ── Hospital admin: full hospital data ─────────────────────────────────────
  const [stats, doctors, todayAppointments] = await Promise.all([
    getHospitalStats(db, caller.hospitalId),
    getDoctors(db, caller.hospitalId),
    getTodayAppointments(db, caller.hospitalId),
  ])
  return NextResponse.json({
    role: caller.role,
    displayName,
    hospital,
    stats,
    doctors,
    todayAppointments,
  })
}

// ── Helpers (copied verbatim from admin-api.ts's getDoctorTodayAppointments/
//    getTodayAppointments/getDoctors/getHospitalStats/getClinicStats, just
//    parameterised on `db` instead of closing over module-level `adminDb`) ──

async function getDoctorTodayAppointments(db: ReturnType<typeof createAdminClient>, doctorId: string) {
  const today = todayLocalDate()
  const select = `
      id, booking_ref, appointment_date, start_time, status, type, reason,
      queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, check_in_date,
      patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender)
    `
  const base = () => (db as any).from('appointments').select(select)
  const [byDoctorSched, byDoctorCheckedIn] = await Promise.all([
    base().eq('doctor_id', doctorId).eq('appointment_date', today),
    base().eq('doctor_id', doctorId).eq('check_in_date', today),
  ])
  const byId = new Map<string, any>()
  for (const res of [byDoctorSched, byDoctorCheckedIn]) {
    for (const row of (res.data ?? []) as any[]) byId.set(row.id, row)
  }
  return Array.from(byId.values())
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    .map(a => ({
      id: a.id, booking_ref: a.booking_ref,
      appointment_date: a.appointment_date,
      start_time: (a.start_time ?? '').slice(0, 5),
      status: a.status, type: a.type, reason: a.reason,
      queue_position: a.queue_position ?? null,
      estimated_wait: a.estimated_wait ?? null,
      consult_started_at: a.consult_started_at ?? null,
      consult_ended_at: a.consult_ended_at ?? null,
      consult_duration_secs: a.consult_duration_secs ?? null,
      check_in_date: a.check_in_date ?? null,
      patient_id: a.patient?.id ?? null,
      patient_name: safePatientName(a.patient?.full_name, 'Unknown'),
      patient_age: calcAge(a.patient?.date_of_birth ?? null),
      patient_gender: a.patient?.gender ?? null,
    }))
}

async function getTodayAppointments(db: ReturnType<typeof createAdminClient>, hospitalId: string, clinicId?: string) {
  const today = fmtLocalDate(new Date())
  let query = db
    .from('appointments')
    .select(`
      id, booking_ref, appointment_date, start_time, status, type, reason, clinic_id,
      patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
      doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name))
    `)
    .eq('hospital_id', hospitalId)
    .eq('appointment_date', today)

  if (clinicId) {
    const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', clinicId)
    const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)
    const orFilter = doctorIds.length > 0
      ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
      : `clinic_id.eq.${clinicId}`
    query = (query as any).or(orFilter)
  }

  const { data, error } = await (query as any).order('start_time')
  if (error || !data) return []

  return (data as any[]).map(a => ({
    id: a.id,
    booking_ref: a.booking_ref,
    appointment_date: a.appointment_date,
    start_time: (a.start_time ?? '').slice(0, 5),
    status: a.status,
    type: a.type,
    reason: a.reason,
    clinic_id: a.clinic_id ?? null,
    patient_id: a.patient?.id ?? null,
    patient_name: safePatientName(a.patient?.full_name, 'Unknown'),
    patient_age: calcAge(a.patient?.date_of_birth ?? null),
    patient_gender: a.patient?.gender ?? null,
    doctor_name: a.doctor?.full_name ?? 'Unknown',
    doctor_id: a.doctor?.id ?? '',
    specialty_name: a.doctor?.specialty?.name ?? null,
  }))
}

async function getDoctors(db: ReturnType<typeof createAdminClient>, hospitalId: string, clinicId?: string) {
  let q = (db as any)
    .from('doctors')
    .select(`
      id, full_name, email, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience, clinic_id,
      availability_status,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
  if (clinicId) q = q.eq('clinic_id', clinicId)
  const { data, error } = await q.order('avg_rating', { ascending: false })
  if (error || !data) return []

  return (data as any[]).map(d => ({
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
  }))
}

async function getHospitalStats(db: ReturnType<typeof createAdminClient>, hospitalId: string) {
  const today = fmtLocalDate(new Date())
  const [apptRes, completedRes, doctorRes, ratingRes] = await Promise.all([
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('appointment_date', today).neq('status', 'cancelled'),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('appointment_date', today).eq('status', 'completed'),
    db.from('doctors').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('is_active', true),
    db.from('hospitals').select('avg_rating, total_bookings, review_count')
      .eq('id', hospitalId).single(),
  ])
  return {
    todayTotal: apptRes.count ?? 0,
    todayCompleted: completedRes.count ?? 0,
    activeDoctors: doctorRes.count ?? 0,
    avgRating: (ratingRes.data as any)?.avg_rating ?? 4.8,
    totalBookings: (ratingRes.data as any)?.total_bookings ?? 0,
    reviewCount: (ratingRes.data as any)?.review_count ?? 0,
  }
}

async function getClinicStats(db: ReturnType<typeof createAdminClient>, hospitalId: string, clinicId: string) {
  const today = fmtLocalDate(new Date())
  const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', clinicId)
  const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)
  const orFilter = doctorIds.length > 0
    ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
    : `clinic_id.eq.${clinicId}`

  const base = () => db.from('appointments').select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId).eq('appointment_date', today).or(orFilter)

  const [apptRes, completedRes, doctorRes] = await Promise.all([
    base().neq('status', 'cancelled'),
    base().eq('status', 'completed'),
    db.from('doctors').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_active', true),
  ])

  return {
    todayTotal: apptRes.count ?? 0,
    todayCompleted: completedRes.count ?? 0,
    activeDoctors: doctorRes.count ?? 0,
    avgRating: 0,
    totalBookings: 0,
    reviewCount: 0,
  }
}
