import { adminDb } from './supabase/admin-client'

export interface AdminAppointment {
  id: string
  booking_ref: string
  appointment_date: string
  check_in_date?: string | null
  start_time: string
  status: string
  type: string
  reason: string | null
  patient_id: string | null
  patient_name: string
  patient_age: number | null
  patient_gender: string | null
  doctor_name: string
  doctor_id: string
  specialty_name: string | null
  booking_mode?: string
  approval_status?: string
  urgency?: string
  symptom_description?: string | null
  approval_note?: string | null
  assigned_doctor_id?: string | null
  assigned_doctor_name?: string | null
  no_show_at?: string | null
  reschedule_deadline?: string | null
  clinic_id?: string | null
  clinic_name?: string | null
  refund_pct?: number
  walkin_patient_name?: string | null
  walkin_patient_phone?: string | null
  vitals_weight_kg?: number | null
  vitals_height_cm?: number | null
  vitals_bp_systolic?: number | null
  vitals_bp_diastolic?: number | null
  vitals_blood_sugar?: number | null
  vitals_bmi?: number | null
  vitals_recorded_at?: string | null
  queue_position?: number | null
  estimated_wait?: number | null
  consult_started_at?: string | null
  consult_ended_at?: string | null
  consult_duration_secs?: number | null
}

export interface AppointmentVitals {
  weight_kg: number | null
  height_cm: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  blood_sugar: number | null
}

interface VitalsRow {
  appointment_id: string
  weight_kg: number | null
  height_cm: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  blood_sugar: number | null
  bmi: number | null
  recorded_at: string | null
}

// Batch-fetch latest vitals for a list of appointment IDs from vitals_audit_log.
// Returns a Map<appointment_id, vitals> so callers can merge without N+1 queries.
async function fetchVitalsBatch(ids: string[]): Promise<Map<string, VitalsRow>> {
  if (!ids.length) return new Map()
  const { data } = await (adminDb as any)
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

export interface AdminDoctor {
  id: string
  full_name: string
  email?: string | null
  title: string | null
  specialty_name: string | null
  avg_rating: number | null
  review_count: number | null
  is_active: boolean | null
  accepts_virtual: boolean | null
  consultation_fee: number | null
  years_experience: number | null
  avatar: string
  color: string
  clinic_id: string | null
  availability_status: DoctorAvailabilityStatus
}

export interface AdminHospital {
  id: string
  name: string
  slug: string
  type: string | null
  address: string
  city: string
  state: string
  phone: string | null
  email: string | null
  registration_number: string | null
  clinic_model: string | null
  is_verified: boolean | null
  accepts_virtual: boolean | null
  emergency_hours: boolean | null
  emr_system: string | null
  avg_rating: number | null
  total_bookings: number | null
  logo_url: string | null
}

const AVATAR_COLORS = [
  '#1A4A32', '#1A2A4A', '#3A1A4A', '#4A2A1A',
  '#2A1A4A', '#1A3A4A', '#4A1A2A', '#1A4A4A',
]

function nameToColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function nameToInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(-2).map(w => w[0].toUpperCase()).join('')
}

function calcAge(dob: string | null): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000)
}

export type UserRole = 'super_admin' | 'hospital_admin' | 'clinic_admin' | 'doctor' | 'front_desk'

