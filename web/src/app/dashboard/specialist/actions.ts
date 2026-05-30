'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalContext } from '@/lib/getHospitalContext'

export async function saveAppointmentNotes(formData: FormData) {
  const { db, profile, adminRecord } = await getHospitalContext()
  if (adminRecord.role !== 'specialist' && adminRecord.role !== 'admin') throw new Error('Unauthorized')

  const appointmentId = formData.get('appointment_id') as string
  const newStatus = formData.get('status') as string

  // Verify this appointment belongs to this hospital and this doctor
  const admin = createAdminClient()
  const { data: doctor } = await db
    .from('doctors')
    .select('id')
    .eq('hospital_id', adminRecord.hospital_id)
    .eq('user_id', profile.id)
    .single()

  const { data: appt } = await admin
    .from('appointments')
    .select('id, status, doctor_id, hospital_id')
    .eq('id', appointmentId)
    .single()

  if (!appt) throw new Error('Appointment not found')
  if (appt.hospital_id !== adminRecord.hospital_id) throw new Error('Unauthorized')
  if (doctor && appt.doctor_id !== doctor.id) throw new Error('Unauthorized — not your patient')

  const updates = {
    diagnosis:        (formData.get('diagnosis') as string) || null,
    doctor_notes:     (formData.get('doctor_notes') as string) || null,
    prescription_url: (formData.get('prescription_url') as string) || null,
    updated_at:       new Date().toISOString(),
    ...(newStatus && newStatus !== appt.status ? { status: newStatus } : {}),
  }

  const { error } = await admin.from('appointments').update(updates).eq('id', appointmentId)
  if (error) throw new Error(error.message)

  revalidatePath(`/dashboard/specialist/${appointmentId}`)
  revalidatePath('/dashboard/specialist')
}
