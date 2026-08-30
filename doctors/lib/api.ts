// Trimmed from mobile/lib/api.ts -- doctor-app only keeps what the referral flow and
// push-token registration actually use (hospital/clinic directory lookups, operating
// hours, and createReferral). See mobile/lib/api.ts for the full patient-facing API;
// this file intentionally does not stay byte-for-byte in sync with it (same "can't
// share a module across app boundaries" tradeoff mobile/lib/api.ts already documents
// for the mobile/web split).
import { supabase, publicDb } from './supabase'
import type { Hospital, Doctor } from '../types/database'

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
// mdcn_accreditation. Keep in sync with web/src/lib/public-hospital-select.ts
// and mobile/lib/api.ts.
const DOCTOR_SELECT = 'id, full_name, title, qualification, bio, avatar_url, ' +
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

// Routed through a cached Next.js API route (60s edge cache) instead of
// querying Supabase directly -- falls back to a direct Supabase query if the
// API route is unreachable.
export async function getHospitals(search?: string): Promise<HospitalWithDoctors[]> {
  if (API_URL) {
    try {
      const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
      const res = await fetch(`${API_URL}/api/public/hospitals${qs}`)
      if (res.ok) return (await res.json()) as HospitalWithDoctors[]
    } catch {
      // fall through to direct query below
    }
  }

  let query = publicDb
    .from('hospitals')
    .select(HOSPITAL_SELECT)
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })

  if (search?.trim()) {
    query = query.ilike('name', `%${search.trim()}%`)
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

// ── Referrals ────────────────────────────────────────────────────────────────

export type BookingResult =
  | { ok: true; id: string; bookingRef: string; approvalStatus: string; originalCompleted?: boolean }
  | { ok: false; error: string }

// Goes through the server -- not a raw table insert -- because this writes an
// appointment at a hospital the caller doesn't belong to, which RLS wouldn't allow
// directly, and the server verifies the caller actually owns `appointmentId` before
// creating it. Identifying the patient by the appointment (not a patientId) is
// deliberate -- it's what lets a walk-in with no linked account be referred at all.
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

// ── Push notifications ────────────────────────────────────────────────────────

export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase.from('users').update({ push_token: token } as any).eq('id', userId)
  if (error) console.warn('[savePushToken] failed to save push token:', error.message)
}

// ── Doctor's own direct-booking settings ──────────────────────────────────────

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
export async function getMyDoctorStats(): Promise<DoctorStats | null> {
  const headers = await authHeader()
  if (!headers) return null
  const res = await fetch(`${API_URL}/api/doctors/me`, { headers })
  if (!res.ok) return null
  return (await res.json()) as DoctorStats
}

export async function getDoctorProfileSettings(): Promise<DoctorProfileSettings | null> {
  const headers = await authHeader()
  if (!headers) return null
  const res = await fetch(`${API_URL}/api/doctors/profile`, { headers })
  if (!res.ok) return null
  const { profile } = await res.json()
  return profile
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

export interface QualificationDocument { id: string; title: string; uploadedAt: string; url: string | null }

export async function getQualificationDocuments(): Promise<QualificationDocument[]> {
  const headers = await authHeader()
  if (!headers) return []
  const res = await fetch(`${API_URL}/api/doctors/qualifications`, { headers })
  if (!res.ok) return []
  const { documents } = await res.json()
  return documents
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

export async function deleteQualificationDocument(id: string): Promise<string | null> {
  const headers = await authHeader()
  if (!headers) return 'Not authenticated'
  const res = await fetch(`${API_URL}/api/doctors/qualifications/${id}`, { method: 'DELETE', headers })
  if (!res.ok) { const body = await res.json().catch(() => ({})); return body?.error ?? 'Delete failed' }
  return null
}

// ── Direct-booking appointment review (doctor-side) ───────────────────────────

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
