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

export async function notifyStaff(
  db: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  title: string,
  body: string,
) {
  try {
    const { data: appt } = await db
      .from('appointments')
      .select('doctor_id, booking_ref, patient_id')
      .eq('id', appointmentId)
      .single()

    if (!appt?.doctor_id) return

    const { data: doctor } = await db
      .from('doctors')
      .select('user_id')
      .eq('id', appt.doctor_id)
      .single()

    if (!doctor?.user_id) return

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
