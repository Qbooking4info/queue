import { supabase } from './supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

/**
 * Send a password-reset email that actually leads somewhere.
 *
 * Without redirectTo the link fell back to the Site URL (the web root), which bounced
 * the user to the staff login with no reset form — a patient who forgot their
 * password could not get back in. ?from=app tells /reset-password to send them back
 * to the app afterwards rather than into the hospital dashboard.
 *
 * Supabase answers the same for unknown and known emails, so surfacing an error here
 * (rate limit, network) reveals nothing about which accounts exist.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${API_URL}/reset-password?from=app`,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
