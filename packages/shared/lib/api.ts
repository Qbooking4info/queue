import { supabase, publicDb } from './supabase'
import type { Hospital, Doctor, Appointment, TimeSlot } from '../types/database'
import { todayLocalDate } from './format'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

// ── Hospitals ────────────────────────────────────────────────────────────────

export type BedSpaceStatus = 'enough' | 'limited' | 'very_limited' | 'none' | 'unknown'

export type HospitalWithDoctors = Hospital & { latitude?: number | null; longitude?: number | null } & {
  doctors: Doctor[]
  daily_booking_limit?: number | null
  approval_mode?: string | null
  requires_referral?: boolean | null
  opd_fee?: number | null
  clinic_model?: string | null
  is_24_hours?: boolean | null
  bed_space_status?: BedSpaceStatus | null
  bed_space_updated_at?: string | null
  hospital_specialties?: { specialty: { name: string; icon: string | null } | null }[]
  services?: { name: string; is_active: boolean | null }[]
}

// Explicit column lists, not '*' -- doctors and hospitals are both readable
// by anon (public directory RLS policy), and '*' would pull doctors.email,
// auth_user_id, user_id, mdcn_number and hospitals.email/registration_number/
// mdcn_accreditation. Keep in sync with web/src/lib/public-hospital-select.ts;
// the two can't share a module across the mobile/web boundary (see Task 13).
const DOCTOR_SELECT = 'id, full_name, title, level, qualification, bio, avatar_url, ' +
  'years_experience, consultation_fee, virtual_fee, accepts_virtual, ' +
  'avg_rating, review_count, availability_status, clinic_id, ' +
  'specialty:specialties!doctors_specialty_id_fkey(name, icon)'

const HOSPITAL_SELECT = 'id, name, slug, address, city, state, country, phone, whatsapp, ' +
  'type, description, logo_url, cover_url, latitude, longitude, ' +
  'accepts_virtual, emergency_hours, opd_fee, avg_rating, review_count, is_verified, ' +
  'is_24_hours, daily_booking_limit, approval_mode, requires_referral, clinic_model, ' +
  'bed_space_status, bed_space_updated_at, ' +
  `doctors(${DOCTOR_SELECT}), ` +
  'hospital_specialties(specialty:specialties!hospital_specialties_specialty_id_fkey(name, icon)), ' +
  'services(name, is_active)'

// For embedding a hospital under an appointment row -- deliberately not the fuller
// HOSPITAL_SELECT above (which nests the hospital's entire doctor roster/specialties/
// services, wasteful here) and deliberately not '*' (this is queried via the
// *authenticated* client, not publicDb -- '*' would still pull hospitals.email/
// registration_number/mdcn_accreditation for the caller's own device even though the
// anon-key path already excludes them; see 20260726000004_column_privacy_doctors_hospitals_v2.sql).
const APPOINTMENT_HOSPITAL_SELECT = 'id, name, slug, address, city, state, phone, whatsapp, ' +
  'latitude, longitude, opd_fee, is_24_hours, emergency_hours'

// Routed through a cached Next.js API route (60s edge cache) instead of
// querying Supabase directly — this is the highest-volume read in the app
// (every screen that shows the hospital directory), and the underlying data
// changes on the order of hours, not seconds. Falls back to a direct
// Supabase query if the API route is unreachable.
export async function getHospitals(search?: string, opts?: { specialtyId?: string }): Promise<HospitalWithDoctors[]> {
  const specialtyId = opts?.specialtyId
  if (API_URL) {
    try {
      const qs = new URLSearchParams()
      if (search?.trim()) qs.set('search', search.trim())
      if (specialtyId) qs.set('specialtyId', specialtyId)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      const res = await fetch(`${API_URL}/api/public/hospitals${suffix}`)
      if (res.ok) return (await res.json()) as HospitalWithDoctors[]
    } catch {
      // fall through to direct query below
    }
  }

  // specialtyId turns the hospital_specialties embed into an inner join filtered
  // on that specialty -- only hospitals that explicitly registered it, same
  // reasoning as web/src/app/api/public/hospitals/route.ts (this is the
  // direct-query fallback for when API_URL is unreachable).
  const select = specialtyId
    ? HOSPITAL_SELECT.replace('hospital_specialties(', 'hospital_specialties!inner(')
    : HOSPITAL_SELECT

  let query = publicDb
    .from('hospitals')
    .select(select)
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })

  if (search?.trim()) {
    query = query.ilike('name', `%${search.trim()}%`)
  }
  if (specialtyId) {
    query = query.eq('hospital_specialties.specialty_id', specialtyId)
  }

  const { data } = await query
  return (data as any[]) ?? []
}

