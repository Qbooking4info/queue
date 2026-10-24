import 'server-only'
import { createHash, randomInt, randomBytes, timingSafeEqual } from 'crypto'
import type { Channel } from '@/lib/otp-delivery'

/** Minutes a code stays usable. */
export const CODE_TTL_MINUTES = 10
/** Wrong guesses before the code is burned and a new one must be requested. */
export const MAX_ATTEMPTS = 5

/**
 * Six digits from a cryptographic source. Math.random() is predictable enough to
 * be guessable given a few observed codes, which for a code that gates account
 * creation is not acceptable.
 *
 * randomInt is uniform over the range; the modulo trick on random bytes is not,
 * and biases the leading digit.
 */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Codes are stored hashed and peppered. Hashed so a database read or a leaked
 * backup yields nothing usable; peppered with a server-side secret so an attacker
 * holding only the table cannot brute-force a six-digit space (a million SHA-256s
 * is seconds of work without one).
 *
 * Falls back to the service-role key as the pepper if OTP_PEPPER is unset — not
 * ideal, but a deployment that forgot one env var should still not be storing
 * codes a plain rainbow table would crack.
 */
function pepper(): string {
  return process.env.OTP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || 'queue-otp'
}

export function hashCode(code: string, destination: string): string {
  // Destination is mixed in so an identical code issued to two people produces
  // two different hashes, and a hash cannot be replayed against another account.
  return createHash('sha256').update(`${pepper()}:${destination}:${code}`).digest('hex')
}

/** Constant-time compare, so response timing cannot leak how much of a code matched. */
export function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Single-use token proving a destination was verified. */
export function generateClaimToken(): string {
  return randomBytes(32).toString('hex')
}

export interface Normalised {
  ok: boolean
  value: string
  error?: string
}

/**
 * Nigerian numbers are written four ways in practice — 0803…, 803…, 234803…,
 * +234803… — and all four are the same phone. Normalising to E.164 means one
 * person cannot hold four separate codes and four separate rate-limit budgets,
 * and that the number stored at registration matches the one verified.
 */
export function normaliseDestination(channel: Channel, raw: string): Normalised {
  const input = (raw ?? '').trim()
  if (!input) return { ok: false, value: '', error: 'Enter a destination.' }

  if (channel === 'email') {
    const value = input.toLowerCase()
    // Deliberately permissive: the real proof an address exists is that a code
    // sent to it comes back. Over-strict regexes reject valid addresses.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      return { ok: false, value, error: 'Enter a valid email address.' }
    }
    return { ok: true, value }
  }

  const digits = input.replace(/[^\d+]/g, '')
  let national: string | null = null
  if (/^\+234\d{10}$/.test(digits))      national = digits.slice(4)
  else if (/^234\d{10}$/.test(digits))   national = digits.slice(3)
  else if (/^0\d{10}$/.test(digits))     national = digits.slice(1)
  else if (/^\d{10}$/.test(digits))      national = digits

  if (!national) {
    return { ok: false, value: digits, error: 'Enter a valid Nigerian phone number, e.g. 0801 234 5678.' }
  }
  return { ok: true, value: `+234${national}` }
}
