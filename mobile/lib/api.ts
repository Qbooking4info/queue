import { supabase, publicDb } from './supabase'
import type { Hospital, Doctor, Appointment, TimeSlot } from '../types/database'

// ── Hospitals ────────────────────────────────────────────────────────────────

export type HospitalWithDoctors = Hospital & {
  doctors: Doctor[]
  // booking policy fields (new columns — may be null on older records)
  daily_booking_limit?: number | null
  approval_mode?: string | null
  requires_referral?: boolean | null
  opd_fee?: number | null
  clinic_model?: string | null
}

export async function getHospitals(search?: string): Promise<HospitalWithDoctors[]> {
  let query = publicDb
    .from('hospitals')
    .select('*, doctors(*, specialty:specialties!doctors_specialty_id_fkey(name, icon))')
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })

  if (search?.trim()) {
    query = query.ilike('name', `%${search.trim()}%`)
  }

  const { data } = await query
  return (data as any[]) ?? []
}

export async function getHospitalById(id: string): Promise<HospitalWithDoctors | null> {
  const { data } = await publicDb
    .from('hospitals')
    .select('*, doctors(*, specialty:specialties!doctors_specialty_id_fkey(name, icon))')
    .eq('id', id)
    .single()
  return data as any
}

// ── Clinics ──────────────────────────────────────────────────────────────────

export type Clinic = {
  id:                  string
  hospital_id:         string
  name:                string
  description:         string | null
  is_opd:              boolean
  is_active:           boolean
  sort_order:          number | null
  daily_booking_limit: number | null
}

export async function getClinicsForHospital(hospitalId: string): Promise<Clinic[]> {
  const { data } = await publicDb
    .from('hospital_clinics')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data as Clinic[]) ?? []
}

// ── Doctors ──────────────────────────────────────────────────────────────────

export async function getDoctorsByHospital(hospitalId: string): Promise<Doctor[]> {
  const { data } = await publicDb
    .from('doctors')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })
  return data ?? []
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

// ── Daily booking count check ─────────────────────────────────────────────────

export async function getDailyBookingCount(
  hospitalId: string, date: string, clinicId?: string
): Promise<number> {
  const { data } = await publicDb.rpc('get_daily_booking_count', {
    p_hospital_id: hospitalId,
    p_date:        date,
    p_clinic_id:   clinicId ?? null,
  })
  return (data as number) ?? 0
}

// ── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentWithRelations = Appointment & {
  doctor:   Doctor   | null
  hospital: Hospital | null
  clinic:   Clinic   | null
}

export async function getPatientAppointments(
  patientId: string
): Promise<AppointmentWithRelations[]> {
  // Must use the authenticated supabase client so RLS can verify the user session
  const { data, error } = await supabase
    .from('appointments')
    .select('*, doctor:doctors!appointments_doctor_id_fkey(*, specialty:specialties!doctors_specialty_id_fkey(name, icon)), hospital:hospitals(*), clinic:hospital_clinics!appointments_clinic_id_fkey(*)')
    .eq('patient_id', patientId)
    .order('appointment_date', { ascending: false })
  if (error) console.warn('[getPatientAppointments]', error.message, error.details)
  return (data as any[]) ?? []
}

export async function getNextAppointment(
  patientId: string
): Promise<AppointmentWithRelations | null> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('appointments')
    .select('*, doctor:doctors!appointments_doctor_id_fkey(*, specialty:specialties!doctors_specialty_id_fkey(name, icon)), hospital:hospitals(*), clinic:hospital_clinics!appointments_clinic_id_fkey(*)')
    .eq('patient_id', patientId)
    .gte('appointment_date', today)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_date', { ascending: true })
    .order('start_time',       { ascending: true })
    .limit(1)
    .single()
  return data as any
}

// ── Create appointment (doctor-specific / virtual) ────────────────────────────

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
}): Promise<{ id: string; bookingRef: string; approvalStatus: string } | null> {
  const bookingRef     = `QUE-${Date.now().toString().slice(-6)}`
  const approvalStatus = payload.approvalMode === 'manual' ? 'pending_approval' : 'auto_approved'
  const status         = approvalStatus === 'auto_approved' ? 'pending' : 'pending'

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
    })
    .select('id, booking_ref')
    .single()

  if (error) { console.warn('[createAppointment]', error.message, error.code); return { error: error.message } as any }
  return { id: data.id, bookingRef: data.booking_ref, approvalStatus }
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
}): Promise<{ id: string; bookingRef: string; approvalStatus: string } | null> {
  const bookingRef     = `OPD-${Date.now().toString().slice(-6)}`
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
    })
    .select('id, booking_ref')
    .single()

  if (error) { console.warn('[createHospitalAppointment]', error.message, error.code); return { error: error.message } as any }
  return { id: data.id, bookingRef: data.booking_ref, approvalStatus }
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

// ── Reschedule appointment (within 48-hr no-show window) ─────────────────────

export async function rescheduleAppointment(payload: {
  originalId:  string
  patientId:   string
  hospitalId:  string
  doctorId?:   string
  date:        string
  startTime:   string
  reason:      string
}): Promise<{ id: string; bookingRef: string } | null> {
  const bookingRef = `RSC-${Date.now().toString().slice(-6)}`
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id:        payload.patientId,
      doctor_id:         payload.doctorId ?? null,
      hospital_id:       payload.hospitalId,
      appointment_date:  payload.date,
      start_time:        payload.startTime,
      type:              'in-person',
      reason:            payload.reason,
      status:            'pending',
      approval_status:   'auto_approved',
      booking_mode:      'hospital',
      booking_ref:       bookingRef,
      rescheduled_from:  payload.originalId,
      refund_pct:        100,
    })
    .select('id, booking_ref')
    .single()
  if (error) return null
  return { id: data.id, bookingRef: data.booking_ref }
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

// ── User profile ─────────────────────────────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  data: Partial<{ full_name: string; phone: string; gender: string; date_of_birth: string; blood_group: string; city: string; state: string; address: string }>
) {
  const { error } = await supabase.from('users').update(data).eq('id', userId)
  return !error
}

// ── Dependents ────────────────────────────────────────────────────────────────

export async function getDependents(userId: string) {
  const { data } = await supabase.from('dependents').select('*').eq('user_id', userId).order('full_name')
  return data ?? []
}

export async function addDependent(userId: string, payload: { full_name: string; relationship: string; date_of_birth?: string; gender?: string }) {
  const { data, error } = await supabase.from('dependents').insert({ user_id: userId, ...payload }).select('*').single()
  return error ? null : data
}

export async function updateDependent(id: string, payload: Partial<{ full_name: string; relationship: string; date_of_birth: string; gender: string }>) {
  const { error } = await supabase.from('dependents').update(payload).eq('id', id)
  return !error
}

export async function deleteDependent(id: string) {
  const { error } = await supabase.from('dependents').delete().eq('id', id)
  return !error
}

// ── Medical history ───────────────────────────────────────────────────────────

export async function getCompletedAppointments(patientId: string) {
  const { data } = await supabase
    .from('appointments')
    .select('*, doctor:doctors!appointments_doctor_id_fkey(*, specialty:specialties!doctors_specialty_id_fkey(name, icon)), hospital:hospitals(*), clinic:hospital_clinics!appointments_clinic_id_fkey(*)')
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
