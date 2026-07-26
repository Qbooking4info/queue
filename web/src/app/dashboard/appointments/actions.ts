'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { notifyPatient } from '@/lib/notify-patient'

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['checked_in', 'cancelled'],
  checked_in:  ['in_progress', 'cancelled'],
  in_progress: ['completed'],  // BL1: in_progress cannot be no-showed — consultation has already started
  completed:   [],
  cancelled:   [],
  no_show:     [],
}

export async function updateAppointmentStatus(appointmentId: string, newStatus: string) {
  const { adminRecord } = await getHospitalContext()
  const db = createAdminClient()

  const { data: appt, error: fetchErr } = await db
    .from('appointments')
    .select('status, hospital_id')
    .eq('id', appointmentId)
    .single()

  if (fetchErr || !appt) throw new Error('Appointment not found')
  if (appt.hospital_id !== adminRecord.hospital_id) throw new Error('Unauthorized')

  const allowed = VALID_TRANSITIONS[appt.status] ?? []
  if (!allowed.includes(newStatus)) throw new Error(`Cannot transition from ${appt.status} to ${newStatus}`)

  const { error, data: updated } = await db
    .from('appointments')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('status', appt.status)
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated?.length) throw new Error('Appointment status changed by someone else. Please refresh.')

  revalidatePath('/dashboard/appointments')
  revalidatePath('/dashboard/frontdesk')
  revalidatePath('/dashboard/specialist')
  revalidatePath('/dashboard')
}

// Used by FrontDeskActions to approve a pending_approval appointment -- mirrors
// the 'approve' action on PATCH /api/appointments/[id] (same guard + notification)
// since this page updates via a server action rather than that route.
export async function approvePendingApprovalAppointment(appointmentId: string) {
  const { adminRecord } = await getHospitalContext()
  const db = createAdminClient()

  const { data: appt, error: fetchErr } = await db
    .from('appointments')
    .select('booking_ref, appointment_date, hospital_id, hospital:hospitals!appointments_hospital_id_fkey(name), clinic:hospital_clinics!appointments_clinic_id_fkey(name)')
    .eq('id', appointmentId)
    .single()

  if (fetchErr || !appt) throw new Error('Appointment not found')
  if ((appt as any).hospital_id !== adminRecord.hospital_id) throw new Error('Unauthorized')

  const { error } = await db
    .from('appointments')
    .update({
      approval_status: 'approved', status: 'confirmed', updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .eq('approval_status', 'pending_approval')
    .not('status', 'in', '("cancelled","completed")')

  if (error) throw new Error(error.message)

  const hospitalName = (appt as any).hospital?.name ?? 'the hospital'
  const clinicName = (appt as any).clinic?.name
  const ref = appt.booking_ref ?? appointmentId
  const dateStr = appt.appointment_date
    ? new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
    : ''
  const notifBody = clinicName
    ? `Your booking (${ref}) at ${hospitalName} — ${clinicName} on ${dateStr} has been confirmed.`
    : `Your booking (${ref}) at ${hospitalName} on ${dateStr} has been confirmed.`
  await notifyPatient(db, appointmentId, 'confirmed', 'Booking Approved', notifBody)

  revalidatePath('/dashboard/appointments')
  revalidatePath('/dashboard/frontdesk')
  revalidatePath('/dashboard')
}

// Used by FrontDeskActions to cancel a pending_approval appointment via the reject flow
export async function rejectPendingApprovalAppointment(appointmentId: string) {
  const { adminRecord } = await getHospitalContext()
  const db = createAdminClient()

  const { data: appt, error: fetchErr } = await db
    .from('appointments')
    .select('status, approval_status, hospital_id, booking_ref, hospital:hospitals!appointments_hospital_id_fkey(name)')
    .eq('id', appointmentId)
    .single()

  if (fetchErr || !appt) throw new Error('Appointment not found')
  if (appt.hospital_id !== adminRecord.hospital_id) throw new Error('Unauthorized')

  const note = 'Cancelled from front desk'
  const { error } = await db
    .from('appointments')
    .update({
      status: 'cancelled',
      approval_status: 'rejected',
      approval_note: note,
      cancellation_reason: `Booking rejected: ${note}`,
      cancelled_at: new Date().toISOString(),
      refund_pct: 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)

  if (error) throw new Error(error.message)

  const ref = (appt as any).booking_ref ?? appointmentId
  const hospitalName = (appt as any).hospital?.name ?? 'the hospital'
  await notifyPatient(
    db, appointmentId, 'cancelled', 'Booking Not Approved',
    `Your booking (${ref}) at ${hospitalName} was not approved. Reason: ${note}. A full refund has been issued.`,
  )

  revalidatePath('/dashboard/appointments')
  revalidatePath('/dashboard/frontdesk')
  revalidatePath('/dashboard')
}
