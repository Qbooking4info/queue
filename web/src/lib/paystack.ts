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
    // Who absorbs Paystack's cut.
    //   'account'    — Queue pays it out of the platform fee (default)
    //   'subaccount' — the hospital pays it out of the consultation fee
    // This is a margin decision, not a technical one, so it is configurable
    // without a deploy. At Paystack's local-card pricing the fee on a large
    // emergency booking can approach or exceed a flat ₦500 platform fee, at
    // which point 'account' means Queue is subsidising the transaction.
    payload.bearer = process.env.PAYSTACK_FEE_BEARER === 'subaccount' ? 'subaccount' : 'account'
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

// ---------------------------------------------------------------------------
// Subaccount onboarding
// ---------------------------------------------------------------------------

export interface Bank {
  name: string; code: string; slug: string
  active?: boolean; is_deleted?: boolean; supports_transfer?: boolean
}

/**
 * Nigerian banks Paystack can actually settle to.
 *
 * Filtered, not raw: the endpoint returns 279 institutions, 23 of which do not
 * support transfers. Offering those in the dropdown lets an admin pick a bank
 * that cannot receive settlements and only discover it when subaccount creation
 * fails — with no indication that the bank, rather than their account number,
 * was the problem. perPage is high enough to get them all in one call; the
 * default page size would silently truncate the list.
 */
export async function listBanks(): Promise<Bank[]> {
  const all = await call<Bank[]>('/bank?country=nigeria&perPage=300')
  return all
    .filter(b => b.active !== false && !b.is_deleted && b.supports_transfer !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Confirm an account number belongs to a real account, and return the name on
 * it.
 *
 * Shown to the admin for confirmation before the subaccount is created — a
 * transposed digit here means a hospital's revenue settles to a stranger, and
 * neither Paystack nor Queue would detect that after the fact.
 */
export async function resolveAccount(accountNumber: string, bankCode: string): Promise<{ account_number: string; account_name: string }> {
  return call<{ account_number: string; account_name: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  )
}

export interface Subaccount { subaccount_code: string; account_number: string; settlement_bank: string }

/**
 * Create the subaccount a hospital's share settles into.
 *
 * percentage_charge is 0 because the split is expressed per-transaction via
 * transaction_charge (a flat ₦500 platform fee) rather than as a percentage of
 * every consultation. Setting both would double-charge the hospital.
 */
export async function createSubaccount(args: {
  businessName: string
  bankCode: string
  accountNumber: string
  contactEmail?: string | null
}): Promise<Subaccount> {
  return call<Subaccount>('/subaccount', {
    method: 'POST',
    body: JSON.stringify({
      business_name: args.businessName,
      settlement_bank: args.bankCode,
      account_number: args.accountNumber,
      percentage_charge: 0,
      primary_contact_email: args.contactEmail ?? undefined,
    }),
  })
}
