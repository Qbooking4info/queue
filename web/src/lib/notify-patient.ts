import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendExpoPush } from '@/lib/push'
import { sendPatientSms, patientSmsConfigured } from '@/lib/patient-sms'

type Db = ReturnType<typeof createAdminClient>

// users.push_token and users.phone are absent from the generated database
// types (web/src/types/database.ts is behind the live schema), so the rows
// come back without them. Naming the shape once here beats an `any` cast at
// every read of them.
interface Contactable {
  full_name?: string | null
  push_token?: string | null
  phone?: string | null
}

interface Recipient {
  userId: string
  title: string
  pushToken: string | null
  phone: string | null
  notificationId?: string
}

/**
 * Delivers one notification to one person over every channel it is allowed to
 * use, and reports back which ones actually worked.
 *
 * Push alone is not a delivery guarantee. A token goes stale when the app is
 * reinstalled or the OS evicts it, and over a third of Nigerian mobile
 * subscribers were still on 2G as of May 2026, where a data push may never
 * arrive at all while SMS does. For a message the patient can afford to miss
 * that is acceptable. For "the doctor is ready for you" it is a missed
 * appointment, so those callers pass critical: true and we text anyone the
 * push did not reach.
 *
 * SMS is a fallback, not a duplicate: we only pay for it when push did not
 * land, so the ordinary case (a live token) costs nothing extra.
 */
async function deliver(
  db: Db,
  r: Recipient,
  body: string,
  data: Record<string, unknown>,
  opts: { channelId?: string; critical?: boolean },
): Promise<string[]> {
  const via = ['in_app']

  const pushed = r.pushToken
    ? await sendExpoPush(db, r.userId, r.pushToken, r.title, body, data,
        opts.channelId ? { channelId: opts.channelId } : undefined)
    : false
  if (pushed) via.push('push')

  if (!pushed && opts.critical && r.phone && patientSmsConfigured()) {
    // Named, so a patient who has put their phone down knows who is texting
    // them. Kept to one SMS segment by patient-sms itself.
    if (await sendPatientSms(r.phone, `Queue: ${r.title}. ${body}`)) via.push('sms')
  }

  return via
}

// Records what each channel actually did, instead of the optimistic ['in_app']
// the insert starts with. The emergency-fallback cron already treats sent_via
// as the truth about delivery; this keeps that contract honest for queue
// events too, and is the only way to tell later whether a patient who never
// arrived was ever actually reached.
async function recordDelivery(db: Db, notificationId: string, via: string[]) {
  if (via.length <= 1) return
  await db.from('notifications')
    .update({ sent_via: via, sent_at: new Date().toISOString() } as never)
    .eq('id', notificationId)
}

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
  db: Db,
  appointmentId: string,
  type: string,
  title: string,
  body: string,
  /**
   * channelId -- Android notification channel. Omitted, the push lands on the
   * default channel, which is right for an approval or a reminder. A patient
   * being called in to a consulting room needs the ringing channel instead.
   *
   * critical -- fall back to SMS when the push does not land. Reserve it for
   * the messages whose whole value is that they arrive within minutes.
   */
  opts?: { channelId?: string; critical?: boolean },
) {
  try {
    const { data: appt } = await db.from('appointments').select('patient_id, booking_ref').eq('id', appointmentId).single()
    if (!appt?.patient_id) return

    const { data: row } = await db.from('users').select('full_name, push_token, phone').eq('id', appt.patient_id).single()
    const patient = row as Contactable | null

    const { data: link } = await db.from('dependent_links')
      .select('caretaker_id, caretaker:users!dependent_links_caretaker_id_fkey(push_token, phone)')
      .eq('dependent_id', appt.patient_id)
      .eq('status', 'active')
      .maybeSingle()

    const recipients: Recipient[] = [{
      userId: appt.patient_id,
      title,
      pushToken: patient?.push_token ?? null,
      phone: patient?.phone ?? null,
    }]
    if (link?.caretaker_id) {
      // Labelled with the dependent's name so it reads correctly for the
      // caretaker -- the original title/body are written in second person
      // ("... is ready for you"), which is only true for the dependent.
      const firstName = patient?.full_name?.split(' ')[0] || 'Your dependent'
      const caretaker = (link as { caretaker?: Contactable | null }).caretaker
      recipients.push({
        userId: link.caretaker_id,
        title: `${firstName}: ${title}`,
        pushToken: caretaker?.push_token ?? null,
        phone: caretaker?.phone ?? null,
      })
    }

    const { data: inserted } = await db.from('notifications').insert(
      recipients.map(r => ({
        user_id: r.userId,
        type,
        title: r.title,
        body,
        data: { appointment_id: appointmentId, booking_ref: appt.booking_ref },
        is_read: false,
        sent_via: ['in_app'],
      })) as never,
    ).select('id, user_id')

    for (const row of (inserted ?? []) as { id: string; user_id: string }[]) {
      const r = recipients.find(x => x.userId === row.user_id)
      if (r) r.notificationId = row.id
    }

    await Promise.all(recipients.map(async r => {
      const via = await deliver(db, r, body, { appointment_id: appointmentId }, opts ?? {})
      if (r.notificationId) await recordDelivery(db, r.notificationId, via)
    }))
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
 *
 * Critical: a virtual consultation the patient never joins is the same loss as
 * one they never walked into, and the doctor sits waiting either way.
 */
export async function notifyIncomingCall(
  db: Db,
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

    const { data: row } = await db
      .from('users')
      .select('push_token, phone')
      .eq('id', appt.patient_id)
      .single()
    const patient = row as Contactable | null

    const title = 'Incoming consultation'
    const body  = `${doctorName} is ready for your consultation`

    const { data: inserted } = await db.from('notifications').insert({
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
    } as never).select('id').maybeSingle()

    const via = await deliver(
      db,
      {
        userId: appt.patient_id,
        title,
        pushToken: patient?.push_token ?? null,
        phone: patient?.phone ?? null,
      },
      body,
      { call_appointment_id: appointmentId, doctor_name: doctorName, appointment_id: appointmentId },
      { channelId: 'queue-calls', critical: true },
    )
    if ((inserted as { id: string } | null)?.id) {
      await recordDelivery(db, (inserted as { id: string }).id, via)
    }
  } catch (e) {
    // Best-effort: never block the doctor from starting the call because the
    // patient's phone could not be reached.
    console.warn('[notifyIncomingCall] failed', { appointmentId, error: e instanceof Error ? e.message : e })
  }
}
