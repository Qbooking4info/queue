import 'server-only'

/**
 * Patient-facing SMS, for the few messages that must reach someone who is not
 * looking at the app.
 *
 * Deliberately a thin generic gateway POST rather than a Termii or Africa's Talking
 * SDK: that is exactly the shape dispatch/alert-relay.ts already uses to page
 * dispatchers, so one gateway configuration serves both and there is one place to
 * swap providers. Configure PATIENT_SMS_URL (and optionally PATIENT_SMS_TOKEN) to
 * point at whichever provider you contract.
 *
 * Returns false when unconfigured rather than throwing, so callers can record
 * honestly that SMS was not sent instead of logging a success that never happened.
 */
export function patientSmsConfigured(): boolean {
  return Boolean(process.env.PATIENT_SMS_URL)
}

const TIMEOUT_MS = 8000

export async function sendPatientSms(to: string, message: string): Promise<boolean> {
  const url = process.env.PATIENT_SMS_URL
  if (!url || !to) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PATIENT_SMS_TOKEN
          ? { Authorization: `Bearer ${process.env.PATIENT_SMS_TOKEN}` }
          : {}),
      },
      // Single segment where possible. SMS bills per 160 characters and a message
      // nobody finishes reading is no better than one nobody receives.
      body: JSON.stringify({ to: [to], message: message.slice(0, 300) }),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn('[patient-sms] gateway returned', res.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[patient-sms] send failed', e)
    return false
  } finally {
    clearTimeout(timer)
  }
}
