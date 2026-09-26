import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CallerInfo } from '@/lib/supabase/auth-server'

/**
 * The ambulance_providers row the caller manages -- hospital-owned and
 * independent providers work identically here now (both register through
 * POST /api/ambulances/register and are managed by their own
 * ambulance_provider_admins account, never through hospital_admins), so this
 * is just the caller's own providerId. Kept as a small named function rather
 * than inlining `caller.providerId` at every call site so the "ambulance
 * management is ambulance_admin-only" invariant has one place to read.
 */
export async function resolveProviderId(
  caller: Pick<CallerInfo, 'role' | 'providerId'>,
  _db: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  return caller.role === 'ambulance_admin' ? (caller.providerId ?? null) : null
}

/** True if the given ambulance belongs to the given provider. */
export async function assertOwnAmbulance(
  db: ReturnType<typeof createAdminClient>,
  ambulanceId: string,
  providerId: string,
): Promise<boolean> {
  const { data } = await db.from('ambulances').select('provider_id').eq('id', ambulanceId).maybeSingle()
  return data?.provider_id === providerId
}

/** True if the given shift belongs to an ambulance owned by the given provider. */
export async function assertOwnShift(
  db: ReturnType<typeof createAdminClient>,
  shiftId: string,
  providerId: string,
): Promise<boolean> {
  const { data: shift } = await db.from('ambulance_shifts')
    .select('id, ambulances!inner(provider_id)')
    .eq('id', shiftId)
    .single()
  const ambulance = shift ? (Array.isArray(shift.ambulances) ? shift.ambulances[0] : shift.ambulances) : null
  return !!ambulance && (ambulance as { provider_id: string }).provider_id === providerId
}
