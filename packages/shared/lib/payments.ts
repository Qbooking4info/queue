import * as WebBrowser from 'expo-web-browser'
import { supabase } from './supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

/**
 * Paystack checkout.
 *
 * The app never decides what to charge and never decides whether a payment
 * succeeded. It asks the server to start a transaction for an appointment id,
 * opens the returned checkout page, and then asks the server what happened.
 *
 * That second part matters: a client that reports its own success is trivially
 * spoofable, and returning from the browser only tells us the sheet closed — not
 * that money moved. The outcome always comes from a server-side Paystack verify.
 */

export type PaymentOutcome =
  | { status: 'success' }
  | { status: 'pending' }                       // paid, webhook not settled yet
  | { status: 'cancelled' }                     // user dismissed the sheet
  | { status: 'disabled'; reason: string }      // payments off, or hospital not onboarded
  | { status: 'error'; message: string }

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }
}

/**
 * Run the full flow for an appointment. Resolves only once the outcome is known.
 */
export async function payForAppointment(appointmentId: string): Promise<PaymentOutcome> {
  if (!API_URL) return { status: 'disabled', reason: 'Payments are not configured in this build' }

  let reference: string
  let url: string
  try {
    const res = await fetch(`${API_URL}/api/payments/initialize`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ appointmentId }),
    })
    const body = await res.json().catch(() => null)

    // 503 is the deliberate "payment is off" path — platform-wide or because
    // this hospital has no payout account. Not an error to show as a failure;
    // the booking is still valid and payable at the desk.
    if (res.status === 503) {
      return { status: 'disabled', reason: body?.error ?? 'Online payment is not available' }
    }
    if (body?.alreadyPaid) return { status: 'success' }
    if (!res.ok) return { status: 'error', message: body?.error ?? 'Could not start the payment' }

    reference = body.reference
    url = body.authorizationUrl
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Network error' }
  }

  try {
    const result = await WebBrowser.openAuthSessionAsync(url, `${API_URL}/payment/complete`)
    // 'cancel'/'dismiss' means the sheet closed — which does NOT prove the
    // payment failed. Someone can pay and then dismiss instead of waiting for
    // the redirect, so the reference is verified either way below.
    if (result.type !== 'success' && result.type !== 'cancel' && result.type !== 'dismiss') {
      return { status: 'error', message: 'Checkout could not be opened' }
    }
  } catch {
    return { status: 'error', message: 'Checkout could not be opened' }
  }

  return verifyPayment(reference)
}

/**
 * Ask the server what actually happened. Safe to call repeatedly — the server
 * short-circuits once a payment is recorded.
 */
export async function verifyPayment(reference: string): Promise<PaymentOutcome> {
  try {
    const res = await fetch(`${API_URL}/api/payments/verify`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ reference }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { status: 'error', message: body?.error ?? 'Could not verify the payment' }
    if (body.status === 'success') return { status: 'success' }
    // Abandoned checkouts stay open rather than being marked failed — the
    // patient can still complete them from the appointment screen.
    return { status: body.status === 'pending' ? 'pending' : 'cancelled' }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Network error' }
  }
}
