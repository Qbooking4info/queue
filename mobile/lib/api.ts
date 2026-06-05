import { supabase, publicDb } from './supabase'
import type { Hospital, Doctor, Appointment, TimeSlot } from '../types/database'

// ── Hospitals ────────────────────────────────────────────────────────────────

export type HospitalWithDoctors = Hospital & { doctors: Doctor[] }

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

// ── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentWithRelations = Appointment & {
  doctor:   Doctor   | null
  hospital: Hospital | null
}

export async function getPatientAppointments(
  patientId: string
): Promise<AppointmentWithRelations[]> {
  const { data } = await publicDb
    .from('appointments')
    .select('*, doctor:doctors(*, specialty:specialties!doctors_specialty_id_fkey(name, icon)), hospital:hospitals(*)')
    .eq('patient_id', patientId)
    .order('appointment_date', { ascending: false })
  return (data as any[]) ?? []
}

export async function getNextAppointment(
  patientId: string
): Promise<AppointmentWithRelations | null> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await publicDb
    .from('appointments')
    .select('*, doctor:doctors(*, specialty:specialties!doctors_specialty_id_fkey(name, icon)), hospital:hospitals(*)')
    .eq('patient_id', patientId)
    .gte('appointment_date', today)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_date', { ascending: true })
    .order('start_time',       { ascending: true })
    .limit(1)
    .single()
  return data as any
}

export async function createAppointment(payload: {
  patientId:  string
  doctorId:   string
  hospitalId: string
  slotId:     string | null
  date:       string
  startTime:  string
  type:       'in-person' | 'virtual'
  reason:     string
  dependentId?: string
}): Promise<{ id: string; bookingRef: string } | null> {
  const bookingRef = `QUE-${Date.now().toString().slice(-5)}`
  const { data, error } = await publicDb
    .from('appointments')
    .insert({
      patient_id:       payload.patientId,
      doctor_id:        payload.doctorId,
      hospital_id:      payload.hospitalId,
      slot_id:          payload.slotId,
      appointment_date: payload.date,
      start_time:       payload.startTime,
      type:             payload.type,
      reason:           payload.reason,
      dependent_id:     payload.dependentId ?? null,
      status:           'pending',
      booking_ref:      bookingRef,
    })
    .select('id, booking_ref')
    .single()
  if (error) return null
  return { id: data.id, bookingRef: data.booking_ref }
}

export async function cancelAppointment(id: string, reason: string): Promise<boolean> {
  const { error } = await publicDb
    .from('appointments')
    .update({ status: 'cancelled', cancellation_reason: reason, cancelled_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(userId: string) {
  const { data } = await publicDb
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}

export async function markNotificationRead(id: string) {
  await publicDb.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllNotificationsRead(userId: string) {
  await publicDb.from('notifications').update({ is_read: true }).eq('user_id', userId)
}

// ── User profile ─────────────────────────────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  data: Partial<{ full_name: string; phone: string; gender: string; date_of_birth: string; blood_group: string; city: string; state: string; address: string }>
) {
  const { error } = await publicDb.from('users').update(data).eq('id', userId)
  return !error
}

// ── Dependents ────────────────────────────────────────────────────────────────

export async function getDependents(userId: string) {
  const { data } = await publicDb.from('dependents').select('*').eq('user_id', userId).order('full_name')
  return data ?? []
}

export async function addDependent(userId: string, payload: { full_name: string; relationship: string; date_of_birth?: string; gender?: string }) {
  const { data, error } = await publicDb.from('dependents').insert({ user_id: userId, ...payload }).select('*').single()
  return error ? null : data
}

export async function updateDependent(id: string, payload: Partial<{ full_name: string; relationship: string; date_of_birth: string; gender: string }>) {
  const { error } = await publicDb.from('dependents').update(payload).eq('id', id)
  return !error
}

export async function deleteDependent(id: string) {
  const { error } = await publicDb.from('dependents').delete().eq('id', id)
  return !error
}

// ── Completed appointments (for medical history) ──────────────────────────────

export async function getCompletedAppointments(patientId: string) {
  const { data } = await publicDb
    .from('appointments')
    .select('*, doctor:doctors(*, specialty:specialties!doctors_specialty_id_fkey(name, icon)), hospital:hospitals(*)')
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