export interface UserRoleInfo {
  role: UserRole
  hospitalId?: string   // undefined for super_admin
  clinicId?: string
  doctorId?: string
  displayName?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getUserRole(authId: string, authedClient?: any): Promise<UserRoleInfo | null> {
  // Use the caller's authenticated client when provided (satisfies RLS without service key).
  // Fall back to adminDb for server-side callers that already have the service role.
  const db = authedClient ?? adminDb

  // Try users table lookup
  const { data: profileRaw } = await (db as any)
    .from('users')
    .select('id, full_name')
    .eq('auth_id', authId)
    .single() as { data: { id: string; full_name: string | null } | null; error: unknown }
  const profile = profileRaw

  if (profile) {
    // Platform admin (replaces deprecated users.is_super_admin boolean)
    const { data: paRow } = await (db as any)
      .from('platform_admins')
      .select('id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()
    if (paRow) {
      return { role: 'super_admin', displayName: profile.full_name ?? undefined }
    }

    // Hospital admin
    const { data: adminRow } = await (db as any)
      .from('hospital_admins')
      .select('hospital_id')
      .eq('user_id', profile.id)
      .limit(1)
      .single()
    if (adminRow) return { role: 'hospital_admin', hospitalId: adminRow.hospital_id, displayName: profile.full_name ?? undefined }

    // Clinic staff (clinic_admin / front_desk share the clinic_admins table, differentiated by role column)
    const { data: clinicRow } = await (db as any)
      .from('clinic_admins')
      .select('hospital_id, clinic_id, role')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .limit(1)
      .single()
    if (clinicRow) {
      const r = ((clinicRow as any).role ?? 'clinic_admin') as string
      const isFrontDesk = r === 'front_desk' || r === 'desk_officer'
      return {
        role: isFrontDesk ? 'front_desk' : 'clinic_admin',
        hospitalId: clinicRow.hospital_id,
        clinicId: (clinicRow.clinic_id as string | undefined) ?? undefined,
        displayName: profile.full_name ?? undefined,
      }
    }
  }

  // Doctor (auth_user_id stored directly on doctors row)
  const { data: doctorRow } = await (db as any)
    .from('doctors')
    .select('id, hospital_id, full_name')
    .eq('auth_user_id', authId)
    .single()
  if (doctorRow) return { role: 'doctor', hospitalId: doctorRow.hospital_id, doctorId: doctorRow.id, displayName: doctorRow.full_name }

  // Fallback: clinic_admins with auth_user_id directly (no users row)
  const { data: caRow } = await (db as any)
    .from('clinic_admins')
    .select('hospital_id, clinic_id, role')
    .eq('auth_user_id', authId)
    .eq('is_active', true)
    .limit(1)
    .single()
  if (caRow) {
    const r = (caRow.role ?? 'clinic_admin') as string
    const isFrontDesk = r === 'front_desk' || r === 'desk_officer'
    return {
      role: isFrontDesk ? 'front_desk' : 'clinic_admin',
      hospitalId: caRow.hospital_id,
      clinicId: caRow.clinic_id ?? undefined,
    }
  }

  return null
}

export async function getHospitalIdForUser(authId: string): Promise<string | null> {
  const info = await getUserRole(authId)
  return info?.hospitalId ?? null
}

export interface ClinicWithAdmin {
  id: string
  name: string
  description: string | null
  is_active: boolean | null
  is_emergency: boolean
  sort_order: number | null
  created_at: string | null
  service_tags: string[]
  subAdmin: { id: string; full_name: string; email: string } | null
  doctorCount: number
}

export async function getClinicsForHospital(hospitalId: string): Promise<ClinicWithAdmin[]> {
  const { data: clinics } = await adminDb
    .from('hospital_clinics')
    .select('*')
    .eq('hospital_id', hospitalId)
    .order('sort_order')

  if (!clinics || clinics.length === 0) return []

  const clinicIds = clinics.map(c => c.id)

  const [{ data: adminRows }, { data: doctorRows }] = await Promise.all([
    adminDb
      .from('clinic_admins')
      .select('clinic_id, user_id, users(id, full_name, email)')
      .in('clinic_id', clinicIds)
      .eq('role', 'clinic_admin')
      .eq('is_active', true),
    adminDb
      .from('doctors')
      .select('clinic_id')
      .in('clinic_id', clinicIds)
      .eq('is_active', true),
  ])

  const doctorCounts: Record<string, number> = {}
  doctorRows?.forEach(d => {
    if (d.clinic_id) doctorCounts[d.clinic_id] = (doctorCounts[d.clinic_id] ?? 0) + 1
  })

  return clinics.map(clinic => {
    const row = adminRows?.find(a => a.clinic_id === clinic.id)
    const u = row?.users as { id: string; full_name: string; email: string } | null
    return {
      ...clinic,
      service_tags: (clinic as any).service_tags ?? [],
      is_emergency: (clinic as any).is_emergency ?? false,
      subAdmin: u ? { id: u.id, full_name: u.full_name, email: u.email } : null,
      doctorCount: doctorCounts[clinic.id] ?? 0,
    }
  }) as ClinicWithAdmin[]
}

export async function getFirstHospitalId(): Promise<string | null> {
  const { data } = await adminDb
    .from('hospitals')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single()
  return data?.id ?? null
}

export async function getAllHospitals(): Promise<AdminHospital[]> {
  const { data } = await adminDb
    .from('hospitals')
    .select('*')
    .order('name')
  return (data as AdminHospital[]) ?? []
}

// ── Patient chart (doctor-facing) ───────────────────────────────────────────────

export interface PatientProfile {
  id: string
  full_name: string
  date_of_birth: string | null
  gender: string | null
  blood_group: string | null
  phone: string | null
  email: string | null
  city: string | null
  state: string | null
}

export interface PatientMedicalHistory {
  conditions: string[]
  allergies: string[]
  medications: string | null
  surgeries: string | null
  family_history: string | null
  updated_at: string | null
}

export async function getPatientProfile(patientId: string): Promise<PatientProfile | null> {
  const { data } = await adminDb
    .from('users')
    .select('id, full_name, date_of_birth, gender, blood_group, phone, email, city, state')
    .eq('id', patientId)
    .single()
  return data as PatientProfile | null
}

export async function getPatientMedicalHistory(patientId: string): Promise<PatientMedicalHistory | null> {
  const { data } = await (adminDb as any)
    .from('patient_medical_history')
    .select('conditions, allergies, medications, surgeries, family_history, updated_at')
    .eq('patient_id', patientId)
    .maybeSingle()
  return data as PatientMedicalHistory | null
}

export async function getDoctorTodayAppointments(doctorId: string): Promise<AdminAppointment[]> {
  const today = todayLocalDate()
  const select = `
      id, booking_ref, appointment_date, start_time, status, type, reason,
      queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, check_in_date,
      patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender)
    `
  // "Today" for a doctor means scheduled for today OR physically checked in today (a future-dated
  // booking that walked in early joins today's queue) — matched on either doctor_id or
  // assigned_doctor_id (OPD bookings later assigned to this doctor).
  const base = () => (adminDb as any).from('appointments').select(select)
  const [byDoctorSched, byDoctorCheckedIn, byAssignedSched, byAssignedCheckedIn, doctorProfile] = await Promise.all([
    base().eq('doctor_id', doctorId).eq('appointment_date', today),
    base().eq('doctor_id', doctorId).eq('check_in_date', today),
    base().eq('assigned_doctor_id', doctorId).eq('appointment_date', today),
    base().eq('assigned_doctor_id', doctorId).eq('check_in_date', today),
    (adminDb as any).from('doctors').select('full_name, specialty:specialties!doctors_specialty_id_fkey(name)').eq('id', doctorId).single(),
  ])
  const byId = new Map<string, any>()
  for (const res of [byDoctorSched, byDoctorCheckedIn, byAssignedSched, byAssignedCheckedIn]) {
    for (const row of (res.data ?? []) as any[]) byId.set(row.id, row)
  }
  const data = Array.from(byId.values()).sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  if (data.length === 0) return []
  const docName = doctorProfile.data?.full_name ?? 'Unknown'
  const specName = doctorProfile.data?.specialty?.name ?? null
  return data.map(a => ({
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
    patient_name: a.patient?.full_name ?? 'Unknown',
    patient_age: calcAge(a.patient?.date_of_birth ?? null),
    patient_gender: a.patient?.gender ?? null,
    doctor_name: docName,
    doctor_id: doctorId,
    specialty_name: specName,
  }))
}

export async function getDoctorAppointments(doctorId: string, from: string, to: string): Promise<AdminAppointment[]> {
  const { data } = await adminDb
    .from('appointments')
    .select(`
      id, booking_ref, appointment_date, start_time, status, type, reason,
      approval_status, clinic_id,
      queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, check_in_date,
      patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
      doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name)),
      clinic:hospital_clinics!appointments_clinic_id_fkey(name)
    `)
    .eq('doctor_id', doctorId)
    .gte('appointment_date', from)
    .lte('appointment_date', to)
    .order('appointment_date', { ascending: false })
    .order('start_time')
  if (!data) return []
  const vitalsMap = await fetchVitalsBatch((data as any[]).map(a => a.id))
  return (data as any[]).map(a => {
    const v = vitalsMap.get(a.id)
    return {
      id: a.id, booking_ref: a.booking_ref,
      appointment_date: a.appointment_date,
      start_time: (a.start_time ?? '').slice(0, 5),
      status: a.status, type: a.type, reason: a.reason,
      approval_status: a.approval_status ?? null,
      clinic_id: a.clinic_id ?? null,
      clinic_name: a.clinic?.name ?? null,
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
      patient_id: a.patient?.id ?? null,
      patient_name: a.patient?.full_name ?? 'Unknown',
      patient_age: calcAge(a.patient?.date_of_birth ?? null),
      patient_gender: a.patient?.gender ?? null,
      doctor_name: a.doctor?.full_name ?? 'Unknown',
      doctor_id: a.doctor?.id ?? '',
      specialty_name: a.doctor?.specialty?.name ?? null,
    }
  })
}

export async function getClinicStats(hospitalId: string, clinicId: string) {
  const today = new Date().toISOString().split('T')[0]
  const { data: docs } = await adminDb.from('doctors').select('id').eq('clinic_id', clinicId)
  const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)
  const orFilter = doctorIds.length > 0
    ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
    : `clinic_id.eq.${clinicId}`

  const base = () => adminDb.from('appointments').select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId).eq('appointment_date', today).or(orFilter)