export async function getHospitalById(id: string): Promise<HospitalWithDoctors | null> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/api/public/hospitals/${id}`)
      if (res.ok) return (await res.json()) as HospitalWithDoctors
    } catch {
      // fall through to direct query below
    }
  }

  const { data } = await publicDb
    .from('hospitals')
    .select(HOSPITAL_SELECT)
    .eq('id', id)
    .single()
  return data as any
}

// ── Specialties ──────────────────────────────────────────────────────────────
// The real specialties table -- distinct from the static, hand-picked array in
// data/index.ts that drives HomeScreen's existing quick-pick grid (icons/labels
// that don't map 1:1 to real specialty rows/ids). Used for real ID-based
// filtering (hospitals-by-specialty, doctors-by-specialty), not that grid.

export interface SpecialtyRow { id: string; name: string; icon: string | null; slug: string }

export async function getSpecialties(): Promise<SpecialtyRow[]> {
  const { data } = await publicDb
    .from('specialties')
    .select('id, name, icon, slug')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data as SpecialtyRow[]) ?? []
}

// ── Clinics ──────────────────────────────────────────────────────────────────

export type Clinic = {
  id:                  string
  hospital_id:         string
  name:                string
  description:         string | null
  is_opd:              boolean
  is_active:           boolean
  is_emergency:        boolean
  sort_order:          number | null
  daily_booking_limit: number | null
  service_tags:        string[]
  min_age:             number | null
  max_age:             number | null
  gender_restriction:  'male' | 'female' | null
}

export async function getClinicsForHospital(hospitalId: string): Promise<Clinic[]> {
  const { data } = await publicDb
    .from('hospital_clinics')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return ((data ?? []) as any[]).map(c => ({ ...c, is_emergency: c.is_emergency ?? false })) as Clinic[]
}

// A clinic explicitly flagged is_emergency always wins. If none is flagged — e.g. a hospital
// admin created an "Accident and Emergency" clinic but never hit the "Set as Emergency Dept"
// toggle — fall back to name matching so emergency routing still works out of the box instead
// of silently dropping the booking into the unassigned bucket.
const EMERGENCY_NAME_PATTERN = /accident.*emergency|emergency.*(dept|department|room|ward|unit)|\ba\s*&\s*e\b|casualty|trauma\s*(centre|center|unit)/i

export function findEmergencyClinic(clinics: Clinic[]): Clinic | null {
  return clinics.find(c => c.is_emergency) ?? clinics.find(c => EMERGENCY_NAME_PATTERN.test(c.name)) ?? null
}

// ── Operating hours ──────────────────────────────────────────────────────────

export interface DayHours { day: number; open: string; close: string; closed: boolean }

// Mirrors the web dashboard's default: Mon–Sat 08:00–18:00 open, Sunday closed
function defaultDayHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '18:00', closed: day === 0 }))
}

export async function getHospitalHours(hospitalId: string): Promise<DayHours[]> {
  const { data } = await publicDb
    .from('hospital_operating_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('hospital_id', hospitalId)
  const byDay = new Map((data ?? []).map((r: any) => [r.day_of_week, r]))
  return defaultDayHours().map(d => {
    const r = byDay.get(d.day)
    if (!r) return d
    return { day: d.day, open: r.open_time.slice(0, 5), close: r.close_time.slice(0, 5), closed: r.is_closed }
  })
}

// isCustom=false means the clinic never set its own hours — callers should fall back
// to the hospital's own hours instead of treating the returned defaults as authoritative.
export async function getClinicHours(clinicId: string): Promise<{ hours: DayHours[]; isCustom: boolean }> {
  const { data } = await publicDb
    .from('hospital_clinic_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('clinic_id', clinicId)
  const rows = data ?? []
  const byDay = new Map(rows.map((r: any) => [r.day_of_week, r]))
  const hours = defaultDayHours().map(d => {
    const r = byDay.get(d.day)
    if (!r) return d
    return { day: d.day, open: r.open_time.slice(0, 5), close: r.close_time.slice(0, 5), closed: r.is_closed }
  })
  return { hours, isCustom: rows.length > 0 }
}

export function isOpenNow(hours: DayHours[], is24Hours?: boolean | null): boolean {
  if (is24Hours) return true
  const now = new Date()
  const today = hours.find(h => h.day === now.getDay())
  if (!today || today.closed) return false
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const [oh, om] = today.open.split(':').map(Number)
  const [ch, cm] = today.close.split(':').map(Number)
  return nowMins >= oh * 60 + om && nowMins < ch * 60 + cm
}

// ── Doctors ──────────────────────────────────────────────────────────────────

export async function getDoctorsByHospital(hospitalId: string): Promise<Doctor[]> {
  const { data } = await publicDb
    .from('doctors')
    .select(DOCTOR_SELECT)
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })
  return (data as any) ?? []
}

// ── Time slots ───────────────────────────────────────────────────────────────

export async function getAvailableSlots(
  doctorId: string, date: string, isVirtual = false
): Promise<TimeSlot[]> {
  const { data } = await publicDb
    .from('time_slots')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('slot_date', date)
    .eq('is_available', true)
    .eq('is_virtual', isVirtual)
    .order('start_time')
  return data ?? []
}

// ── Daily booking limit check ─────────────────────────────────────────────────
// Server computes the limit comparison itself (see get_daily_booking_count
// migration) and returns only whether the day is full, not the exact count.

export async function isDailyBookingLimitReached(
  hospitalId: string, date: string, clinicId?: string
): Promise<boolean> {
  const { data } = await publicDb.rpc('get_daily_booking_count', {
    p_hospital_id: hospitalId,
    p_date:        date,
    p_clinic_id:   clinicId ?? null,
  })
  return (data as boolean) ?? false
}

// ── Booking references ───────────────────────────────────────────────────────

/**
 * `${prefix}-${Date.now().toString().slice(-6)}` was the old scheme: the low 6
 * digits of epoch-ms wrap every 10^6 ms, so any two bookings made ~16m 40s
 * apart collide outright, and concurrent bookings in the same millisecond
 * always do. The web walk-in route already moved off this (randomBytes(4));
 * mobile is the last caller, and it has no `crypto` module, so this uses
 * Math.random — a booking ref only needs to be collision-resistant, not
 * unguessable (nothing authorizes off it).
 *
 * 8 base36 chars ≈ 2.8e12 values, so a collision needs ~2 million bookings
 * before it's even likely.
 */
function bookingRefFor(prefix: string): string {
  const rand = () => Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
  return `${prefix}-${(rand() + rand()).toUpperCase()}`
}

// ── Appointments ─────────────────────────────────────────────────────────────

export interface AppointmentDoctor {
  id: string
  full_name: string
  title: string | null
  qualification: string | null
  bio: string | null
  avatar_url: string | null
  years_experience: number | null
  consultation_fee: number | null
  virtual_fee: number | null
  accepts_virtual: boolean | null
  avg_rating: number | null
  review_count: number | null
  availability_status: string | null
  clinic_id: string | null
  specialty: { name: string; icon: string | null } | null
}

export interface AppointmentHospital {
  id: string
  name: string
  slug: string | null
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  whatsapp: string | null
  latitude: number | null
  longitude: number | null
  opd_fee: number | null
  is_24_hours: boolean | null
  emergency_hours: boolean | null
}

export type AppointmentWithRelations = Appointment & {
  doctor:   AppointmentDoctor   | null
  hospital: AppointmentHospital | null
  clinic:   Clinic              | null
  patient:  { id: string; full_name: string } | null
}

// Same column-privacy reasoning as DOCTOR_SELECT/APPOINTMENT_HOSPITAL_SELECT above --
// queried via the authenticated client (RLS already scopes the *row* to the caller's
// own appointments), but the embedded doctor/hospital columns still need their own
// allowlist so a patient's device doesn't receive staff login emails/MDCN numbers/
// hospital registration numbers for every doctor and hospital on their appointments.
// patient is just id+name -- enough to show a "for: {name}" tag on a linked
// dependent's booking (readable via the "Caretakers can read linked dependent
// profile" users policy, 20260827000001) without over-fetching their profile.
const APPOINTMENT_SELECT = `*, doctor:doctors!appointments_doctor_id_fkey(${DOCTOR_SELECT}), ` +
  `hospital:hospitals!appointments_hospital_id_fkey(${APPOINTMENT_HOSPITAL_SELECT}), ` +
  'clinic:hospital_clinics!appointments_clinic_id_fkey(*), ' +
  'patient:users!appointments_patient_id_fkey(id, full_name)'

// No .eq('patient_id', ...) filter -- RLS (current_patient_ids(), see
// 20260827000001_dependent_account_linking.sql) already scopes this to the
// caller's own appointments AND any linked dependents' appointments, so this
// naturally returns a merged list once dependents are linked. Must use the
// authenticated supabase client so RLS can verify the user session.
export async function getPatientAppointments(): Promise<Result<AppointmentWithRelations[]>> {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .order('appointment_date', { ascending: false })
  if (error) {
    console.warn('[getPatientAppointments]', error.message, error.details)
    return { ok: false, error: error.message }
  }
  return { ok: true, data: (data as any[]) ?? [] }
}

export async function getAppointmentById(appointmentId: string): Promise<AppointmentWithRelations | null> {
  const { data } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('id', appointmentId)
    .single()
  return (data as any) ?? null
}

export async function getNextAppointment(
  patientId: string
): Promise<AppointmentWithRelations | null> {
  const today = todayLocalDate()
  const { data } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('patient_id', patientId)
    .gte('appointment_date', today)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_date', { ascending: true })
    .order('start_time',       { ascending: true })
    .limit(1)
    .single()
  return data as any
}

// The patient's own appointment that's actually IN the queue today (checked in
// or already being seen) -- disjoint from getNextAppointment's 'confirmed'/
// 'pending' filter by construction, so the two never both match the same row.
// Drives the home screen's live queue card in place of the generic booking CTA.
export async function getActiveQueueAppointment(
  patientId: string
): Promise<AppointmentWithRelations | null> {
  const today = todayLocalDate()
  const { data } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('patient_id', patientId)
    .eq('check_in_date', today)
    .in('status', ['checked_in', 'in_progress'])
    .order('checked_in_at', { ascending: true })
    .limit(1)
    .single()
  return data as any
}

// ── Create appointment (doctor-specific / virtual) ────────────────────────────

export type BookingResult =
  | { ok: true; id: string; bookingRef: string; approvalStatus: string; originalCompleted?: boolean }
  | { ok: false; error: string }

export async function createAppointment(payload: {
  patientId:           string
  doctorId:            string
  hospitalId:          string
  slotId:              string | null
  date:                string
  startTime:           string
  type:                'in-person' | 'virtual'
  reason:              string
  urgency?:            'routine' | 'urgent' | 'emergency'
  symptomDescription?: string
  clinicId?:           string
  dependentId?:        string
  approvalMode?:       string    // 'auto' | 'manual' — from hospital settings
  paymentMethod?:      string
}): Promise<BookingResult> {
  const bookingRef     = bookingRefFor('QUE')
  const approvalStatus = payload.approvalMode === 'manual' ? 'pending_approval' : 'auto_approved'
  const status         = approvalStatus === 'auto_approved' ? 'confirmed' : 'pending'

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id:           payload.patientId,
      doctor_id:            payload.doctorId,
      hospital_id:          payload.hospitalId,
      slot_id:              payload.slotId,
      clinic_id:            payload.clinicId ?? null,
      appointment_date:     payload.date,
      start_time:           payload.startTime,
      type:                 payload.type,
      reason:               payload.reason,
      urgency:              payload.urgency ?? 'routine',
      symptom_description:  payload.symptomDescription ?? null,
      dependent_id:         payload.dependentId ?? null,
      status,
      approval_status:      approvalStatus,
      booking_mode:         'doctor',
      booking_ref:          bookingRef,
      refund_pct:           100,
      payment_method:       payload.paymentMethod ?? 'card',
    })
    .select('id, booking_ref')
    .single()

  if (error) { console.warn('[createAppointment]', error.message, error.code); return { ok: false, error: error.message } }
  return { ok: true, id: data.id, bookingRef: data.booking_ref, approvalStatus }
}

// ── Create hospital-level (OPD / in-person) appointment ──────────────────────

export async function createHospitalAppointment(payload: {
  patientId:           string
  hospitalId:          string
  date:                string
  startTime:           string
  reason:              string
  urgency?:            'routine' | 'urgent' | 'emergency'
  symptomDescription?: string
  evidenceUrl?:        string
  clinicId?:           string
  serviceId?:          string
  dependentId?:        string
  approvalMode?:       string
  opdFee?:             number
  type?:               'in-person' | 'virtual'
  paymentMethod?:      string
}): Promise<BookingResult> {
  const bookingRef     = bookingRefFor('OPD')
  const approvalStatus = payload.approvalMode === 'manual' ? 'pending_approval' : 'auto_approved'
  const status         = 'pending'

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id:           payload.patientId,
      doctor_id:            null,
      hospital_id:          payload.hospitalId,
      clinic_id:            payload.clinicId ?? null,
      service_id:           payload.serviceId ?? null,
      appointment_date:     payload.date,
      start_time:           payload.startTime,
      type:                 payload.type ?? 'in-person',
      reason:               payload.reason,
      urgency:              payload.urgency ?? 'routine',
      symptom_description:  payload.symptomDescription ?? null,
      evidence_url:         payload.evidenceUrl ?? null,
      dependent_id:         payload.dependentId ?? null,
      status,
      approval_status:      approvalStatus,
      booking_mode:         'hospital',
      booking_ref:          bookingRef,
      refund_pct:           100,
      payment_method:       payload.paymentMethod ?? 'card',
    })
    .select('id, booking_ref')
    .single()

  if (error) { console.warn('[createHospitalAppointment]', error.message, error.code); return { ok: false, error: error.message } }
  return { ok: true, id: data.id, bookingRef: data.booking_ref, approvalStatus }
}

// ── Direct-to-doctor booking (no hospital involved) ───────────────────────────
// A patient books a doctor's own independent practice directly -- virtual
// consult or home visit -- bypassing any hospital. `doctorUserId` is the
// doctor's users.id (their "Doctor ID"), not a doctors.id: a fully
// independent doctor with zero hospital links has no doctors row to point
// at (see 20260817000001_direct_doctor_booking.sql). Always starts 'pending'
// / 'pending_review' -- the doctor reviews and approves/rejects it
// themselves (PATCH /api/appointments/direct/[id]), there's no
// approval_mode/auto-approve concept for direct bookings.

export interface IndependentDoctor {
  userId: string
  fullName: string
  avatarUrl: string | null
  title: string | null
  level: string | null
  specialty: { name: string; icon: string | null } | null
  bio: string | null
  qualification: string | null
  yearsExperience: number | null
  // Every hospital this doctor is actively linked to -- empty for a fully
  // independent doctor with zero hospital links. Not just direct-booking
  // doctors show up here any more (see GET /api/public/doctors/search) --
  // a hospital-only doctor has acceptsDirectVirtual/HomeVisit both false and
  // must be booked by going through one of these hospitals instead.
  hospitals: { id: string; name: string }[]
  virtualFee: number | null
  homeVisitFee: number | null
  acceptsDirectVirtual: boolean
  acceptsDirectHomeVisit: boolean
  phone: string | null
}

export interface IndependentDoctorProfile extends IndependentDoctor {
  documents: { id: string; title: string; url: string | null }[]
}

// Redaction (phone visibility) only happens server-side in the API route --
// deliberately no client-side Supabase-query fallback here, unlike the other
// public-data getters in this file, since replicating that check client-side
// would mean shipping the raw phone column to any anon-key holder regardless
// of the doctor's show_phone_to_patients setting.
export async function searchIndependentDoctors(params?: {
  q?: string
  specialtyId?: string
  visitType?: 'virtual' | 'home_visit'
}): Promise<IndependentDoctor[]> {
  if (!API_URL) return []
  try {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.specialtyId) qs.set('specialtyId', params.specialtyId)
    if (params?.visitType) qs.set('visitType', params.visitType)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const res = await fetch(`${API_URL}/api/public/doctors/search${suffix}`)
    if (!res.ok) return []
    const { doctors } = await res.json()
    return doctors as IndependentDoctor[]
  } catch {
    return []
  }
}

export async function getIndependentDoctorProfile(userId: string): Promise<IndependentDoctorProfile | null> {
  if (!API_URL) return null
  try {
    const res = await fetch(`${API_URL}/api/public/doctors/${userId}`)
    if (!res.ok) return null
    const { doctor } = await res.json()
    return doctor as IndependentDoctorProfile
  } catch {
    return null
  }
}

export async function createDirectAppointment(payload: {
  patientId:      string
  doctorUserId:   string
  date:           string
  startTime:      string
  type:           'virtual' | 'home_visit'
  reason:         string
  homeVisitAddress?: string
  dependentId?:   string
  paymentMethod?: string
}): Promise<BookingResult> {
  const bookingRef = bookingRefFor('DIR')

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id:           payload.patientId,
      doctor_id:            null,
      hospital_id:          null,
      doctor_user_id:       payload.doctorUserId,
      clinic_id:            null,
      appointment_date:     payload.date,
      start_time:           payload.startTime,
      type:                 payload.type,
      reason:               payload.reason,
      home_visit_address:   payload.type === 'home_visit' ? (payload.homeVisitAddress ?? null) : null,
      dependent_id:         payload.dependentId ?? null,
      status:               'pending',
      approval_status:      'pending_review',
      booking_mode:         'direct',
      booking_ref:          bookingRef,
      refund_pct:           100,
      payment_method:       payload.paymentMethod ?? 'card',
    } as any)
    .select('id, booking_ref')
    .single()

  if (error) { console.warn('[createDirectAppointment]', error.message, error.code); return { ok: false, error: error.message } }
  return { ok: true, id: data.id, bookingRef: data.booking_ref, approvalStatus: 'pending_review' }
}

// ── Refer a patient to another hospital (doctor-only) ─────────────────────────
// Goes through the server -- not a raw table insert like the patient booking
// functions above -- because this writes an appointment at a hospital the
// caller doesn't belong to, which RLS wouldn't allow directly, and the server
// verifies the caller actually owns `appointmentId` before creating it. Identifying
// the patient by the appointment (not a patientId) is deliberate -- it's what lets a
// walk-in with no linked account (common here) be referred at all, and it doubles as
// the "original consultation" the server auto-completes if it's still in progress.
export async function createReferral(payload: {
  appointmentId:       string
  receivingHospitalId: string
  receivingDoctorId?:  string
  receivingClinicId?:  string
  date:                string
  startTime:           string
  type?:               'in-person' | 'virtual'
  reason?:             string
  referralReason:      string
  urgency?:            'routine' | 'urgent' | 'emergency'
  paymentMethod?:      string
  // Defaults true server-side if omitted. Explicit false lets a doctor send more
  // than one referral out of the same consult without each one ending it.
  completeOriginal?:   boolean
}): Promise<BookingResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const jwt = session?.access_token
  if (!jwt) return { ok: false, error: 'Not authenticated' }

  try {
    const res = await fetch(`${API_URL}/api/appointments/refer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) return { ok: false, error: body?.error ?? 'Referral failed' }
    return { ok: true, id: body.id, bookingRef: body.bookingRef, approvalStatus: body.approvalStatus, originalCompleted: !!body.originalCompleted }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Referral failed' }
  }
}

