import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Guards for /api/dependents/link and /switch. A link gives the caretaker the
// dependent's appointments and records (current_patient_ids()) and /switch mints
// a session for the dependent's account, so a link must never be created on the
// strength of a 6-character Patient ID alone:
//  - an adult links themselves (as=dependent, from their own signed-in account);
//  - a caretaker may claim only a minor's account by code;
//  - staff, doctor and platform-admin accounts are never linkable or switchable.

type Db = SupabaseClient<Database>

export const ADULT_SELF_LINK_MESSAGE =
  'Adults link their own account: ask them to open Dependents › Add a caretaker in their app and enter your Patient ID.'
export const PRIVILEGED_ACCOUNT_MESSAGE = 'This account cannot be managed by a caretaker.'

// Age in whole years on Lagos's calendar date (UTC+1, no DST).
export function ageOn(dateOfBirth: string, now: Date = new Date()): number {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000)
  const [y, m, d] = dateOfBirth.slice(0, 10).split('-').map(Number)
  let age = lagos.getUTCFullYear() - y
  const beforeBirthday = lagos.getUTCMonth() + 1 < m || (lagos.getUTCMonth() + 1 === m && lagos.getUTCDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

// Unknown date of birth is treated as an adult: the safe default for consent.
export function isMinor(dateOfBirth: string | null | undefined, now?: Date): boolean {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}/.test(dateOfBirth)) return false
  return ageOn(dateOfBirth, now) < 18
}

// Any staff/doctor/admin row, active or not. Doctors are keyed by users.id
// (user_id) on newer rows and by the auth id (auth_user_id) on older ones.
export async function isPrivilegedAccount(db: Db, userId: string, authId?: string | null): Promise<boolean> {
  const checks = [
    db.from('platform_admins').select('id').eq('user_id', userId).limit(1),
    db.from('hospital_admins').select('id').eq('user_id', userId).limit(1),
    db.from('clinic_admins').select('id').eq('user_id', userId).limit(1),
    db.from('doctors').select('id').eq('user_id', userId).limit(1),
  ]
  if (authId) checks.push(db.from('doctors').select('id').eq('auth_user_id', authId).limit(1))
  const results = await Promise.all(checks)
  return results.some(r => (r.data?.length ?? 0) > 0)
}
