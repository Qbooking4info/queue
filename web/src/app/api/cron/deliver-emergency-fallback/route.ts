import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendExpoPush } from '@/lib/push'
import { sendPatientSms, patientSmsConfigured } from '@/lib/patient-sms'

/**
 * Layer B of the emergency deadline: deliver "no ambulance available" OUT of the app.
 *
 * expire_overdue_searches() (20260810000002) writes that notification from pg_cron
 * and is deliberately free of any HTTP dependency, "so the promise holds when the
 * application tier is down". That is the right call and this route does not change
 * it — the in-app row is still written by SQL whatever happens here. What it could
 * not do is reach a patient who has already put their phone down, which is the
 * likeliest state for someone who has just been told to wait for an ambulance.
 *
 * So the escalation lives here instead: a sweep that finds those rows and pushes
 * and texts them. If this route never runs, the system degrades to exactly today's
 * behaviour rather than breaking.
 *
 * Idempotency comes from notifications.sent_via, which already exists and already
 * records 'in_app'. A channel is appended only after it actually succeeds, so a
 * retry re-attempts only what genuinely failed, and no new table or column is
 * needed to track delivery.
 */

export const dynamic = 'force-dynamic'

// Only sweep recent failures. Without this, the first run would text every patient
// whose request failed historically -- there are already dozens of such rows, and
// an ambulance alert for a request from last month is worse than useless.
const LOOKBACK_MINUTES = 60

// A phone that has never registered a push token cannot be reached that way, and
// an SMS that arrives after the emergency is over is noise. Both are bounded by
// the same window.
const MAX_PER_RUN = 50

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Refuse rather than run open when unset: this route reads patient phone numbers
  // and spends money on SMS.
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString()

  const { data: rows, error } = await db
    .from('notifications')
    .select('id, user_id, title, body, data, sent_via')
    .eq('type', 'transport')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The fallback flag is what the app itself keys on to raise the directory, so it
  // is the honest marker of "this is the message that must escape the app".
  const pending = (rows ?? []).filter(r => {
    const flagged = (r.data as Record<string, unknown> | null)?.show_emergency_fallback === true
    const via: string[] = Array.isArray(r.sent_via) ? r.sent_via : []
    return flagged && !(via.includes('push') && via.includes('sms'))
  })

  let pushed = 0, texted = 0, noToken = 0, noPhone = 0
  const smsReady = patientSmsConfigured()

  for (const n of pending) {
    const via: string[] = Array.isArray(n.sent_via) ? [...n.sent_via] : []
    const { data: user } = await db
      .from('users').select('push_token, phone').eq('id', n.user_id).single()

    if (!via.includes('push')) {
      if (user?.push_token) {
        const ok = await sendExpoPush(
          db, n.user_id, user.push_token, n.title, n.body,
          (n.data as Record<string, unknown>) ?? {},
        )
        if (ok) { via.push('push'); pushed++ }
      } else {
        noToken++
      }
    }

    if (smsReady && !via.includes('sms')) {
      if (user?.phone) {
        // Named so the recipient knows who is texting them mid-emergency.
        const ok = await sendPatientSms(user.phone, `Queue: ${n.body}`)
        if (ok) { via.push('sms'); texted++ }
      } else {
        noPhone++
      }
    }

    if (via.length !== (Array.isArray(n.sent_via) ? n.sent_via.length : 0)) {
      await db.from('notifications')
        .update({ sent_via: via, sent_at: new Date().toISOString() })
        .eq('id', n.id)
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    pending: pending.length,
    pushed,
    texted,
    skippedNoPushToken: noToken,
    skippedNoPhone: noPhone,
    smsConfigured: smsReady,
  })
}
