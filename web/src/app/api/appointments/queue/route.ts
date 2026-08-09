import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { safePatientName, calcAge, todayLocalDate } from '@/lib/dashboard-utils'

const QUEUE_SELECT = `
  id, booking_ref, appointment_date, start_time, status, type, reason,
  booking_mode, approval_status, urgency, symptom_description, approval_note,
  assigned_doctor_id, clinic_id, refund_pct, walkin_patient_name, walkin_patient_phone,
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

function mapQueueRow(a: any) {
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
    patient_name: isWalkin ? (a.walkin_patient_name ?? 'Walk-in') : safePatientName(a.patient?.full_name, 'Unknown'),
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

// GET /api/appointments/queue -- today's physical queue: appointments
// scheduled for today OR physically checked in today (a future-dated
// booking that walks in early joins today's queue). Replaces
// admin-api.ts's getQueueForToday (Task 15). Scope comes from the
// server-verified caller, same as GET /api/appointments.
export async function GET() {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  if (!caller.hospitalId) return Errors.forbidden()
  const hospitalId = caller.hospitalId
  const today = todayLocalDate()

  let doctorIds: string[] = []
  const clinicId = (caller.role === 'clinic_admin' || caller.role === 'front_desk') ? caller.clinicId : undefined
  if (clinicId) {
    const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', clinicId)
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
    scoped(db.from('appointments').select(QUEUE_SELECT)).eq('appointment_date', today),
    scoped(db.from('appointments').select(QUEUE_SELECT)).eq('check_in_date', today),
  ])

  const byId = new Map<string, any>()
  for (const row of (byAppointmentDate.data ?? []) as any[]) byId.set(row.id, row)
  for (const row of (byCheckIn.data ?? []) as any[]) byId.set(row.id, row)

  const appointments = Array.from(byId.values())
    .map(mapQueueRow)
    .sort((a, b) => {
      // Emergency appointments always sort first; within a tier, whoever has an actual
      // queue position (checked in) sorts by it, then everyone else falls back to start time.
      const aEmergency = a.urgency === 'emergency' ? 0 : 1
      const bEmergency = b.urgency === 'emergency' ? 0 : 1
      if (aEmergency !== bEmergency) return aEmergency - bEmergency
      const aPos = a.queue_position ?? Infinity
      const bPos = b.queue_position ?? Infinity
      if (aPos !== bPos) return aPos - bPos
      return a.start_time.localeCompare(b.start_time)
    })

  return NextResponse.json({ appointments })
}