  const [apptRes, completedRes, doctorRes] = await Promise.all([
    base().neq('status', 'cancelled'),
    base().eq('status', 'completed'),
    adminDb.from('doctors').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_active', true),
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

export async function getHospital(hospitalId: string): Promise<AdminHospital | null> {
  const { data } = await adminDb
    .from('hospitals')
    .select('*')
    .eq('id', hospitalId)
    .single()
  return data as AdminHospital | null
}

export async function getAppointments(hospitalId: string, from: string, to: string): Promise<AdminAppointment[]> {
  const { data, error } = await adminDb
    .from('appointments')
    .select(`
      id, booking_ref, appointment_date, start_time, status, type, reason,
      booking_mode, approval_status, urgency, symptom_description, approval_note,
      assigned_doctor_id, no_show_at, reschedule_deadline, clinic_id,
      refund_pct, walkin_patient_name, walkin_patient_phone,
      queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, check_in_date,
      patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
      doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name)),
      assigned_doctor:doctors!appointments_assigned_doctor_id_fkey(full_name),
      clinic:hospital_clinics!appointments_clinic_id_fkey(name)
    `)
    .eq('hospital_id', hospitalId)
    .gte('appointment_date', from)
    .lte('appointment_date', to)
    .order('appointment_date', { ascending: false })
    .order('start_time')

  if (error || !data) return []

  const vitalsMap = await fetchVitalsBatch((data as any[]).map(a => a.id))

  return (data as any[]).map(a => {
    const isWalkin = a.booking_mode === 'walkin'
    const patientName = isWalkin
      ? (a.walkin_patient_name ?? 'Walk-in Patient')
      : (a.patient?.full_name ?? 'Unknown')
    const v = vitalsMap.get(a.id)
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
      patient_name: patientName,
      patient_age: isWalkin ? null : calcAge(a.patient?.date_of_birth ?? null),
      patient_gender: isWalkin ? null : (a.patient?.gender ?? null),
      doctor_name: a.doctor?.full_name ?? (a.assigned_doctor?.full_name ?? 'Unassigned'),
      doctor_id: a.doctor?.id ?? a.assigned_doctor_id ?? '',
      specialty_name: a.doctor?.specialty?.name ?? null,
    }
  })
}

export async function getRangeStats(hospitalId: string, from: string, to: string) {
  const [totalRes, completedRes, cancelledRes] = await Promise.all([
    adminDb.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to),
    adminDb.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'completed'),
    adminDb.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'cancelled'),
  ])
  const total     = totalRes.count ?? 0
  const completed = completedRes.count ?? 0
  const cancelled = cancelledRes.count ?? 0
  return { total, completed, cancelled, pending: total - completed - cancelled }
}

export async function getTodayAppointments(hospitalId: string, clinicId?: string): Promise<AdminAppointment[]> {
  const today = new Date().toISOString().split('T')[0]

  let query = adminDb
    .from('appointments')
    .select(`
      id, booking_ref, appointment_date, start_time, status, type, reason, clinic_id,
      patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
      doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name))
    `)
    .eq('hospital_id', hospitalId)
    .eq('appointment_date', today)

  if (clinicId) {
    const { data: docs } = await adminDb.from('doctors').select('id').eq('clinic_id', clinicId)
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
    patient_name: a.patient?.full_name ?? 'Unknown',
    patient_age: calcAge(a.patient?.date_of_birth ?? null),
    patient_gender: a.patient?.gender ?? null,
    doctor_name: a.doctor?.full_name ?? 'Unknown',
    doctor_id: a.doctor?.id ?? '',
    specialty_name: a.doctor?.specialty?.name ?? null,
  }))
}

export interface ScheduleSlot {
  id: string
  date: string
  time: string
  doc: string
  patient: string
  type: string
  status: string
}

// Local calendar date, not UTC — Date#toISOString() shifts to UTC first, which
// silently rolls back to the previous day in positive-offset timezones (e.g. WAT, UTC+1).
function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getWeekAppointments(
  hospitalId: string,
  weekStart?: string,
  opts?: { doctorId?: string; clinicId?: string },
): Promise<Record<string, ScheduleSlot[]>> {
  const anchor = weekStart ? new Date(weekStart + 'T00:00:00') : new Date()
  const day = anchor.getDay()
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  let q = adminDb
    .from('appointments')
    .select(`
      id, appointment_date, start_time, type, status,
      patient:users!appointments_patient_id_fkey(full_name),
      doctor:doctors!appointments_doctor_id_fkey(full_name)
    `)
    .eq('hospital_id', hospitalId)
    .gte('appointment_date', fmtLocalDate(monday))
    .lte('appointment_date', fmtLocalDate(sunday))
    .neq('status', 'cancelled')
    .order('start_time')
  if (opts?.doctorId) q = (q as any).eq('doctor_id', opts.doctorId)
  if (opts?.clinicId) q = (q as any).eq('clinic_id', opts.clinicId)
  const { data } = await q

  const schedule: Record<string, ScheduleSlot[]> = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    schedule[fmtLocalDate(d)] = []
  }

  if (!data) return schedule

  ;(data as any[]).forEach(a => {
    const bucket = schedule[a.appointment_date]
    if (!bucket) return
    bucket.push({
      id: a.id,
      date: a.appointment_date,
      time: (a.start_time ?? '').slice(0, 5),
      doc: a.doctor?.full_name ?? 'Doctor',
      patient: a.patient?.full_name ?? 'Patient',
      type: a.type,
      status: a.status,
    })
  })

  return schedule
}

