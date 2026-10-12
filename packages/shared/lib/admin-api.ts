import { supabase } from './supabase'

// Shared data layer for staff-facing mobile screens (frontdesk, specialist, admin/clinic
// dashboard) — mirrors the field selection and walk-in fallback rules used in
// web/src/lib/admin-api.ts so both platforms show the same numbers for the same hospital.

function safePatientName(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback
  if (name.includes('@')) return fallback
  return name
}

export function fmtLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface RangeStats {
  total: number
  completed: number
  cancelled: number
  pending: number
}

export async function getRangeStats(hospitalId: string, from: string, to: string, clinicId?: string | null): Promise<RangeStats> {
  const base = () => {
    let q = supabase.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to)
    if (clinicId) q = q.eq('clinic_id', clinicId)
    return q
  }
  const [totalRes, completedRes, cancelledRes] = await Promise.all([
    base(),
    base().eq('status', 'completed'),
    base().eq('status', 'cancelled'),
  ])
  const total     = totalRes.count ?? 0
  const completed = completedRes.count ?? 0
  const cancelled = cancelledRes.count ?? 0
  return { total, completed, cancelled, pending: total - completed - cancelled }
}

export interface AdminAppointmentRow {
  id: string
  booking_ref: string
  appointment_date: string
  start_time: string
  status: string
  type: string
  queue_position: number | null
  patient_name: string
  doctor_name: string
}

export async function getTodayAppointments(hospitalId: string, clinicId?: string | null): Promise<AdminAppointmentRow[]> {
  const today = fmtLocalDate(new Date())
  let query = supabase
    .from('appointments')
    .select('id, booking_ref, appointment_date, start_time, status, type, queue_position, booking_mode, walkin_patient_name, patient:users!appointments_patient_id_fkey(full_name), doctor:doctors!appointments_doctor_id_fkey(full_name), assigned_doctor:doctors!appointments_assigned_doctor_id_fkey(full_name)')
    .eq('hospital_id', hospitalId)
    .eq('appointment_date', today)
    .order('queue_position', { ascending: true, nullsFirst: false })
    .order('start_time')

  if (clinicId) query = query.eq('clinic_id', clinicId)

  const { data, error } = await query
  if (error || !data) return []
  return (data as any[]).map(a => {
    const isWalkin = a.booking_mode === 'walkin'
    return {
      id: a.id,
      booking_ref: a.booking_ref,
      appointment_date: a.appointment_date,
      start_time: (a.start_time ?? '').slice(0, 5),
      status: a.status,
      type: a.type,
      queue_position: a.queue_position ?? null,
      patient_name: isWalkin
        ? (a.walkin_patient_name ?? 'Walk-in Patient')
        : safePatientName(a.patient?.full_name, 'Unknown'),
      doctor_name: a.doctor?.full_name ?? a.assigned_doctor?.full_name ?? 'Unassigned',
    }
  })
}

export type DoctorAvailabilityStatus = 'on_duty' | 'on_break' | 'off_duty'
export type DoctorDisplayStatus = 'inactive' | DoctorAvailabilityStatus

export interface AdminDoctorRow {
  id: string
  full_name: string
  title: string | null
  specialty_name: string | null
  availability_status: DoctorAvailabilityStatus
  // 'inactive' covers both deactivated-at-this-hospital and "active, but
  // currently at a different hospital" -- see get_hospital_staff_roster
  // (supabase/migrations/20260914000001_doctor_display_status.sql). Only
  // on_duty may be assigned a patient.
  display_status: DoctorDisplayStatus
}

// Was a direct client-side `.from('doctors')` query -- switched to the same
// SECURITY DEFINER RPC StaffManagementScreen already uses so both mobile
// doctor lists get is_active/display_status from one place instead of this
// screen inventing its own (and never having them at all, previously).
export async function getDoctorsOnDuty(hospitalId: string, clinicId?: string | null): Promise<AdminDoctorRow[]> {
  const { data, error } = await supabase.rpc('get_hospital_staff_roster', { p_hospital_id: hospitalId })
  if (error || !data) return []
  let doctors = (data.doctors ?? []) as any[]
  if (clinicId) doctors = doctors.filter(d => d.clinic_id === clinicId)
  return doctors
    .map(d => ({
      id: d.id,
      full_name: d.full_name,
      title: d.title ?? null,
      specialty_name: d.specialty_name ?? null,
      availability_status: (d.availability_status ?? 'off_duty') as DoctorAvailabilityStatus,
      display_status: (d.display_status ?? 'inactive') as DoctorDisplayStatus,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
}
