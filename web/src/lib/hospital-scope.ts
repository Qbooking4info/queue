import type { createAdminClient } from '@/lib/supabase/admin'
import type { CallerInfo } from '@/lib/supabase/auth-server'

/**
 * Appointment scope for a staff caller: null for the whole hospital, or a
 * PostgREST `or` filter limiting rows to the caller's clinic (its own rows plus
 * any booked with its doctors). Same rule as /api/appointments/stats.
 */
export async function clinicOrFilter(db: ReturnType<typeof createAdminClient>, caller: CallerInfo): Promise<string | null> {
  if (!((caller.role === 'clinic_admin' || caller.role === 'front_desk') && caller.clinicId)) return null
  const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', caller.clinicId)
  const ids = (docs ?? []).map(d => d.id)
  return ids.length ? `clinic_id.eq.${caller.clinicId},doctor_id.in.(${ids.join(',')})` : `clinic_id.eq.${caller.clinicId}`
}

export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}