export async function getDoctors(hospitalId: string, clinicId?: string): Promise<AdminDoctor[]> {
  let q = (adminDb as any)
    .from('doctors')
    .select(`
      id, full_name, email, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience, clinic_id,
      availability_status,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
  if (clinicId) q = (q as any).eq('clinic_id', clinicId)
  const { data, error } = await (q as any).order('avg_rating', { ascending: false })

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
    availability_status: ((d as any).availability_status ?? 'on_duty') as DoctorAvailabilityStatus,
  }))
}

export async function getDoctorApptCounts(hospitalId: string, date: string): Promise<Record<string, { total: number; completed: number }>> {
  const { data } = await adminDb
    .from('appointments')
    .select('doctor_id, status')
    .eq('hospital_id', hospitalId)
    .eq('appointment_date', date)
    .neq('status', 'cancelled')

  const counts: Record<string, { total: number; completed: number }> = {}
  if (!data) return counts

  ;(data as any[]).forEach(a => {
    if (!counts[a.doctor_id]) counts[a.doctor_id] = { total: 0, completed: 0 }
    counts[a.doctor_id].total++
    if (a.status === 'completed') counts[a.doctor_id].completed++
  })

  return counts
}

// ── Clinic-specific functions ─────────────────────────────────────────────────

export interface ClinicDetail {
  id: string
  name: string
  description: string | null
  is_active: boolean | null
  is_emergency: boolean
  hospital_id: string
  created_at: string | null
  sort_order: number | null
  service_tags: string[]
}

export interface ClinicStaffMember {
  id: string
  user_id: string
  full_name: string
  email: string
  role: string
  is_active: boolean | null
  created_at: string | null
}

export async function getClinicDetail(clinicId: string): Promise<ClinicDetail | null> {
  const { data } = await adminDb.from('hospital_clinics').select('*').eq('id', clinicId).single()
  if (!data) return null
  return { ...data, is_emergency: (data as any).is_emergency ?? false } as ClinicDetail
}

export async function getClinicStaff(clinicId: string): Promise<ClinicStaffMember[]> {
  const { data } = await adminDb
    .from('clinic_admins')
    .select('id, user_id, role, is_active, created_at, users(full_name, email)')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('created_at')
  if (!data) return []
  return (data as any[]).map(r => ({
    id: r.id,
    user_id: r.user_id,
    full_name: (r.users as any)?.full_name ?? 'Unknown',
    email: (r.users as any)?.email ?? '',
    role: r.role ?? 'clinic_admin',
    is_active: r.is_active,
    created_at: r.created_at,
  }))
}

export async function getClinicDoctors(clinicId: string): Promise<AdminDoctor[]> {
  const { data, error } = await (adminDb as any)
    .from('doctors')
    .select(`
      id, full_name, email, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience, clinic_id,
      availability_status,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('full_name')
  if (error || !data) return []
  return (data as any[]).map(d => ({
    id: d.id, full_name: d.full_name, email: d.email ?? null, title: d.title,
    specialty_name: d.specialty?.name ?? null,
    avg_rating: d.avg_rating, review_count: d.review_count,
    is_active: d.is_active, accepts_virtual: d.accepts_virtual,
    consultation_fee: d.consultation_fee, years_experience: d.years_experience,
    avatar: nameToInitials(d.full_name), color: nameToColor(d.full_name),
    clinic_id: d.clinic_id ?? null,
    availability_status: (d.availability_status ?? 'on_duty') as DoctorAvailabilityStatus,
  }))
}

export async function getUnassignedDoctors(hospitalId: string): Promise<AdminDoctor[]> {
  const { data, error } = await adminDb
    .from('doctors')
    .select(`
      id, full_name, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .is('clinic_id', null)
    .order('full_name')
  if (error || !data) return []
  return (data as any[]).map(d => ({
    id: d.id, full_name: d.full_name, title: d.title,
    specialty_name: d.specialty?.name ?? null,
    avg_rating: d.avg_rating, review_count: d.review_count,
    is_active: d.is_active, accepts_virtual: d.accepts_virtual,
    consultation_fee: d.consultation_fee, years_experience: d.years_experience,
    avatar: nameToInitials(d.full_name), color: nameToColor(d.full_name),
    clinic_id: null, availability_status: 'on_duty' as const,
  }))
}

export async function createDoctor(hospitalId: string, payload: {
  full_name:         string
  title?:            string
  specialty_id?:     string
  consultation_fee?: number
  virtual_fee?:      number
  years_experience?: number
  accepts_virtual:   boolean
  bio?:              string
  qualification?:    string
  mdcn_number?:      string
}): Promise<{ id: string } | { error: string }> {
  const { data, error } = await adminDb
    .from('doctors')
    .insert({ hospital_id: hospitalId, is_active: true, ...payload } as any)
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

export async function assignDoctorToClinic(doctorId: string, clinicId: string): Promise<void> {
  await adminDb.from('doctors').update({ clinic_id: clinicId }).eq('id', doctorId)
}

export async function removeDoctorFromClinic(doctorId: string): Promise<void> {
  await adminDb.from('doctors').update({ clinic_id: null }).eq('id', doctorId)
}

export async function getClinicAppointments(
  hospitalId: string, clinicId: string, from: string, to: string
): Promise<AdminAppointment[]> {
  // Query by clinic_id directly (covers OPD-mode bookings) OR by doctor assigned to the clinic
  const { data: docs } = await adminDb
    .from('doctors').select('id').eq('clinic_id', clinicId)
  const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)

  const baseQuery = adminDb
    .from('appointments')
    .select(`
      id, booking_ref, appointment_date, start_time, status, type, reason,
      booking_mode, approval_status, urgency, symptom_description, approval_note,
      assigned_doctor_id, clinic_id, refund_pct, walkin_patient_name, walkin_patient_phone,
      queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, check_in_date,
      patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
      doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name)),
      assigned_doctor:doctors!appointments_assigned_doctor_id_fkey(full_name),
      clinic:hospital_clinics!appointments_clinic_id_fkey(name)
    `)
    .eq('hospital_id', hospitalId)
    .gte('appointment_date', from)
    .lte('appointment_date', to)
    .order('appointment_date', { ascending: false })
    .order('start_time')

  // Match appointments routed to this clinic or assigned to a doctor in this clinic
  const orFilter = doctorIds.length > 0
    ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
    : `clinic_id.eq.${clinicId}`

  const { data, error } = await baseQuery.or(orFilter)
  if (error || !data) return []

  const vitalsMap = await fetchVitalsBatch((data as any[]).map(a => a.id))

  return (data as any[]).map(a => {
    const isWalkin = a.booking_mode === 'walkin'
    const patientName = isWalkin ? (a.walkin_patient_name ?? 'Walk-in') : (a.patient?.full_name ?? 'Unknown')
    const v = vitalsMap.get(a.id)
    return {
      id: a.id, booking_ref: a.booking_ref,
      appointment_date: a.appointment_date,
      start_time: (a.start_time ?? '').slice(0, 5),
      status: a.status, type: a.type, reason: a.reason,
      booking_mode: a.booking_mode ?? 'doctor',
      approval_status: a.approval_status ?? 'auto_approved',
      urgency: a.urgency ?? 'routine',
      symptom_description: a.symptom_description ?? null,
      approval_note: a.approval_note ?? null,
      assigned_doctor_id: a.assigned_doctor_id ?? null,
      assigned_doctor_name: a.assigned_doctor?.full_name ?? null,
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
      patient_name: patientName,
      patient_age: isWalkin ? null : calcAge(a.patient?.date_of_birth ?? null),
      patient_gender: isWalkin ? null : (a.patient?.gender ?? null),
      doctor_name: a.doctor?.full_name ?? (a.assigned_doctor?.full_name ?? 'Unassigned'),
      doctor_id: a.doctor?.id ?? a.assigned_doctor_id ?? '',
      specialty_name: a.doctor?.specialty?.name ?? null,
    }
  })
}

export async function getClinicRangeStats(
  hospitalId: string, clinicId: string, from: string, to: string
) {
  // Count both direct clinic bookings and doctor-routed bookings
  const { data: docs } = await adminDb
    .from('doctors').select('id').eq('clinic_id', clinicId)
  const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)
  const orFilter = doctorIds.length > 0
    ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
    : `clinic_id.eq.${clinicId}`

  const base = () => adminDb.from('appointments').select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId)
    .gte('appointment_date', from).lte('appointment_date', to)
    .or(orFilter)

  const [totalRes, completedRes, cancelledRes] = await Promise.all([
    base(),
    base().eq('status', 'completed'),
    base().eq('status', 'cancelled'),
  ])
  const total = totalRes.count ?? 0
  const completed = completedRes.count ?? 0
  const cancelled = cancelledRes.count ?? 0
  return { total, completed, cancelled, pending: total - completed - cancelled }
}

export async function createClinicDoctor(
  hospitalId: string, clinicId: string,
  doctor: { full_name: string; title: string; specialty_id: string | null; consultation_fee: number | null; accepts_virtual: boolean }
): Promise<{ id: string } | null> {
  const { data, error } = await adminDb.from('doctors').insert({
    hospital_id: hospitalId,
    clinic_id: clinicId,
    full_name: doctor.full_name,
    title: doctor.title || null,
    specialty_id: doctor.specialty_id || null,
    consultation_fee: doctor.consultation_fee || null,
    accepts_virtual: doctor.accepts_virtual,
    is_active: true,
  }).select('id').single()
  if (error) return null
  return data as { id: string }
}

export async function updateClinic(clinicId: string, updates: { name?: string; description?: string | null; is_active?: boolean; service_tags?: string[] }): Promise<{ error: { message: string } | null }> {
  const { error } = await adminDb.from('hospital_clinics').update(updates as any).eq('id', clinicId)
  return { error }
}

// A hospital has at most one Emergency Department clinic — setting a new one clears
// whichever clinic previously held the flag so the two updates can't both land "true".
export async function setEmergencyClinic(hospitalId: string, clinicId: string): Promise<{ error: string | null }> {
  const { error: clearErr } = await adminDb.from('hospital_clinics')
    .update({ is_emergency: false } as any).eq('hospital_id', hospitalId).eq('is_emergency', true)
  if (clearErr) return { error: clearErr.message }
  const { error } = await adminDb.from('hospital_clinics').update({ is_emergency: true } as any).eq('id', clinicId)
  return { error: error?.message ?? null }
}

export async function clearEmergencyClinic(clinicId: string): Promise<{ error: string | null }> {
  const { error } = await adminDb.from('hospital_clinics').update({ is_emergency: false } as any).eq('id', clinicId)
  return { error: error?.message ?? null }
}

export async function toggleClinicActive(clinicId: string, isActive: boolean): Promise<void> {
  await adminDb.from('hospital_clinics').update({ is_active: isActive }).eq('id', clinicId)
}

export async function deleteClinic(clinicId: string): Promise<{ error?: string }> {
  const { error } = await adminDb.from('hospital_clinics').delete().eq('id', clinicId)
  return { error: error?.message }
}

export async function updateAppointmentStatus(id: string, status: string) {
  await adminDb.from('appointments').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function updateAppointmentVitals(
  id: string,
  vitals: AppointmentVitals,
  recordedByAuthId?: string,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString()
  const bmi = vitals.weight_kg && vitals.height_cm && vitals.height_cm > 0
    ? Math.round((vitals.weight_kg / Math.pow(vitals.height_cm / 100, 2)) * 10) / 10
    : null

  // vitals_audit_log is the single source of truth; appointments no longer
  // stores denormalized vitals columns (dropped in migration 20260719000004).
  const { error } = await (adminDb as any).from('vitals_audit_log').insert({
    appointment_id:      id,
    recorded_by_auth_id: recordedByAuthId ?? null,
    recorded_at:         now,
    weight_kg:           vitals.weight_kg,
    height_cm:           vitals.height_cm,
    bp_systolic:         vitals.bp_systolic,
    bp_diastolic:        vitals.bp_diastolic,
    blood_sugar:         vitals.blood_sugar,
    bmi,
  })

  return { error: error?.message ?? null }
}

// ── Queue & consultation timing ─────────────────────────────────────────────────

export async function getDoctorAvgConsultDuration(doctorId: string): Promise<number | null> {
  const { data } = await (adminDb as any)
    .from('appointments')
    .select('consult_duration_secs')
    .eq('doctor_id', doctorId)
    .not('consult_duration_secs', 'is', null)
  if (!data || data.length === 0) return null
  const total = (data as { consult_duration_secs: number }[]).reduce((sum, r) => sum + r.consult_duration_secs, 0)
  return total / data.length
}

function todayLocalDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const QUEUE_SELECT = `
  id, booking_ref, appointment_date, start_time, status, type, reason,
  booking_mode, approval_status, urgency, symptom_description, approval_note,
  assigned_doctor_id, clinic_id, refund_pct, walkin_patient_name, walkin_patient_phone,
  queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, check_in_date,
  patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
  doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name)),
  assigned_doctor:doctors!appointments_assigned_doctor_id_fkey(full_name),
  clinic:hospital_clinics!appointments_clinic_id_fkey(name)
