import 'server-only'

/**
 * Delivery of one-time codes over email or SMS.
 *
 * Provider-agnostic by design: adapters for Termii and Africa's Talking (the two
 * already named in dispatch/alert-relay.ts) plus a generic gateway, selected by
 * environment rather than code. Nothing is hard-wired to a vendor, so switching
 * costs a config change.
 *
 * WhatsApp is deliberately absent. It needs a Meta-verified business account and
 * approved message templates; offering a channel that silently fails is worse than
 * not offering it.
 *
 * Every path reports whether it actually sent. A verification flow that cannot
 * distinguish "delivered" from "no provider configured" will happily tell a patient
 * to check a phone that will never ring.
 */

export type Channel = 'email' | 'sms'

export interface DeliveryResult {
  sent: boolean
  /** Machine-readable reason when sent is false, for logs and honest UI copy. */
  reason?: 'not_configured' | 'provider_error' | 'invalid_destination'
  detail?: string
}

const TIMEOUT_MS = 10_000

async function post(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function smsText(code: string): string {
  // Under 160 characters so it bills as a single segment, and the code leads so it
  // is readable from a lock-screen preview without opening anything.
  return `${code} is your Queue verification code. It expires in 10 minutes. Do not share it with anyone.`
}

// ── SMS ─────────────────────────────────────────────────────────────────────

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TERMII_API_KEY
    || process.env.AT_API_KEY
    || process.env.PATIENT_SMS_URL,
  )
}

async function sendSms(to: string, code: string): Promise<DeliveryResult> {
  const text = smsText(code)

  // Termii first: it is Nigeria-local and its plain messaging endpoint keeps the
  // code in our own table rather than delegating OTP state to the vendor, which
  // keeps expiry and attempt limits under our control.
  if (process.env.TERMII_API_KEY) {
    try {
      const r = await post('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TERMII_API_KEY,
          to,
          from: process.env.TERMII_SENDER_ID ?? 'Queue',
          sms: text,
          type: 'plain',
          channel: 'generic',
        }),
      })
      if (!r.ok) return { sent: false, reason: 'provider_error', detail: `termii ${r.status}` }
      return { sent: true }
    } catch (e) {
      return { sent: false, reason: 'provider_error', detail: e instanceof Error ? e.message : 'termii failed' }
    }
  }

  if (process.env.AT_API_KEY && process.env.AT_USERNAME) {
    try {
      const body = new URLSearchParams({
        username: process.env.AT_USERNAME,
        to,
        message: text,
        ...(process.env.AT_SENDER_ID ? { from: process.env.AT_SENDER_ID } : {}),
      })
      const r = await post('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey: process.env.AT_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
      })
      if (!r.ok) return { sent: false, reason: 'provider_error', detail: `africastalking ${r.status}` }
      return { sent: true }
    } catch (e) {
      return { sent: false, reason: 'provider_error', detail: e instanceof Error ? e.message : 'at failed' }
    }
  }

  // Generic gateway, same shape as patient-sms.ts and the dispatcher alert relay.
  if (process.env.PATIENT_SMS_URL) {
    try {
      const r = await post(process.env.PATIENT_SMS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.PATIENT_SMS_TOKEN ? { Authorization: `Bearer ${process.env.PATIENT_SMS_TOKEN}` } : {}),
        },
        body: JSON.stringify({ to: [to], message: text }),
      })
      if (!r.ok) return { sent: false, reason: 'provider_error', detail: `gateway ${r.status}` }
      return { sent: true }
    } catch (e) {
      return { sent: false, reason: 'provider_error', detail: e instanceof Error ? e.message : 'gateway failed' }
    }
  }

  return { sent: false, reason: 'not_configured' }
}

// ── Email ───────────────────────────────────────────────────────────────────

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.OTP_EMAIL_URL)
}

async function sendEmail(to: string, code: string): Promise<DeliveryResult> {
  const subject = `${code} is your Queue verification code`
  const textBody =
    `Your Queue verification code is ${code}.\n\n`
    + `It expires in 10 minutes. If you did not request it, you can ignore this email — `
    + `no account has been created.\n\nDo not share this code with anyone.`

  if (process.env.RESEND_API_KEY) {
    try {
      const r = await post('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.OTP_EMAIL_FROM ?? 'Queue <noreply@queueapp.ng>',
          to: [to],
          subject,
          text: textBody,
        }),
      })
      if (!r.ok) return { sent: false, reason: 'provider_error', detail: `resend ${r.status}` }
      return { sent: true }
    } catch (e) {
      return { sent: false, reason: 'provider_error', detail: e instanceof Error ? e.message : 'resend failed' }
    }
  }

  if (process.env.OTP_EMAIL_URL) {
    try {
      const r = await post(process.env.OTP_EMAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.OTP_EMAIL_TOKEN ? { Authorization: `Bearer ${process.env.OTP_EMAIL_TOKEN}` } : {}),
        },
        body: JSON.stringify({ to, subject, text: textBody }),
      })
      if (!r.ok) return { sent: false, reason: 'provider_error', detail: `email gateway ${r.status}` }
      return { sent: true }
    } catch (e) {
      return { sent: false, reason: 'provider_error', detail: e instanceof Error ? e.message : 'email gateway failed' }
    }
  }

  return { sent: false, reason: 'not_configured' }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function channelConfigured(channel: Channel): boolean {
  return channel === 'sms' ? smsConfigured() : emailConfigured()
}

export async function deliverCode(channel: Channel, destination: string, code: string): Promise<DeliveryResult> {
  return channel === 'sms' ? sendSms(destination, code) : sendEmail(destination, code)
}
