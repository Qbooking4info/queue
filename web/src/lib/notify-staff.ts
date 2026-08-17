import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

async function sendExpoPush(token: string, title: string, body: string, data?: Record<string, unknown>) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, data: data ?? {}, sound: 'default', priority: 'high' }),
    })
  } catch { /* best-effort */ }
}

// Notifies the assigned doctor's staff account that a new appointment has landed.
// Patient/hospital names are resolved here from appointmentId, not accepted from the
// caller -- trusting client-supplied name strings would let a caller inject arbitrary
// text into a real staff member's notification feed, attributed to a real booking.
// The route itself additionally requires auth and checks the caller actually owns
// the appointment (see api/appointments/notify-staff/route.ts) -- this function's
// own server-side composition is a second, independent layer on top of that.
export async function notifyStaff(db: ReturnType<typeof createAdminClient>, appointmentId: string) {
  try {
    const { data: appt } = await db
      .from('appointments')
      .select('doctor_id, booking_ref, patient_id, hospital_id, walkin_patient_name')
      .eq('id', appointmentId)
      .single()

    if (!appt?.doctor_id) return

    const [{ data: doctor }, { data: hospital }, { data: patient }] = await Promise.all([
      db.from('doctors').select('user_id').eq('id', appt.doctor_id).single(),
      appt.hospital_id
        ? db.from('hospitals').select('name').eq('id', appt.hospital_id).single()
        : Promise.resolve({ data: null }),
      appt.patient_id
        ? db.from('users').select('full_name').eq('id', appt.patient_id).single()
        : Promise.resolve({ data: null }),
    ])

    if (!doctor?.user_id) return

    const patientName = (patient as any)?.full_name ?? appt.walkin_patient_name ?? null
    const hospitalName = (hospital as any)?.name ?? null
    const title = 'New Appointment Booked'
    const body = patientName
      ? `${patientName} just booked an appointment${hospitalName ? ` at ${hospitalName}` : ''}.`
      : `A new appointment has been booked${hospitalName ? ` at ${hospitalName}` : ''}.`

    const { data: staffUser } = await db
      .from('users')
      .select('push_token')
      .eq('id', doctor.user_id)
      .single()

    await db.from('notifications').insert({
      user_id: doctor.user_id,
      type: 'confirmed',
      title,
      body,
      data: { appointment_id: appointmentId, booking_ref: appt.booking_ref },
      is_read: false,
      sent_via: ['in_app'],
    })

    const pushToken = (staffUser as any)?.push_token
    if (pushToken) await sendExpoPush(pushToken, title, body, { appointment_id: appointmentId })
  } catch { /* best-effort */ }
}
