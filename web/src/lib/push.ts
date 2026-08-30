import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Sends an Expo push notification and actually reports the outcome, unlike the
// swallow-everything try/catch this replaced (duplicated identically in
// notify-patient.ts and notify-staff.ts) -- a bad token, a missing FCM
// credential, and a network error all used to look identical to success.
// Clears the token when Expo reports the device is gone, so a dead token
// doesn't get retried on every future notification.
export async function sendExpoPush(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  // Android delivers sound/importance per notification channel, so a payload that
  // should ring has to name one. Omitted for everything else, which keeps the
  // existing default-channel behaviour untouched.
  opts?: { channelId?: string },
) {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
        priority: 'high',
        ...(opts?.channelId ? { channelId: opts.channelId } : {}),
      }),
    })
    const json = await res.json().catch(() => null)
    const ticket = json?.data
    if (!res.ok || ticket?.status === 'error') {
      console.warn('[sendExpoPush] delivery failed', { userId, httpStatus: res.status, ticket })
      if (ticket?.details?.error === 'DeviceNotRegistered') {
        await db.from('users').update({ push_token: null } as any).eq('id', userId)
      }
    }
  } catch (e) {
    console.warn('[sendExpoPush] request failed', { userId, error: e instanceof Error ? e.message : e })
  }
}
