import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Get a critical dispatcher alert to a human who is not looking at a dashboard.
 *
 * `dispatcher_alerts` is the designed backstop for "automation could not find an
 * ambulance". In production it has 12 rows and 9 have never been acknowledged,
 * the oldest from 30 July. The row is written faithfully; nobody reads it. A
 * backstop nobody is watching is decoration.
 *
 * So the alert goes out of the building. This is deliberately provider-agnostic
 * and configured by environment, because the right channel in Lagos is a
 * WhatsApp or SMS to whoever is on call, and that varies by operator:
 *
 *   DISPATCH_ALERT_WEBHOOK_URL   POST target (Slack/Teams/WhatsApp gateway/n8n)
 *   DISPATCH_ALERT_SMS_URL       optional SMS gateway (Termii, Africa's Talking)
 *   DISPATCH_ALERT_SMS_TOKEN     bearer token for the SMS gateway
 *   DISPATCH_ALERT_SMS_TO        comma-separated on-call numbers
 *
 * With nothing configured this is a no-op that logs — the alert row is still
 * written, exactly as before, so this can never make things worse than the
 * current state.
 *
 * Never throws. It is called from the dispatch path, and an alerting failure
 * must not take down the dispatch that triggered it.
 */

const TIMEOUT_MS = 4000

export interface DispatchAlert {
  requestId: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  kind: string
  message: string
  bookingRef?: string | null
  triageLevel?: number | null
  contactPhone?: string | null
}

export function alertRelayConfigured(): boolean {
  return Boolean(process.env.DISPATCH_ALERT_WEBHOOK_URL || process.env.DISPATCH_ALERT_SMS_URL)
}

async function postWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** One line a human can act on from a phone, without opening anything. */
export function formatAlert(a: DispatchAlert): string {
  const bits = [
    a.severity === 'critical' ? '🚨 CRITICAL' : '⚠️ ' + a.severity.toUpperCase(),
    a.bookingRef ? `[${a.bookingRef}]` : null,
    a.triageLevel ? `triage ${a.triageLevel}` : null,
    a.message,
    a.contactPhone ? `Patient: ${a.contactPhone}` : null,
  ].filter(Boolean)
  return bits.join(' · ')
}

export async function relayDispatchAlert(alert: DispatchAlert): Promise<void> {
  const text = formatAlert(alert)

  if (!alertRelayConfigured()) {
    // Loud in logs so the gap is visible in an incident review rather than
    // being discovered later from an unacknowledged alerts table.
    console.warn('[dispatch-alert] no relay configured, alert stays in-dashboard only:', text)
    return
  }

  const jobs: Promise<unknown>[] = []

  const webhook = process.env.DISPATCH_ALERT_WEBHOOK_URL
  if (webhook) {
    jobs.push(
      postWithTimeout(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `text` suits Slack/Teams/most gateways; the structured fields are
        // there for anything that would rather template its own message.
        body: JSON.stringify({ text, ...alert }),
      }).then(r => {
        if (!r.ok) console.warn('[dispatch-alert] webhook returned', r.status)
      }),
    )
  }

  const smsUrl = process.env.DISPATCH_ALERT_SMS_URL
  const smsTo = (process.env.DISPATCH_ALERT_SMS_TO ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (smsUrl && smsTo.length) {
    jobs.push(
      postWithTimeout(smsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.DISPATCH_ALERT_SMS_TOKEN
            ? { Authorization: `Bearer ${process.env.DISPATCH_ALERT_SMS_TOKEN}` }
            : {}),
        },
        // SMS is charged per 160 characters, and an alert nobody finishes
        // reading is no better than one nobody receives.
        body: JSON.stringify({ to: smsTo, message: text.slice(0, 300) }),
      }).then(r => {
        if (!r.ok) console.warn('[dispatch-alert] sms gateway returned', r.status)
      }),
    )
  }

  // allSettled: one dead channel must not stop the other, and neither may
  // propagate into the dispatch round that called this.
  const results = await Promise.allSettled(jobs)
  for (const r of results) {
    if (r.status === 'rejected') console.warn('[dispatch-alert] relay failed', r.reason)
  }
}

/**
 * Write the alert row AND push it to a human. One call so a future alert site
 * cannot accidentally do only the half that nobody reads.
 */
export async function raiseDispatchAlert(db: Db, alert: DispatchAlert): Promise<void> {
  await db.from('dispatcher_alerts').insert({
    request_id: alert.requestId,
    severity: alert.severity,
    kind: alert.kind,
    message: alert.message,
  } as never)

  await relayDispatchAlert(alert).catch(err =>
    console.warn('[dispatch-alert] relay threw', err),
  )
}
