import { adminDb } from './supabase/admin-client'

export interface AdminAppointment {
  id: string
  booking_ref: string
  appointment_date: string
  start_time: string
  status: string
  type: string
  reason: string | null
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
}

export interface AdminDoctor {
  id: string
  full_name: string
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

export async function getHospitalIdForUser(authId: string): Promise<string | null> {
  const { data: profile } = await adminDb
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .single()
  if (!profile) return null

  const { data: adminRow } = await adminDb
    .from('hospital_admins')
    .select('hospital_id')
    .eq('user_id', profile.id)
    .limit(1)
    .single()
  return adminRow?.hospital_id ?? null
}

export interface ClinicWithAdmin {
  id: string
  name: string
  description: string | null
  is_active: boolean | null
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
      subAdmin: u ? { id: u.id, full_name: u.full_name, email: u.email } : null,
      doctorCount: doctorCounts[clinic.id] ?? 0,
    }
  }) as ClinicWithAdmin[]
}

// Fallback for demo/test accounts with no hospital_admins record
export async function getFirstHospitalId(): Promise<string | null> {
  const { data } = await adminDb
    .from('hospitals')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single()
  return data?.id ?? null
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
      patient:users!appointments_patient_id_fkey(full_name, date_of_birth, gender),
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

  return (data as any[]).map(a => {
    const isWalkin = a.booking_mode === 'walkin'
    const patientName = isWalkin
      ? (a.walkin_patient_name ?? 'Walk-in Patient')
      : (a.patient?.full_name ?? 'Unknown')
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

export async function getTodayAppointments(hospitalId: string): Promise<AdminAppointment[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await adminDb
    .from('appointments')
    .select(`
      id, booking_ref, appointment_date, start_time, status, type, reason,
      patient:users!appointments_patient_id_fkey(full_name, date_of_birth, gender),
      doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name))
    `)
    .eq('hospital_id', hospitalId)
    .eq('appointment_date', today)
    .order('start_time')

  if (error || !data) return []

  return (data as any[]).map(a => ({
    id: a.id,
    booking_ref: a.booking_ref,
    appointment_date: a.appointment_date,
    start_time: (a.start_time ?? '').slice(0, 5),
    status: a.status,
    type: a.type,
    reason: a.reason,
    patient_name: a.patient?.full_name ?? 'Unknown',
    patient_age: calcAge(a.patient?.date_of_birth ?? null),
    patient_gender: a.patient?.gender ?? null,
    doctor_name: a.doctor?.full_name ?? 'Unknown',
    doctor_id: a.doctor?.id ?? '',
    specialty_name: a.doctor?.specialty?.name ?? null,
  }))
}

export async function getWeekAppointments(hospitalId: string): Promise<Record<string, any[]>> {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  const { data } = await adminDb
    .from('appointments')
    .select(`
      appointment_date, start_time, type, status,
      patient:users!appointments_patient_id_fkey(full_name),
      doctor:doctors!appointments_doctor_id_fkey(full_name)
    `)
    .eq('hospital_id', hospitalId)
    .gte('appointment_date', monday.toISOString().split('T')[0])
    .lte('appointment_date', friday.toISOString().split('T')[0])
    .neq('status', 'cancelled')
    .order('start_time')

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const schedule: Record<string, any[]> = Object.fromEntries(days.map(d => [d, []]))

  if (!data) return schedule

  ;(data as any[]).forEach(a => {
    const date = new Date(a.appointment_date + 'T00:00:00')
    const dayIdx = date.getDay() - 1
    if (dayIdx >= 0 && dayIdx < 5) {
      schedule[days[dayIdx]].push({
        time: (a.start_time ?? '').slice(0, 5),
        doc: a.doctor?.full_name ?? 'Doctor',
        patient: a.patient?.full_name ?? 'Patient',
        type: a.type,
      })
    }
  })

  return schedule
}

export async function getDoctors(hospitalId: string): Promise<AdminDoctor[]> {
  const { data, error } = await adminDb
    .from('doctors')
    .select(`
      id, full_name, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })

  if (error || !data) return []

  return (data as any[]).map(d => ({
    id: d.id,
    full_name: d.full_name,
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
  return data as ClinicDetail | null
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
  const { data, error } = await adminDb
    .from('doctors')
    .select(`
      id, full_name, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('full_name')
  if (error || !data) return []
  return (data as any[]).map(d => ({
    id: d.id, full_name: d.full_name, title: d.title,
    specialty_name: d.specialty?.name ?? null,
    avg_rating: d.avg_rating, review_count: d.review_count,
    is_active: d.is_active, accepts_virtual: d.accepts_virtual,
    consultation_fee: d.consultation_fee, years_experience: d.years_experience,
    avatar: nameToInitials(d.full_name), color: nameToColor(d.full_name),
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
  }))
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
      patient:users!appointments_patient_id_fkey(full_name, date_of_birth, gender),
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

  return (data as any[]).map(a => {
    const isWalkin = a.booking_mode === 'walkin'
    const patientName = isWalkin ? (a.walkin_patient_name ?? 'Walk-in') : (a.patient?.full_name ?? 'Unknown')
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
    .select('accepts_virtual, emergency_hours, daily_booking_limit, approval_mode, requires_referral, opd_fee')
    .eq('id', hospitalId)
    .single()
  return data as {
    accepts_virtual: boolean | null
    emergency_hours: boolean | null
    daily_booking_limit: number | null
    approval_mode: string | null
    requires_referral: boolean | null
    opd_fee: number | null
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