// ── Cancel appointment (with refund policy) ───────────────────────────────────

export async function cancelAppointment(
  id: string, reason: string, appointmentDatetime: string
): Promise<{ success: boolean; refundPct: number; error?: string }> {
  const now        = new Date()
  const apptTime   = new Date(appointmentDatetime)
  const hoursUntil = (apptTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  const refundPct  = hoursUntil > 24 ? 100 : 50

  const { data, error } = await supabase
    .from('appointments')
    .update({
      status:              'cancelled',
      cancellation_reason: reason,
      cancelled_at:        now.toISOString(),
      refund_pct:          refundPct,
    })
    .eq('id', id)
    .select('id')   // detect 0-row updates (RLS silently blocks without error)

  if (error) {
    console.warn('[cancelAppointment] error:', error.message, error.code)
    return { success: false, refundPct, error: error.message }
  }
  if (!data || data.length === 0) {
    console.warn('[cancelAppointment] 0 rows updated — RLS may be blocking UPDATE')
    return { success: false, refundPct, error: 'Permission denied — appointment could not be updated' }
  }
  return { success: true, refundPct }
}

// ── Doctor consult status (start/end) ─────────────────────────────────────────
// Goes through PATCH /api/appointments/[id] (start_consultation/end_consultation
// actions) rather than a direct client-side `.update()` -- there has never been
// an RLS UPDATE policy on `appointments` for doctors (only SELECT, see
// 20260811000002_rls_identity_and_scoping.sql and every migration before it), so
// a direct client write from a doctor silently updates zero rows: no error, but
// nothing actually changes, which is why Start never flipped to End and nothing
// else watching the appointment (patients, front desk) ever saw the status
// change either. The service-role route already implements the
// auto-end-stale-in_progress side effect (and also closes orphaned
// virtual_sessions, which the old client-side version didn't).

async function doctorAuthHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const jwt = session?.access_token
  return jwt ? { Authorization: `Bearer ${jwt}` } : null
}

