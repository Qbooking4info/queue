import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Who is on a unit's crew right now — across BOTH crew identity paths.
 *
 * A shift crew row names its member one of two ways, enforced by the
 * `exactly_one_crew_identity` CHECK in
 * 20260730000001_hospital_owned_ambulance_crew.sql:
 *
 *   ambulance_shift_crew.crew_member_id    -> ambulance_crew  (third-party / marketplace)
 *   ambulance_shift_crew.hospital_admin_id -> hospital_admins (hospital-owned fleet)
 *
 * That migration taught the RLS policies and the crew RPCs about both. The API
 * routes were never updated: they embedded `ambulance_crew!inner`, which drops
 * every row where `crew_member_id` is NULL — i.e. every hospital-fleet crew.
 * Verified against production: of three live shifts, the authorization query
 * returned only the third-party one, and the dispatch engine resolved
 * `[null, null]` for the two hospital-fleet units.
 *
 * The effect was that hospital-fleet crew could sign in and see the app, but
 * were never notified of an offer, could not post a location ping (so their
 * unit never became visible to dispatch), and got "You are not on the crew for
 * this unit" if they tried to accept. The whole hospital-owned fleet feature
 * was inert on the crew side.
 *
 * Both call sites go through here now so the two paths cannot drift apart
 * again.
 */

const CREW_SELECT = `
  id,
  ambulance_id,
  ambulance_shift_crew (
    crew_member_id,
    hospital_admin_id,
    ambulance_crew ( user_id, is_active, users ( auth_id ) ),
    hospital_admins ( user_id, is_active, users ( auth_id ) )
  )
`

interface CrewRow {
  ambulance_crew?: { user_id: string | null; is_active: boolean | null; users?: { auth_id: string | null } | null } | null
  hospital_admins?: { user_id: string | null; is_active: boolean | null; users?: { auth_id: string | null } | null } | null
}

interface ShiftRow {
  id: string
  ambulance_id: string
  ambulance_shift_crew?: CrewRow[] | null
}

/** The two identities collapsed to what callers actually need. */
function membersOf(shift: ShiftRow): Array<{ userId: string | null; authId: string | null }> {
  return (shift.ambulance_shift_crew ?? [])
    .map(sc => sc.ambulance_crew ?? sc.hospital_admins ?? null)
    .filter((m): m is NonNullable<CrewRow['ambulance_crew']> => !!m && m.is_active === true)
    .map(m => ({ userId: m.user_id ?? null, authId: m.users?.auth_id ?? null }))
}

async function currentShifts(db: Db, ambulanceIds: string[]): Promise<ShiftRow[]> {
  const now = new Date().toISOString()
  const { data } = await db.from('ambulance_shifts')
    .select(CREW_SELECT)
    .in('ambulance_id', ambulanceIds)
    .lte('starts_at', now)
    .gte('ends_at', now)
  return (data ?? []) as unknown as ShiftRow[]
}

/**
 * Is this signed-in user on the current crew of this unit? The authorization
 * gate for accepting an offer and for posting location pings.
 */
export async function isOnShiftCrew(db: Db, ambulanceId: string, authId: string): Promise<boolean> {
  const shifts = await currentShifts(db, [ambulanceId])
  return shifts.some(s => membersOf(s).some(m => m.authId === authId))
}

/**
 * The `users.id` of everyone on shift for each of these units, so a dispatch
 * offer notification lands on a person rather than a vehicle.
 *
 * Returns every currently-open shift's crew, not just the first: a handover
 * window puts two overlapping shift rows on one ambulance, and taking one would
 * silently page only one of the two crews.
 */
export async function onShiftCrewUserIds(db: Db, ambulanceIds: string[]): Promise<Map<string, string[]>> {
  const shifts = await currentShifts(db, ambulanceIds)
  const byUnit = new Map<string, string[]>()
  for (const s of shifts) {
    const ids = membersOf(s).map(m => m.userId).filter((id): id is string => !!id)
    byUnit.set(s.ambulance_id, [...(byUnit.get(s.ambulance_id) ?? []), ...ids])
  }
  return byUnit
}
