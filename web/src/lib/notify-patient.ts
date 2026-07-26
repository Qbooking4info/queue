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

// Shared by the appointments PATCH route and the front-desk server actions so
// both approve/reject paths (web queue page, front-desk page, mobile) notify
// the patient the same way instead of each reimplementing it.
export async function notifyPatient(
  db: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  type: 'confirmed' | 'cancelled',
  title: string,
  body: string,
) {
  try {
    const { data: appt } = await db.from('appointments').select('patient_id, booking_ref').eq('id', appointmentId).single()
    if (!appt?.patient_id) return

    const { data: patient } = await db.from('users').select('push_token').eq('id', appt.patient_id).single()

    await (db as any).from('notifications').insert({
      user_id: appt.patient_id,
      type,
      title,
      body,
      data: { appointment_id: appointmentId, booking_ref: appt.booking_ref },
      is_read: false,
      sent_via: ['in_app'],
    })

    const pushToken = (patient as any)?.push_token
    if (pushToken) await sendExpoPush(pushToken, title, body, { appointment_id: appointmentId })
  } catch { /* best-effort — never block the approval/rejection action */ }
}