export async function setConsultStatus(
  appointmentId: string,
  newStatus: 'in_progress' | 'completed',
): Promise<{ error: string | null }> {
  const headers = await doctorAuthHeader()
  if (!headers) return { error: 'Not authenticated' }

  try {
    const res = await fetch(`${API_URL}/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: newStatus === 'in_progress' ? 'start_consultation' : 'end_consultation' }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: body?.error ?? 'Failed to update status' }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

export interface ConsultVitals {
  weight_kg: number | null
  height_cm: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  blood_sugar: number | null
}

// Neither vitals nor doctor_notes/diagnosis can be written by a direct client
// update -- vitals_audit_log has no client INSERT policy at all, and
// appointments has no doctor UPDATE policy (see setConsultStatus above). Both
// go through service-role routes.
// vitals is nullable -- the server rejects a vitals write for an appointment
// that isn't checked_in/in_progress, and the consult screen still needs to
// let a doctor save clinical notes/diagnosis before that point without also
// firing a vitals request that's guaranteed to fail.
export async function saveConsultVitalsAndNotes(
  appointmentId: string,
  vitals: ConsultVitals | null,
  notes: { notes: string; diagnosis: string },
): Promise<{ error: string | null }> {
  const headers = await doctorAuthHeader()
  if (!headers) return { error: 'Not authenticated' }

  const notesReq = fetch(`${API_URL}/api/appointments/${appointmentId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_consult_notes', ...notes }),
  })

  if (!vitals) {
    const notesRes = await notesReq
    if (notesRes.ok) return { error: null }
    const failed = await notesRes.json().catch(() => ({}))
    return { error: failed?.error ?? 'Please try again' }
  }

  const [vitalsRes, notesRes] = await Promise.all([
    fetch(`${API_URL}/api/appointments/${appointmentId}/vitals`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(vitals),
    }),
    notesReq,
  ])

  if (vitalsRes.ok && notesRes.ok) return { error: null }
  const failed = await (vitalsRes.ok ? notesRes : vitalsRes).json().catch(() => ({}))
  return { error: failed?.error ?? 'Please try again' }
}

