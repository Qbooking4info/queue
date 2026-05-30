'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalContext } from '@/lib/getHospitalContext'

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['checked_in', 'cancelled'],
  checked_in:  ['in_progress', 'cancelled'],
  in_progress: ['completed', 'no_show'],
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
  revalidatePath('/dashboard')
}
