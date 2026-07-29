import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/** True if the given shift belongs to an ambulance owned by the given hospital's fleet. */
export async function assertOwnShift(
  db: ReturnType<typeof createAdminClient>,
  shiftId: string,
  hospitalId: string,
): Promise<boolean> {
  const { data: shift } = await db.from('ambulance_shifts')
    .select('id, ambulances!inner(ambulance_providers!inner(hospital_id))')
    .eq('id', shiftId)
    .single()
  const ambulance = shift ? (Array.isArray(shift.ambulances) ? shift.ambulances[0] : shift.ambulances) : null
  const provider = ambulance ? (Array.isArray(ambulance.ambulance_providers) ? ambulance.ambulance_providers[0] : ambulance.ambulance_providers) : null
  return !!provider && provider.hospital_id === hospitalId
}
