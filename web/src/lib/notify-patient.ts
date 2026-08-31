import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendExpoPush } from '@/lib/push'

// Shared by the appointments PATCH route and the front-desk server actions so
// both approve/reject paths (web queue page, front-desk page, mobile) notify
// the patient the same way instead of each reimplementing it.
//
// Also fans out to an active caretaker, if the appointment's patient is a
// linked dependent. A caretaker manages and pays for a dependent's bookings
// and is the one who actually needs to act on a ring/approval -- a
// notification that only ever reaches the dependent's own device is easy to
// miss for a child too young to carry a phone, or a relative who doesn't
// check theirs. This deliberately doesn't give the caretaker any way to sign
// into the dependent's account -- their own already-open app session already
// has its own push token and its own ring-alert subscription (both keyed on
// their own user id), so a second, clearly-labelled notification row
// addressed to them is all it takes; no shared credentials, no impersonation.
export async function notifyPatient(
  db: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  type: string,
  title: string,
  body: string,
) {
  try {
    const { data: appt } = await db.from('appointments').select('patient_id, booking_ref').eq('id', appointmentId).single()
    if (!appt?.patient_id) return

    const { data: patient } = await db.from('users').select('full_name, push_token').eq('id', appt.patient_id).single()

    const { data: link } = await db.from('dependent_links')
      .select('caretaker_id, caretaker:users!dependent_links_caretaker_id_fkey(push_token)')
      .eq('dependent_id', appt.patient_id)
      .eq('status', 'active')
      .maybeSingle()

    const recipients = [{ userId: appt.patient_id, title, pushToken: (patient as any)?.push_token ?? null }]
    if (link?.caretaker_id) {
      // Labelled with the dependent's name so it reads correctly for the
      // caretaker -- the original title/body are written in second person
      // ("... is ready for you"), which is only true for the dependent.
      const firstName = patient?.full_name?.split(' ')[0] || 'Your dependent'
      recipients.push({
        userId: link.caretaker_id,
        title: `${firstName}: ${title}`,
        pushToken: (link as any).caretaker?.push_token ?? null,
      })
    }

    await db.from('notifications').insert(
      recipients.map(r => ({
        user_id: r.userId,
        type,
        title: r.title,
        body,
        data: { appointment_id: appointmentId, booking_ref: appt.booking_ref },
        is_read: false,
        sent_via: ['in_app'],
      })) as never,
    )

    await Promise.all(recipients.map(r =>
      r.pushToken ? sendExpoPush(db, r.userId, r.pushToken, r.title, body, { appointment_id: appointmentId }) : null,
    ))
  } catch { /* best-effort — never block the approval/rejection action */ }
}

/**
 * Rings the patient when a doctor starts a virtual consultation.
 *
 * Separate from notifyPatient because the two differ in the ways that matter:
 * this one targets the 'queue-calls' Android channel so it actually rings, and it
 * carries call_appointment_id, which the mobile app routes straight into the call
 * screen instead of AppointmentDetail. Before this existed nothing was sent at all
 * -- the patient only discovered the call if they already happened to be sitting on
 * the consultation screen watching the Realtime subscription.
 */
export async function notifyIncomingCall(
  db: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  doctorName: string,
) {
  try {
    const { data: appt } = await db
      .from('appointments')
      .select('patient_id, booking_ref')
      .eq('id', appointmentId)
      .single()
    if (!appt?.patient_id) return

    const { data: patient } = await db
      .from('users')
      .select('push_token')
      .eq('id', appt.patient_id)
      .single()

    const title = 'Incoming consultation'
    const body  = `${doctorName} is ready for your consultation`

    await db.from('notifications').insert({
      user_id: appt.patient_id,
      type:    'virtual_call_started',
      title,
      body,
      data: {
        appointment_id: appointmentId,
        call_appointment_id: appointmentId,
        booking_ref: appt.booking_ref,
      },
      is_read: false,
      sent_via: ['in_app'],
    })

    const pushToken = (patient as any)?.push_token
    if (pushToken) {
      await sendExpoPush(
        db,
        appt.patient_id,
        pushToken,
        title,
        body,
        { call_appointment_id: appointmentId, doctor_name: doctorName, appointment_id: appointmentId },
        { channelId: 'queue-calls' },
      )
    }
  } catch (e) {
    // Best-effort: never block the doctor from starting the call because the
    // patient's phone could not be reached.
    console.warn('[notifyIncomingCall] failed', { appointmentId, error: e instanceof Error ? e.message : e })
  }
}
