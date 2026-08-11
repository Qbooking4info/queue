import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { roadEta } from './eta'

type Db = ReturnType<typeof createAdminClient>

/**
 * Keep the ETA on an active job honest as the unit moves.
 *
 * `transport_requests.eta_seconds` was written once, at dispatch, from the
 * straight-line estimate used to rank candidates — and never touched again. A
 * patient watching the tracking screen therefore saw the same number for the
 * entire journey: right at the moment of matching, increasingly a lie
 * afterwards, and still showing "8 min" when the ambulance was at the door.
 * `eta_updated_at` existed in the schema for this and had no writer.
 *
 * Recomputed here on the unit's own location pings, which is the only moment
 * new information arrives.
 *
 * WHICH DESTINATION. Before pickup the ETA the patient cares about is
 * unit → them. Once the patient is aboard ('transporting') the meaningful
 * number is unit → hospital, and that is what both screens then show. The
 * status is the switch.
 */

/**
 * Recompute at most this often per request. A crew app pinging every few
 * seconds would otherwise mean a paid routing call every few seconds per active
 * job, and road ETA does not meaningfully change in 5 seconds of driving.
 */
const MIN_RECOMPUTE_INTERVAL_MS = 25_000

const PRE_PICKUP = ['matched', 'en_route_to_patient', 'on_scene']

export async function refreshEtaForUnit(
  db: Db,
  ambulanceId: string,
  unitPos: { lat: number; lng: number },
): Promise<void> {
  const { data: request } = await db
    .from('transport_requests')
    .select('id, status, eta_updated_at, destination_hospital_id, pickup_point')
    .eq('assigned_unit_id', ambulanceId)
    .in('status', ['matched', 'en_route_to_patient', 'on_scene', 'transporting'])
    .maybeSingle()

  if (!request) return

  const r = request as unknown as {
    id: string
    status: string
    eta_updated_at: string | null
    destination_hospital_id: string | null
  }

  const last = r.eta_updated_at ? Date.parse(r.eta_updated_at) : 0
  if (Number.isFinite(last) && Date.now() - last < MIN_RECOMPUTE_INTERVAL_MS) return

  const target = PRE_PICKUP.includes(r.status)
    ? await patientTarget(db, r.id)
    : await hospitalTarget(db, r.destination_hospital_id)

  if (!target) return

  const eta = await roadEta(unitPos, target)

  await db.from('transport_requests')
    .update({ eta_seconds: eta.seconds, eta_updated_at: new Date().toISOString() } as never)
    .eq('id', r.id)
}

/**
 * Where the patient actually is: their live position if they are sharing one,
 * otherwise the pickup point captured at booking. The live position is
 * preferred precisely because the static pin is the thing that goes stale — a
 * caller who walked out to the road is no longer where they booked from.
 */
async function patientTarget(db: Db, requestId: string): Promise<{ lat: number; lng: number } | null> {
  const { data: live } = await db.rpc('get_request_patient_latlng', { p_request_id: requestId })
  const row = (live as Array<{ lat: number; lng: number }> | null)?.[0]
  if (row && Number.isFinite(row.lat) && Number.isFinite(row.lng)) return { lat: row.lat, lng: row.lng }

  const { data: pickup } = await db.rpc('get_request_pickup_latlng', { p_request_id: requestId })
  const p = (pickup as Array<{ lat: number; lng: number }> | null)?.[0]
  if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return { lat: p.lat, lng: p.lng }

  return null
}

async function hospitalTarget(db: Db, hospitalId: string | null): Promise<{ lat: number; lng: number } | null> {
  if (!hospitalId) return null
  const { data } = await db.from('hospitals').select('latitude, longitude').eq('id', hospitalId).maybeSingle()
  const h = data as { latitude: number | null; longitude: number | null } | null
  if (!h?.latitude || !h?.longitude) return null
  return { lat: h.latitude, lng: h.longitude }
}