`

function mapQueueRow(a: any): AdminAppointment {
  const isWalkin = a.booking_mode === 'walkin'
  return {
    id: a.id, booking_ref: a.booking_ref,
    appointment_date: a.appointment_date,
    start_time: (a.start_time ?? '').slice(0, 5),
    status: a.status, type: a.type, reason: a.reason,
    booking_mode: a.booking_mode ?? 'doctor',
    approval_status: a.approval_status ?? 'auto_approved',
    urgency: a.urgency ?? 'routine',
    symptom_description: a.symptom_description ?? null,
    approval_note: a.approval_note ?? null,
    assigned_doctor_id: a.assigned_doctor_id ?? null,
    assigned_doctor_name: a.assigned_doctor?.full_name ?? null,
    clinic_id: a.clinic_id ?? null,
    clinic_name: a.clinic?.name ?? null,
    refund_pct: a.refund_pct ?? 100,
    walkin_patient_name: a.walkin_patient_name ?? null,
    walkin_patient_phone: a.walkin_patient_phone ?? null,
    queue_position: a.queue_position ?? null,
    estimated_wait: a.estimated_wait ?? null,
    consult_started_at: a.consult_started_at ?? null,
    consult_ended_at: a.consult_ended_at ?? null,
    consult_duration_secs: a.consult_duration_secs ?? null,
    check_in_date: a.check_in_date ?? null,
    patient_id: isWalkin ? null : (a.patient?.id ?? null),
    patient_name: isWalkin ? (a.walkin_patient_name ?? 'Walk-in') : (a.patient?.full_name ?? 'Unknown'),
    patient_age: isWalkin ? null : calcAge(a.patient?.date_of_birth ?? null),
    patient_gender: isWalkin ? null : (a.patient?.gender ?? null),
    doctor_name: a.doctor?.full_name ?? (a.assigned_doctor?.full_name ?? 'Unassigned'),
    doctor_id: a.doctor?.id ?? a.assigned_doctor_id ?? '',
    specialty_name: a.doctor?.specialty?.name ?? null,
  }
}

// Today's physical queue: appointments scheduled for today OR physically checked in today —
// a future-dated booking that walks in early joins today's queue rather than waiting for its
// original date.
export async function getQueueForToday(hospitalId: string, clinicId?: string): Promise<AdminAppointment[]> {
  const today = todayLocalDate()
  let doctorIds: string[] = []
  if (clinicId) {
    const { data: docs } = await adminDb.from('doctors').select('id').eq('clinic_id', clinicId)
    doctorIds = ((docs as any[]) ?? []).map((d: any) => d.id)
  }

  function scoped(query: any) {
    if (!clinicId) return query.eq('hospital_id', hospitalId)
    const orFilter = doctorIds.length > 0
      ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
      : `clinic_id.eq.${clinicId}`
    return query.eq('hospital_id', hospitalId).or(orFilter)
  }

  const [byAppointmentDate, byCheckIn] = await Promise.all([
    scoped((adminDb as any).from('appointments').select(QUEUE_SELECT)).eq('appointment_date', today),
    scoped((adminDb as any).from('appointments').select(QUEUE_SELECT)).eq('check_in_date', today),
  ])

  const byId = new Map<string, any>()
  for (const row of (byAppointmentDate.data ?? []) as any[]) byId.set(row.id, row)
  for (const row of (byCheckIn.data ?? []) as any[]) byId.set(row.id, row)

  return Array.from(byId.values())
    .map(mapQueueRow)
    .sort((a, b) => {
      // Emergency appointments always sort first; within a tier, whoever has an actual queue
      // position (checked in) sorts by it, then everyone else falls back to start time.
      const aEmergency = a.urgency === 'emergency' ? 0 : 1
      const bEmergency = b.urgency === 'emergency' ? 0 : 1
      if (aEmergency !== bEmergency) return aEmergency - bEmergency
      const aPos = a.queue_position ?? Infinity
      const bPos = b.queue_position ?? Infinity
      if (aPos !== bPos) return aPos - bPos
      return a.start_time.localeCompare(b.start_time)
    })
}

export async function checkInAppointment(id: string): Promise<{ error: string | null }> {
  const { data: appt, error: fetchErr } = await (adminDb as any)
    .from('appointments')
    .select('hospital_id, doctor_id, assigned_doctor_id, urgency')
    .eq('id', id)
    .single()
  if (fetchErr || !appt) return { error: fetchErr?.message ?? 'Appointment not found' }

  const checkInDate = todayLocalDate()
  const doctorId = appt.doctor_id ?? appt.assigned_doctor_id
  const isEmergency = appt.urgency === 'emergency'
  let queuePosition: number | null = null
  let estimatedWait: number | null = null

  // Queue scope is "checked in today," not the originally booked appointment_date — a
  // future-dated booking that walks in today joins today's physical queue, per doctor.
  if (doctorId) {
    const [byDoctor, byAssigned] = await Promise.all([
      (adminDb as any).from('appointments').select('id, queue_position')
        .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
        .in('status', ['checked_in', 'in_progress']).eq('doctor_id', doctorId).neq('id', id),
      (adminDb as any).from('appointments').select('id, queue_position')
        .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
        .in('status', ['checked_in', 'in_progress']).eq('assigned_doctor_id', doctorId).neq('id', id),
    ])
    // Doctor-specific bookings use doctor_id; OPD bookings later assigned use assigned_doctor_id —
    // a given appointment only ever matches one of the two, so the lists don't overlap.
    const others = [...(byDoctor.data ?? []), ...(byAssigned.data ?? [])] as { id: string; queue_position: number | null }[]
    const ahead = others.length

    if (isEmergency) {
      // Emergency jumps straight to the front — shift everyone already in this doctor's
      // queue today back by one instead of just appending to the end.
      queuePosition = 1
      estimatedWait = 0
      await Promise.all(others.map(o =>
        (adminDb as any).from('appointments')
          .update({ queue_position: (o.queue_position ?? ahead) + 1 })
          .eq('id', o.id)
      ))
    } else {
      queuePosition = ahead + 1
      const avgSecs = await getDoctorAvgConsultDuration(doctorId)
      if (avgSecs != null) estimatedWait = Math.round((ahead * avgSecs) / 60)
    }
  }

  const { error } = await (adminDb as any).from('appointments').update({
    status: 'checked_in',
    check_in_date: checkInDate,
    queue_position: queuePosition,
    estimated_wait: estimatedWait,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function startConsultation(id: string): Promise<{ error: string | null }> {
  const { data: appt, error: fetchErr } = await (adminDb as any)
    .from('appointments')
    .select('hospital_id, doctor_id, assigned_doctor_id')
    .eq('id', id)
    .single()
  if (fetchErr || !appt) return { error: fetchErr?.message ?? 'Appointment not found' }

  const doctorId = appt.doctor_id ?? appt.assigned_doctor_id
  const checkInDate = todayLocalDate()

  // Auto-end whatever this doctor was previously seeing, if it was never explicitly ended.
  // Scoped by check_in_date (today's physical queue), not appointment_date — a future-dated
  // booking that walked in today is in today's queue regardless of when it was booked for.
  // Two-step (find IDs, then update by ID) instead of a single filtered update — a doctor's
  // in-progress consult may be recorded under either doctor_id (direct booking) or
  // assigned_doctor_id (OPD booking later assigned), and querying both columns via .in()
  // per-column is unambiguous where chaining .or() with several other .eq() filters is not.
  if (doctorId) {
    const [byDoctor, byAssigned] = await Promise.all([
      (adminDb as any).from('appointments').select('id')
        .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
        .eq('status', 'in_progress').eq('doctor_id', doctorId).neq('id', id),
      (adminDb as any).from('appointments').select('id')
        .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
        .eq('status', 'in_progress').eq('assigned_doctor_id', doctorId).neq('id', id),
    ])
    const staleIds = Array.from(new Set([
      ...((byDoctor.data ?? []) as { id: string }[]).map(r => r.id),
      ...((byAssigned.data ?? []) as { id: string }[]).map(r => r.id),
    ]))
    if (staleIds.length > 0) {
      const { error: autoEndErr } = await (adminDb as any)
        .from('appointments')
        .update({ status: 'completed', consult_ended_at: new Date().toISOString() })
        .in('id', staleIds)
      if (autoEndErr) return { error: `Failed to auto-end previous consult: ${autoEndErr.message}` }
    }
  }

  const { error } = await (adminDb as any).from('appointments').update({
    status: 'in_progress',
    consult_started_at: new Date().toISOString(),
  }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function endConsultation(id: string): Promise<{ error: string | null }> {
  const { error } = await (adminDb as any).from('appointments').update({
    status: 'completed',
    consult_ended_at: new Date().toISOString(),
  }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function getHospitalSpecialties(hospitalId: string) {
  const { data } = await adminDb
    .from('doctors')
    .select('specialty:specialties!doctors_specialty_id_fkey(id, name, icon)')
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)

  if (!data) return []
  const seen = new Set<string>()
  return (data as any[])
    .filter(d => d.specialty?.id && !seen.has(d.specialty.id) && seen.add(d.specialty.id))
    .map(d => d.specialty)
}

// ── Specialties ───────────────────────────────────────────────────────────────

export interface SpecialtyRow { id: string; name: string; icon: string | null; slug: string }

export async function getAllSpecialties(): Promise<SpecialtyRow[]> {
  const { data } = await adminDb
    .from('specialties')
    .select('id, name, icon, slug')
    .order('name')
  return (data as SpecialtyRow[]) ?? []
}

export async function getRegisteredSpecialties(hospitalId: string): Promise<SpecialtyRow[]> {
  // Union: specialties linked via hospital_specialties OR via doctors
  const [hsRes, docRes] = await Promise.all([
    adminDb.from('hospital_specialties')
      .select('specialty:specialties!hospital_specialties_specialty_id_fkey(id, name, icon, slug)')
      .eq('hospital_id', hospitalId),
    adminDb.from('doctors')
      .select('specialty:specialties!doctors_specialty_id_fkey(id, name, icon, slug)')
      .eq('hospital_id', hospitalId).eq('is_active', true),
  ])
  const seen = new Set<string>()
  const combined = [
    ...((hsRes.data as any[]) ?? []),
    ...((docRes.data as any[]) ?? []),
  ]
  return combined
    .map(r => r.specialty)
    .filter(s => s?.id && !seen.has(s.id) && seen.add(s.id)) as SpecialtyRow[]
}

export async function addHospitalSpecialty(hospitalId: string, specialtyId: string): Promise<{ error?: string }> {
  const { error } = await adminDb
    .from('hospital_specialties')
    .insert({ hospital_id: hospitalId, specialty_id: specialtyId })
  return { error: error?.message }
}

export async function removeHospitalSpecialty(hospitalId: string, specialtyId: string): Promise<void> {
  await adminDb
    .from('hospital_specialties')
    .delete()
    .eq('hospital_id', hospitalId)
    .eq('specialty_id', specialtyId)
}

// ── Services ──────────────────────────────────────────────────────────────────

export interface HospitalService {
  id:           string
  name:         string
  description:  string | null
  specialty_id: string | null
  specialty_name: string | null
  base_price:   number | null
  virtual_price: number | null
  duration_mins: number | null
  is_active:    boolean
  clinic_id:    string | null
}

export async function getHospitalServices(hospitalId: string, clinicId?: string): Promise<HospitalService[]> {
  let q = adminDb
    .from('services')
    .select('id, name, description, specialty_id, base_price, virtual_price, duration_mins, is_active, clinic_id, specialty:specialties!services_specialty_id_fkey(name)')
    .eq('hospital_id', hospitalId)
  // Clinic-scoped users see only their clinic's services (+ hospital-wide ones with no clinic)
  if (clinicId) q = (q as any).or(`clinic_id.eq.${clinicId},clinic_id.is.null`)
  const { data } = await (q as any).order('name')
  return ((data as any[]) ?? []).map(s => ({
    id:           s.id,
    name:         s.name,
    description:  s.description ?? null,
    specialty_id: s.specialty_id ?? null,
    specialty_name: s.specialty?.name ?? null,
    base_price:   s.base_price ?? null,
    virtual_price: s.virtual_price ?? null,
    duration_mins: s.duration_mins ?? null,
    is_active:    s.is_active ?? true,
    clinic_id:    s.clinic_id ?? null,
  }))
}

export async function createService(
  hospitalId: string,
  data: { name: string; description?: string; specialty_id?: string; base_price?: number; virtual_price?: number; duration_mins?: number },
  clinicId?: string
): Promise<{ error?: string }> {
  const { error } = await (adminDb as any).from('services').insert({
    hospital_id:   hospitalId,
    clinic_id:     clinicId ?? null,
    name:          data.name,
    description:   data.description ?? null,
    specialty_id:  data.specialty_id ?? null,
    base_price:    data.base_price ?? null,
    virtual_price: data.virtual_price ?? null,
    duration_mins: data.duration_mins ?? null,
    is_active:     true,
  })
  return { error: error?.message }
}

export async function updateService(
  serviceId: string,
  data: { name?: string; description?: string | null; specialty_id?: string | null; base_price?: number | null; virtual_price?: number | null; duration_mins?: number | null }
): Promise<{ error?: string }> {
  const { error } = await adminDb.from('services').update(data).eq('id', serviceId)
  return { error: error?.message }
}

export async function toggleServiceActive(serviceId: string, isActive: boolean): Promise<void> {
  await adminDb.from('services').update({ is_active: isActive }).eq('id', serviceId)
}

export async function deleteService(serviceId: string): Promise<void> {
  await adminDb.from('services').delete().eq('id', serviceId)
}

export async function getHospitalStats(hospitalId: string) {
  const today = new Date().toISOString().split('T')[0]

  const [apptRes, completedRes, doctorRes, ratingRes] = await Promise.all([
    adminDb.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('appointment_date', today).neq('status', 'cancelled'),
    adminDb.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('appointment_date', today).eq('status', 'completed'),
    adminDb.from('doctors').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('is_active', true),
    adminDb.from('hospitals').select('avg_rating, total_bookings, review_count')
      .eq('id', hospitalId).single(),
  ])

  return {
    todayTotal: apptRes.count ?? 0,
    todayCompleted: completedRes.count ?? 0,
    activeDoctors: doctorRes.count ?? 0,
    avgRating: ratingRes.data?.avg_rating ?? 4.8,
    totalBookings: ratingRes.data?.total_bookings ?? 0,
    reviewCount: ratingRes.data?.review_count ?? 0,
  }
}

// ── Appointment actions (new booking system) ──────────────────────────────────

export async function assignDoctorToAppointment(appointmentId: string, doctorId: string): Promise<void> {
  await adminDb.from('appointments').update({
    assigned_doctor_id: doctorId,
    doctor_id: doctorId,
    updated_at: new Date().toISOString(),
  } as any).eq('id', appointmentId)
}

export async function markNoShow(appointmentId: string): Promise<void> {
  const now = new Date().toISOString()
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  await adminDb.from('appointments').update({
    status: 'no_show',
    no_show_at: now,
    reschedule_deadline: deadline,
    updated_at: now,
  } as any).eq('id', appointmentId)
}

async function sendExpoPush(token: string, title: string, body: string, data?: Record<string, unknown>) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, data: data ?? {}, sound: 'default', priority: 'high' }),
    })
  } catch { /* best-effort */ }
}

async function notifyPatient(
  appointmentId: string,
  type: 'confirmed' | 'cancelled',
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  try {
    const { data: appt } = await adminDb
      .from('appointments')
      .select('patient_id, booking_ref')
      .eq('id', appointmentId)
      .single()
    if (!appt?.patient_id) return

    const { data: patient } = await adminDb
      .from('users')
      .select('push_token')
      .eq('id', appt.patient_id)
      .single()

    // In-app notification
    await adminDb.from('notifications').insert({
      user_id:  appt.patient_id,
      type,
      title,
      body,
      data:     { appointment_id: appointmentId, booking_ref: appt.booking_ref, ...data },
      is_read:  false,
      sent_via: ['in_app'],
    } as any)

    // Device push notification
    const pushToken = (patient as any)?.push_token
    if (pushToken) await sendExpoPush(pushToken, title, body, { appointment_id: appointmentId })
  } catch { /* best-effort — never block the approval action */ }
}

export async function approveAppointment(appointmentId: string, note?: string): Promise<void> {
  const { data: appt } = await adminDb
    .from('appointments')
    .select('booking_ref, appointment_date, hospital:hospitals!appointments_hospital_id_fkey(name), clinic:hospital_clinics!appointments_clinic_id_fkey(name)')
    .eq('id', appointmentId)
    .single()

  await adminDb.from('appointments').update({
    approval_status: 'auto_approved',
    status: 'confirmed',
    approval_note: note ?? null,
    updated_at: new Date().toISOString(),
  } as any).eq('id', appointmentId)

  const hospitalName = (appt as any)?.hospital?.name ?? 'the hospital'
  const clinicName   = (appt as any)?.clinic?.name
  const ref          = (appt as any)?.booking_ref ?? appointmentId
  const dateStr      = (appt as any)?.appointment_date
    ? new Date((appt as any).appointment_date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
    : ''

  const notifBody = clinicName
    ? `Your booking (${ref}) at ${hospitalName} — ${clinicName} on ${dateStr} has been confirmed.`
    : `Your booking (${ref}) at ${hospitalName} on ${dateStr} has been confirmed.`

  await notifyPatient(appointmentId, 'confirmed', 'Booking Approved ✅', notifBody)
}

export async function rejectAppointment(appointmentId: string, note: string): Promise<void> {
  const { data: appt } = await adminDb
    .from('appointments')
    .select('booking_ref, hospital:hospitals!appointments_hospital_id_fkey(name)')
    .eq('id', appointmentId)
    .single()

  await adminDb.from('appointments').update({
    approval_status: 'rejected',
    status: 'cancelled',
    approval_note: note,
    cancellation_reason: `Booking rejected: ${note}`,
    cancelled_at: new Date().toISOString(),
    refund_pct: 100,
    updated_at: new Date().toISOString(),
  } as any).eq('id', appointmentId)

  const ref          = (appt as any)?.booking_ref ?? appointmentId
  const hospitalName = (appt as any)?.hospital?.name ?? 'the hospital'

  await notifyPatient(
    appointmentId, 'cancelled',
    'Booking Not Approved ❌',
    `Your booking (${ref}) at ${hospitalName} was not approved. Reason: ${note}. A full refund has been issued.`,
  )
}

export async function getDailyBookingCount(
  hospitalId: string, date: string, clinicId?: string
): Promise<number> {
  let q = adminDb
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId)
    .eq('appointment_date', date)
    .neq('status', 'cancelled')
  if (clinicId) q = (q as any).eq('clinic_id', clinicId)
  const { count } = await q
  return count ?? 0
}

export async function getHospitalSettings(hospitalId: string) {
  const { data } = await adminDb
    .from('hospitals')
    .select('accepts_virtual, emergency_hours, daily_booking_limit, approval_mode, requires_referral, opd_fee, latitude, longitude')
    .eq('id', hospitalId)
    .single()
  return data as {
    accepts_virtual: boolean | null
    emergency_hours: boolean | null
    daily_booking_limit: number | null
    approval_mode: string | null
    requires_referral: boolean | null
    opd_fee: number | null
    latitude: number | null
    longitude: number | null
  } | null
}

export async function updateHospitalSettings(hospitalId: string, settings: {
  daily_booking_limit?: number | null
  approval_mode?: string
  requires_referral?: boolean
  opd_fee?: number
  accepts_virtual?: boolean
  emergency_hours?: boolean
}): Promise<{ error: string | null }> {
  const { error } = await adminDb.from('hospitals').update(settings as any).eq('id', hospitalId)
  return { error: error?.message ?? null }
}

// ── Operating hours (hospital-wide + per-clinic) ────────────────────────────────

export interface DayHours { day: number; open: string; close: string; closed: boolean }

// Mirrors onboarding's defaultHours: Mon–Sat 08:00–18:00 open, Sunday closed
function defaultHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day, open: '08:00', close: '18:00', closed: day === 0,
  }))
}

function fillHours(rows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[]): DayHours[] {
  const byDay = new Map(rows.map(r => [r.day_of_week, r]))
  return defaultHours().map(d => {
    const r = byDay.get(d.day)
    if (!r) return d
    return { day: d.day, open: r.open_time.slice(0, 5), close: r.close_time.slice(0, 5), closed: r.is_closed }
  })
}

export async function getHospitalHours(hospitalId: string): Promise<DayHours[]> {
  const { data } = await (adminDb as any)
    .from('hospital_operating_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('hospital_id', hospitalId)
  return fillHours(data ?? [])
}

export async function updateHospitalHours(hospitalId: string, hours: DayHours[]): Promise<{ error: string | null }> {
  const rows = hours.map(h => ({
    hospital_id: hospitalId, day_of_week: h.day,
    open_time: h.open, close_time: h.close, is_closed: h.closed,
  }))
  const { error } = await (adminDb as any)
    .from('hospital_operating_hours')
    .upsert(rows, { onConflict: 'hospital_id,day_of_week' })
  return { error: error?.message ?? null }
}

export async function getClinicHours(clinicId: string): Promise<{ hours: DayHours[]; isCustom: boolean }> {
  const { data } = await (adminDb as any)
    .from('hospital_clinic_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('clinic_id', clinicId)
  const rows = data ?? []
  return { hours: fillHours(rows), isCustom: rows.length > 0 }
}

export async function updateClinicHours(clinicId: string, hours: DayHours[]): Promise<{ error: string | null }> {
  const rows = hours.map(h => ({
    clinic_id: clinicId, day_of_week: h.day,
    open_time: h.open, close_time: h.close, is_closed: h.closed,
  }))
  const { error } = await (adminDb as any)
    .from('hospital_clinic_hours')
    .upsert(rows, { onConflict: 'clinic_id,day_of_week' })
  return { error: error?.message ?? null }
}

export async function clearClinicHours(clinicId: string): Promise<{ error: string | null }> {
  const { error } = await (adminDb as any).from('hospital_clinic_hours').delete().eq('clinic_id', clinicId)
  return { error: error?.message ?? null }
}

// ── Doctor self-service ───────────────────────────────────────────────────────

export type DoctorAvailabilityStatus = 'on_duty' | 'on_break' | 'off_duty'

export async function getDoctorProfile(doctorId: string): Promise<{
  avg_rating: number
  review_count: number
  total_bookings: number
  availability_status: DoctorAvailabilityStatus
} | null> {
  const { data } = await (adminDb.from('doctors') as any)
    .select('avg_rating, review_count, total_bookings, availability_status')
    .eq('id', doctorId)
    .single()
  if (!data) return null
  return {
    avg_rating:          data.avg_rating ?? 0,
    review_count:        data.review_count ?? 0,
    total_bookings:      data.total_bookings ?? 0,
    availability_status: (data.availability_status ?? 'on_duty') as DoctorAvailabilityStatus,
  }
}

export async function setDoctorAvailability(doctorId: string, status: DoctorAvailabilityStatus): Promise<void> {
  await (adminDb.from('doctors') as any).update({ availability_status: status }).eq('id', doctorId)
}
