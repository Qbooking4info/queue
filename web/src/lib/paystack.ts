import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Paystack client.
 *
 * Deliberately thin — initialize, verify, and webhook signature checking are the
 * only three things this needs, and each has a security property worth stating:
 *
 *  · initialize  — the amount comes from lib/fees.ts, never from a request body
 *  · verify      — the ONLY way a payment is believed. A client returning from
 *                  checkout saying "success" proves nothing; anyone can call
 *                  that endpoint.
 *  · webhook     — HMAC SHA512 of the raw body with the secret key, compared in
 *                  constant time. An unsigned webhook endpoint is an open API
 *                  for marking arbitrary appointments paid.
 *
 * Verify these against Paystack's current documentation before going live. The
 * shapes below match a long-stable API, but payment integrations are the wrong
 * place to trust anyone's memory.
 */

const BASE = 'https://api.paystack.co'

export function paystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY
}

function secret(): string {
  const k = process.env.PAYSTACK_SECRET_KEY
  if (!k) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return k
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.status === false) {
    throw new Error(body?.message ?? `Paystack ${path} failed (${res.status})`)
  }
  return body.data as T
}

export interface InitializeResult {
  authorization_url: string
  access_code: string
  reference: string
}

/**
 * Start a transaction.
 *
 * `amountKobo` must come from resolveAppointmentFee(). `subaccount` routes the
 * hospital's share directly to them; `transaction_charge` is Queue's cut in
 * kobo, taken off the top before the subaccount is paid.
 */
export async function initializeTransaction(args: {
  email: string
  amountKobo: number
  reference: string
  subaccount?: string | null
  platformFeeKobo?: number
  callbackUrl?: string
  metadata?: Record<string, unknown>
}): Promise<InitializeResult> {
  const payload: Record<string, unknown> = {
    email: args.email,
    amount: args.amountKobo,
    reference: args.reference,
    currency: 'NGN',
    metadata: args.metadata ?? {},
  }
  if (args.callbackUrl) payload.callback_url = args.callbackUrl
  if (args.subaccount) {
    payload.subaccount = args.subaccount
    // bearer 'account' = Queue pays the Paystack transaction fee out of its own
    // cut rather than deducting it from the hospital's consultation fee.
    payload.bearer = 'account'
    if (args.platformFeeKobo != null) payload.transaction_charge = args.platformFeeKobo
  }

  return call<InitializeResult>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface VerifyResult {
  status: string          // 'success' | 'failed' | 'abandoned' | ...
  reference: string
  amount: number          // kobo
  currency: string
  paid_at: string | null
  channel: string | null
  metadata: Record<string, unknown> | null
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  return call<VerifyResult>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

/**
 * Verify a webhook came from Paystack.
 *
 * Must be given the RAW request body — re-serialising parsed JSON changes the
 * bytes and the signature will never match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', secret()).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Namespaced so references are recognisable in the Paystack dashboard.
 *
 * Random suffix, not just a timestamp: Date.now() has millisecond resolution, so
 * two initialisations in the same millisecond produced an identical reference —
 * and payments.paystack_ref is UNIQUE, so the second insert would fail and the
 * patient would be told the payment could not be started. Same defect the mobile
 * booking refs had (QUE-/OPD-/RSC- via Date.now().slice(-6)).
 */
export function buildReference(appointmentId: string): string {
  const rand = randomBytes(5).toString('hex').toUpperCase()
  return `QUE-${appointmentId.slice(0, 8)}-${rand}`
}