// Calls the patient's phone with a push notification naming the doctor -- not
// gated to being exactly "next". Front desk and the doctors app both call the
// same PATCH action; doctorAuthHeader works for any authenticated caller
// despite the name (front desk/patient sessions included), not doctors only.
export async function ringPatient(appointmentId: string): Promise<{ error: string | null }> {
  const headers = await doctorAuthHeader()
  if (!headers) return { error: 'Not authenticated' }
  try {
    const res = await fetch(`${API_URL}/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ring' }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: body?.error ?? 'Failed to ring patient' }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

// Moves a checked-in appointment to a new global queue position. Called by
// front desk (any direction, any of their hospital's checked-in patients) and
// by a patient on their own appointment (later-only -- the route enforces the
// direction, this helper is just the transport).
export async function moveAppointmentQueuePosition(appointmentId: string, newPosition: number): Promise<{ error: string | null }> {
  const headers = await doctorAuthHeader()
  if (!headers) return { error: 'Not authenticated' }
  try {
    const res = await fetch(`${API_URL}/api/appointments/${appointmentId}/queue-position`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPosition }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: body?.error ?? 'Failed to move position' }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

// A patient's own queue-position bounds -- current position and how far later
// they're allowed to move themselves within their own urgency tier.
export async function getQueuePositionBounds(appointmentId: string): Promise<
  { ok: true; currentPosition: number | null; minPosition: number; maxPosition: number; estimatedWait: number | null; status: string }
  | { ok: false; error: string }
> {
  const headers = await doctorAuthHeader()
  if (!headers) return { ok: false, error: 'Not authenticated' }
  try {
    const res = await fetch(`${API_URL}/api/appointments/${appointmentId}/queue-position`, { headers })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body?.error ?? 'Failed to load queue position' }
    return {
      ok: true, currentPosition: body.currentPosition, minPosition: body.minPosition, maxPosition: body.maxPosition,
      estimatedWait: body.estimatedWait, status: body.status,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

// Front desk recording vitals at check-in, not mid-consult -- same route the
// doctor's consult screen posts to (already authorises front_desk).
export async function recordVitals(appointmentId: string, vitals: ConsultVitals): Promise<{ error: string | null }> {
  const headers = await doctorAuthHeader()
  if (!headers) return { error: 'Not authenticated' }
  try {
    const res = await fetch(`${API_URL}/api/appointments/${appointmentId}/vitals`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(vitals),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: body?.error ?? 'Failed to record vitals' }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

// ── Reschedule appointment (within 48-hr no-show window) ─────────────────────

export async function rescheduleAppointment(payload: {
  originalId:   string
  patientId:    string
  hospitalId:   string
  doctorId?:    string
  date:         string
  startTime:    string
  reason:       string
  type?:        'in-person' | 'virtual'
  clinicId?:    string
  approvalMode?:  string
  paymentMethod?: string
}): Promise<BookingResult> {
  const bookingRef     = bookingRefFor('RSC')
  const approvalStatus = payload.approvalMode === 'manual' ? 'pending_approval' : 'auto_approved'

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id:        payload.patientId,
      doctor_id:         payload.doctorId ?? null,
      hospital_id:       payload.hospitalId,
      clinic_id:         payload.clinicId ?? null,
      appointment_date:  payload.date,
      start_time:        payload.startTime,
      type:              payload.type ?? 'in-person',
      reason:            payload.reason,
      status:            'pending',
      approval_status:   approvalStatus,
      booking_mode:      'hospital',
      booking_ref:       bookingRef,
      rescheduled_from:  payload.originalId,
      refund_pct:        100,
      payment_method:    payload.paymentMethod ?? 'card',
    })
    .select('id, booking_ref')
    .single()
  if (error || !data) {
    console.warn('[rescheduleAppointment] insert failed:', error?.message)
    return { ok: false, error: error?.message ?? 'Insert failed' }
  }

  // Close out the original booking so the patient isn't left holding two active appointments
  // for the same visit — the new row links back to it via rescheduled_from. Scoped to
  // non-terminal statuses only: a reschedule can now also happen from a 'no_show' original
  // (the day-after prompt), and appointment_status_guard permanently blocks any change away
  // from completed/cancelled/no_show — trying to flip no_show -> cancelled here would just
  // throw. If the original is already terminal there's nothing to close; leave it as-is.
  const { error: closeErr } = await supabase
    .from('appointments')
    .update({
      status: 'cancelled',
      cancellation_reason: `Rescheduled to ${payload.date} (${bookingRef})`,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', payload.originalId)
    .in('status', ['pending', 'confirmed', 'checked_in', 'in_progress'])
  if (closeErr) console.warn('[rescheduleAppointment] failed to close original booking:', closeErr.message)

  return { ok: true, id: data.id, bookingRef: data.booking_ref, approvalStatus }
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(userId: string) {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}

export async function markNotificationRead(id: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllNotificationsRead(userId: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId)
}

// ── Push token ───────────────────────────────────────────────────────────────

export async function savePushToken(userId: string, token: string): Promise<void> {
  // Throws on failure rather than swallowing it. Production has zero push
  // tokens across all users; a write that fails quietly is indistinguishable
  // from one that never ran, and the caller logs what happened.
  const { error } = await supabase
    .from('users')
    .update({ push_token: token } as never)
    .eq('id', userId)
  if (error) throw new Error(`saving push token failed: ${error.message}`)
}

// ── User profile ─────────────────────────────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  data: Partial<{ full_name: string; phone: string; gender: string; date_of_birth: string; blood_group: string; city: string; state: string; address: string }>
) {
  const { error } = await supabase.from('users').update(data).eq('id', userId)
  return !error
}

// ── Medical history ──────────────────────────────────────────────────────────
// Synced to the backend (not local-only) so the treating doctor can see it via
// the hospital dashboard's "View Patient" chart.

export interface MedicalHistory {
  conditions: string[]
  allergies: string[]
  medications: string
  surgeries: string
  familyHistory: string
  otherConditions: string
  otherAllergies: string
}

const EMPTY_MEDICAL_HISTORY: MedicalHistory = { conditions: [], allergies: [], medications: '', surgeries: '', familyHistory: '', otherConditions: '', otherAllergies: '' }

// A failed fetch and "no history recorded" used to both surface as
// EMPTY_MEDICAL_HISTORY -- indistinguishable to the doctor viewing this
// chart, but a blank allergy list read as "no known allergies" is a
// clinically meaningful difference from "we don't know, the load failed."
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function getMedicalHistory(patientId: string): Promise<Result<MedicalHistory>> {
  const { data, error } = await supabase
    .from('patient_medical_history')
    .select('conditions, allergies, medications, surgeries, family_history, other_conditions, other_allergies')
    .eq('patient_id', patientId)
    .maybeSingle()
  if (error) { console.warn('getMedicalHistory error:', error.message); return { ok: false, error: error.message } }
  if (!data) return { ok: true, data: EMPTY_MEDICAL_HISTORY }
  return {
    ok: true,
    data: {
      conditions: (data as any).conditions ?? [],
      allergies: (data as any).allergies ?? [],
      medications: (data as any).medications ?? '',
      surgeries: (data as any).surgeries ?? '',
      familyHistory: (data as any).family_history ?? '',
      otherConditions: (data as any).other_conditions ?? '',
      otherAllergies: (data as any).other_allergies ?? '',
    },
  }
}

export async function updateMedicalHistory(patientId: string, notes: MedicalHistory): Promise<Result<void>> {
  const { error } = await supabase.from('patient_medical_history').upsert({
    patient_id: patientId,
    conditions: notes.conditions,
    allergies: notes.allergies,
    medications: notes.medications || null,
    surgeries: notes.surgeries || null,
    family_history: notes.familyHistory || null,
    other_conditions: notes.otherConditions || null,
    other_allergies: notes.otherAllergies || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'patient_id' })
  if (error) { console.warn('updateMedicalHistory error:', error.message); return { ok: false, error: error.message } }
  return { ok: true, data: undefined }
}

export async function deleteAccount(apiUrl: string, jwt: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/api/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Dependents (real-account linking) ───────────────────────────────────────
// Replaces the old profile-only `dependents` table (name/DOB/relationship blob,
// no login) -- a dependent is now a real, independently-registered account
// linked by its own short Patient ID, so it can eventually stand on its own
// (self-unlink at 18+) and its medical history is genuinely its own. Historical
// old-style dependents/appointments are untouched, just no longer creatable.
// All writes go through these service-role-backed routes, same trust model as
// doctor-hospital linking -- looking someone else's account up by code can't be
// done under the caller's own RLS.

async function dependentsAuthHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const jwt = session?.access_token
  return jwt ? { Authorization: `Bearer ${jwt}` } : null
}

export interface LinkedDependent {
  linkId: string
  relationship: string
  dependent: { id: string; full_name: string; date_of_birth: string | null; gender: string | null }
}
export interface ManagedByCaretaker {
  linkId: string
  relationship: string
  caretaker: { id: string; full_name: string }
}

// Every call here is wrapped in try/catch and always resolves (never rejects) --
// a caller that awaits one of these inside a load()-then-setLoading(false)
// sequence must never get stuck mid-await on a network failure. Confirmed live:
// before this, a CORS misconfiguration on the server made fetch() reject with
// "Failed to fetch", which propagated straight out of an un-caught
// getLinkedDependents() and left the Dependents screen spinning forever since
// setLoading(false) was never reached.
export async function getLinkedDependents(): Promise<{ managing: LinkedDependent[]; managedBy: ManagedByCaretaker | null }> {
  try {
    const headers = await dependentsAuthHeader()
    if (!headers) return { managing: [], managedBy: null }
    const res = await fetch(`${API_URL}/api/dependents/linked`, { headers })
    if (!res.ok) return { managing: [], managedBy: null }
    return await res.json()
  } catch (e) {
    console.warn('[getLinkedDependents]', e instanceof Error ? e.message : e)
    return { managing: [], managedBy: null }
  }
}

// direction 'caretaker' (default): the caller is looking up/linking a DEPENDENT
// by the dependent's own code (the original "Link by ID" flow). direction
// 'dependent': the caller IS the dependent, looking up/linking a CARETAKER by
// the caretaker's code (used at signup and by "Add a caretaker" in Dependents).
export async function lookupPatientByCode(code: string, direction: 'caretaker' | 'dependent' = 'caretaker'): Promise<
  { ok: true; fullName: string; dateOfBirth: string | null; alreadyLinked: boolean } | { ok: false; error: string }
> {
  try {
    const headers = await dependentsAuthHeader()
    if (!headers) return { ok: false, error: 'Not authenticated' }
    const res = await fetch(`${API_URL}/api/dependents/link?code=${encodeURIComponent(code.trim())}&as=${direction}`, { headers })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body?.error ?? 'Could not find that Patient ID' }
    return { ok: true, fullName: body.fullName, dateOfBirth: body.dateOfBirth ?? null, alreadyLinked: !!body.alreadyLinked }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

export async function linkDependent(code: string, relationship: string, direction: 'caretaker' | 'dependent' = 'caretaker'): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await dependentsAuthHeader()
    if (!headers) return { ok: false, error: 'Not authenticated' }
    const res = await fetch(`${API_URL}/api/dependents/link`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), relationship, as: direction }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body?.error ?? 'Could not link that account' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

export async function unlinkDependent(linkId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await dependentsAuthHeader()
    if (!headers) return { ok: false, error: 'Not authenticated' }
    const res = await fetch(`${API_URL}/api/dependents/unlink`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body?.error ?? 'Could not unlink' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

// Mints a magic-link token that lets this device sign in as the given dependent's
// own account -- authorized server-side by an active dependent_links row for the
// caller. See AuthContext.switchToDependent for how the token gets redeemed.
export async function requestDependentSwitchToken(dependentId: string): Promise<
  { ok: true; tokenHash: string; fullName: string } | { ok: false; error: string }
> {
  try {
    const headers = await dependentsAuthHeader()
    if (!headers) return { ok: false, error: 'Not authenticated' }
    const res = await fetch(`${API_URL}/api/dependents/switch`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dependentId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: body?.error ?? 'Could not switch to that account' }
    return { ok: true, tokenHash: body.tokenHash, fullName: body.fullName }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

// ── Medical history ───────────────────────────────────────────────────────────

export async function getCompletedAppointments(patientId: string) {
  const { data } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('patient_id', patientId)
    .eq('status', 'completed')
    .order('appointment_date', { ascending: false })
  return (data as any[]) ?? []
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function addNotification(payload: {
  userId:  string
  type:    string
  title:   string
  body:    string
  data?:   Record<string, unknown>
}) {
  await publicDb.from('notifications').insert({
    user_id:  payload.userId,
    type:     payload.type,
    title:    payload.title,
    body:     payload.body,
    data:     payload.data ?? null,
    is_read:  false,
    sent_via: ['in_app'],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Doctor-facing endpoints, migrated from the standalone doctors/ app when it was
// folded into this one. These existed only there, which is why the doctor screens
// could not simply be dropped in: mobile/lib/api.ts is the larger file overall but
// had never carried the doctor profile, qualification-document or stats calls.
// ─────────────────────────────────────────────────────────────────────────────

export interface DoctorProfileSettings {
  title:                     string | null
  specialty_id:              string | null
  level:                     string | null
  bio:                       string | null
  qualification:             string | null
  years_experience:          number | null
  virtual_fee:                number | null
  home_visit_fee:             number | null
  accepts_direct_virtual:     boolean
  accepts_direct_home_visit:  boolean
  show_phone_to_patients:     boolean
}

async function authHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const jwt = session?.access_token
  if (!jwt) return null
  return { Authorization: `Bearer ${jwt}` }
}

export interface DoctorStats {
  avgConsultSecs: number | null
  avgRatingOutOf10: number | null
  reviewCount: number
  total: number
  completed: number
}

// Hospital-affiliated doctors only -- GET /api/doctors/me requires caller.doctorId,
// which is null for a doctor with no hospital link at all (see requireRole/CallerInfo).

export interface QualificationDocument { id: string; title: string; uploadedAt: string; url: string | null }

export async function deleteQualificationDocument(id: string): Promise<string | null> {
  const headers = await authHeader()
  if (!headers) return 'Not authenticated'
  const res = await fetch(`${API_URL}/api/doctors/qualifications/${id}`, { method: 'DELETE', headers })
  if (!res.ok) { const body = await res.json().catch(() => ({})); return body?.error ?? 'Delete failed' }
  return null
}

// ── Direct-booking appointment review (doctor-side) ───────────────────────────

export async function getDoctorProfileSettings(): Promise<DoctorProfileSettings | null> {
  const headers = await authHeader()
  if (!headers) return null
  const res = await fetch(`${API_URL}/api/doctors/profile`, { headers })
  if (!res.ok) return null
  const { profile } = await res.json()
  return profile
}

// Hospital-affiliated doctors only -- GET /api/doctors/me requires caller.doctorId,
// which is null for a doctor with no hospital link at all (see requireRole/CallerInfo).
export async function getMyDoctorStats(): Promise<DoctorStats | null> {
  const headers = await authHeader()
  if (!headers) return null
  const res = await fetch(`${API_URL}/api/doctors/me`, { headers })
  if (!res.ok) return null
  return (await res.json()) as DoctorStats
}

export interface DoctorClinicOption { clinicId: string; clinicName: string }

// The caller's own assigned-clinics pool at their currently-active hospital,
// plus which one is active -- drives DoctorHospitalsScreen's clinic
// switcher. See doctor_clinics (20260903000001).
export async function getMyDoctorClinics(): Promise<{ activeClinicId: string | null; clinics: DoctorClinicOption[] } | null> {
  const headers = await authHeader()
  if (!headers) return null
  const res = await fetch(`${API_URL}/api/doctors/me/clinics`, { headers })
  if (!res.ok) return null
  return await res.json()
}

// Self-service "Set Active" -- the doctor's own equivalent of a hospital
// staff/admin's "Set Active" action in the clinic's doctor list. Doctor must
// already be assigned to clinicId.
export async function switchMyActiveClinic(clinicId: string): Promise<string | null> {
  const headers = await authHeader()
  if (!headers) return 'Not authenticated'
  const res = await fetch(`${API_URL}/api/doctors/me/clinic`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicId }),
  })
  if (!res.ok) { const body = await res.json().catch(() => ({})); return body?.error ?? 'Could not switch clinic' }
  return null
}

export async function getQualificationDocuments(): Promise<QualificationDocument[]> {
  const headers = await authHeader()
  if (!headers) return []
  const res = await fetch(`${API_URL}/api/doctors/qualifications`, { headers })
  if (!res.ok) return []
  const { documents } = await res.json()
  return documents
}

export async function reviewDirectAppointment(
  appointmentId: string,
  action: { action: 'approve' } | { action: 'reject'; reason: string } | { action: 'start' }
    | { action: 'complete'; diagnosis?: string; doctorNotes?: string } | { action: 'cancel'; reason: string },
): Promise<string | null> {
  const headers = await authHeader()
  if (!headers) return 'Not authenticated'
  const res = await fetch(`${API_URL}/api/appointments/direct/${appointmentId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  })
  if (!res.ok) { const body = await res.json().catch(() => ({})); return body?.error ?? 'Action failed' }
  return null
}

export async function updateDoctorProfileSettings(fields: Partial<DoctorProfileSettings>): Promise<string | null> {
  const headers = await authHeader()
  if (!headers) return 'Not authenticated'
  const res = await fetch(`${API_URL}/api/doctors/profile`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) { const body = await res.json().catch(() => ({})); return body?.error ?? 'Failed to save settings' }
  return null
}

export async function uploadQualificationDocument(
  title: string, uri: string, name: string, mimeType: string,
): Promise<string | null> {
  const headers = await authHeader()
  if (!headers) return 'Not authenticated'

  const form = new FormData()
  form.append('title', title)
  // React Native's fetch/FormData accepts this { uri, name, type } shape directly
  // for a file picked via expo-document-picker/expo-image-picker -- it is not a
  // real web File object, but RN's FormData polyfill knows how to serialize it.
  form.append('file', { uri, name, type: mimeType } as any)

  const res = await fetch(`${API_URL}/api/doctors/qualifications`, {
    method: 'POST',
    headers, // no Content-Type -- fetch sets the multipart boundary itself
    body: form,
  })
  if (!res.ok) { const body = await res.json().catch(() => ({})); return body?.error ?? 'Upload failed' }
  return null
}
