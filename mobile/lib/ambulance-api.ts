/**
 * Queue — ambulance transport API (mobile)
 *
 * Follows the same shape as mobile/lib/api.ts: thin wrappers, Supabase client
 * for reads that RLS already scopes, authenticated fetch for writes that need
 * server-side checks.
 */

import { supabase } from './supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

export type TransportStatus =
  | 'requested' | 'scheduled' | 'searching' | 'matched'
  | 'en_route_to_patient' | 'on_scene' | 'transporting'
  | 'arrived_at_destination' | 'completed'
  | 'cancelled_by_requester' | 'cancelled_by_provider' | 'no_unit_available'

export interface TransportRequestRow {
  id: string
  booking_ref: string
  status: TransportStatus
  triage_level: number | null
  eta_seconds: number | null
  eta_updated_at: string | null
  assigned_unit_id: string | null
  destination_hospital_id: string | null
  pickup_address: string | null
  symptom_description: string | null
  created_at: string
  /**
   * When the server stops searching and declares no unit available. Stamped by
   * the transport_search_deadline trigger on insert (emergency only, hence
   * nullable). The client reads it so the countdown shown to the patient and
   * the server-side sweeper agree on one number instead of each hardcoding 60s
   * and silently drifting apart.
   */
  search_deadline_at: string | null
}

export interface CreateTransportInput {
  requestType?: 'emergency' | 'scheduled'
  triageLevel?: number
  lat: number
  lng: number
  pickupAddress?: string
  pickupNotes?: string
  contactPhone?: string
  symptomDescription?: string
  requiredTier?: 'PTS' | 'BLS' | 'ALS' | 'CCT'
  requiredCapabilities?: string[]
  dependentId?: string | null
  destinationHospitalId?: string | null
  scheduledFor?: string
  paymentMethod?: string
}

/**
 * Maps the symptom the patient already picked in EmergencyBookingScreen to a
 * triage level and required unit tier. Lives here, not in the screen, because
 * the crew app and dispatcher console need the same mapping.
 *
 * Patients must not set their own triage level directly — they will pick
 * "critical" every time, and if everything is critical, nothing is.
 */
export const SYMPTOM_TRIAGE_MAP: Record<string, { triageLevel: number; requiredTier: CreateTransportInput['requiredTier'] }> = {
  'Chest pain / difficulty breathing':  { triageLevel: 1, requiredTier: 'ALS' },
  'Stroke symptoms':                    { triageLevel: 1, requiredTier: 'ALS' },
  'Head injury / loss of consciousness': { triageLevel: 1, requiredTier: 'ALS' },
  'Severe bleeding':                     { triageLevel: 2, requiredTier: 'ALS' },
  'Severe burns':                        { triageLevel: 2, requiredTier: 'ALS' },
  'Allergic reaction':                   { triageLevel: 2, requiredTier: 'BLS' },
  'Severe abdominal pain':               { triageLevel: 3, requiredTier: 'BLS' },
  'High fever (39°C+)':                  { triageLevel: 3, requiredTier: 'BLS' },
}

export function triageForSymptom(symptom: string): { triageLevel: number; requiredTier: CreateTransportInput['requiredTier'] } {
  return SYMPTOM_TRIAGE_MAP[symptom] ?? { triageLevel: 3, requiredTier: 'BLS' }
}

export async function authedFetch(path: string, body: unknown) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? 'Request failed')
  return json
}

export async function requestAmbulance(input: CreateTransportInput) {
  return authedFetch('/api/transport/request', input) as Promise<{
    request: TransportRequestRow
    duplicate?: boolean
  }>
}

export async function cancelTransport(requestId: string, reason: string) {
  const { error } = await supabase
    .from('transport_requests')
    .update({
      status: 'cancelled_by_requester',
      cancellation_reason: reason,
    })
    .eq('id', requestId)
  if (error) throw error
}

export async function getActiveTransport(): Promise<TransportRequestRow | null> {
  const { data } = await supabase
    .from('transport_requests')
    .select('*')
    .in('status', [
      'requested', 'scheduled', 'searching', 'matched',
      'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination',
    ])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as TransportRequestRow | null) ?? null
}

export async function getTransportRequestById(requestId: string): Promise<TransportRequestRow | null> {
  const { data } = await supabase
    .from('transport_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()

  return (data as TransportRequestRow | null) ?? null
}

export async function getRequestPickupPoint(requestId: string): Promise<{ lat: number; lng: number } | null> {
  const { data } = await supabase
    .from('transport_requests')
    .select('pickup_point')
    .eq('id', requestId)
    .maybeSingle()

  const raw = (data as { pickup_point: unknown } | null)?.pickup_point
  return typeof raw === 'string' ? parsePoint(raw) : null
}

export async function getUnitLocation(ambulanceId: string): Promise<{ lat: number; lng: number; recordedAt: string } | null> {
  const { data } = await supabase
    .from('ambulance_current_location')
    .select('location, recorded_at')
    .eq('ambulance_id', ambulanceId)
    .maybeSingle()

  if (!data) return null
  const pos = parsePoint(data.location as unknown as string)
  return pos ? { ...pos, recordedAt: data.recorded_at } : null
}

/**
 * Live status. Subscribing to the request row rather than polling means the
 * patient sees "crew accepted" the instant it happens, which is the moment
 * that most reduces panic.
 */
export function subscribeToTransport(
  requestId: string,
  onChange: (row: TransportRequestRow) => void,
) {
  return supabase
    .channel(`transport:${requestId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'transport_requests', filter: `id=eq.${requestId}` },
      (payload) => onChange(payload.new as TransportRequestRow),
    )
    .subscribe()
}

/**
 * Live unit position. Scoped to the assigned unit — never the raw fleet
 * firehose. RLS restricts this to participants in an active job.
 */
export function subscribeToUnitLocation(
  ambulanceId: string,
  onMove: (pos: { lat: number; lng: number; recordedAt: string }) => void,
) {
  return supabase
    .channel(`unit:${ambulanceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ambulance_current_location',
        filter: `ambulance_id=eq.${ambulanceId}`,
      },
      (payload) => {
        const row = payload.new as { location: string; recorded_at: string }
        const pos = parsePoint(row.location)
        if (pos) onMove({ ...pos, recordedAt: row.recorded_at })
      },
    )
    .subscribe()
}

/**
 * Ambulances near a point, for the pre-booking map.
 *
 * Deliberately anonymous: the RPC returns position and tier only, no unit id
 * and nothing identifying. Before a request exists the patient has no
 * relationship with a particular vehicle, and this is a public-facing lookup.
 *
 * Polled rather than subscribed. The realtime channel on
 * `ambulance_current_location` is gated by RLS to participants in an active
 * job — correctly, since it is the raw fleet position feed — so there is
 * nothing to subscribe to before booking.
 */
export async function fetchNearbyUnits(
  lat: number,
  lng: number,
  radiusM = 15000,
): Promise<Array<{ lat: number; lng: number; tier: string; distanceM: number }>> {
  const { data, error } = await supabase.rpc('nearby_available_units', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM,
  })
  if (error) { console.warn('[nearbyUnits]', error.message); return [] }
  return (data ?? []).map((r: { lat: number; lng: number; tier: string; distance_m: number }) => ({
    lat: r.lat, lng: r.lng, tier: r.tier, distanceM: r.distance_m,
  }))
}

/**
 * Share the patient's position with the crew driving to them.
 *
 * Only meaningful while a job is active — record_patient_location() refuses
 * writes once the request reaches a terminal state, so the sharing window
 * closes server-side rather than depending on the app remembering to stop.
 * Returns false for a rejected fix (too inaccurate, out of order, or barely
 * moved), which is normal and not an error.
 */
export async function sharePatientLocation(
  requestId: string,
  pos: { lat: number; lng: number; accuracyM?: number; recordedAt?: string },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('record_patient_location', {
    p_request_id: requestId,
    p_lat: pos.lat,
    p_lng: pos.lng,
    p_accuracy_m: pos.accuracyM ?? null,
    p_recorded_at: pos.recordedAt ?? new Date().toISOString(),
  })
  if (error) { console.warn('[sharePatientLocation]', error.message); return false }
  return data === true
}

/** The patient's live position on an active job, for the crew's map. */
export async function fetchJobPatientLocation(
  requestId: string,
): Promise<{ lat: number; lng: number; recordedAt: string } | null> {
  const { data, error } = await supabase.rpc('get_job_patient_location', { p_request_id: requestId })
  if (error) { console.warn('[jobPatientLocation]', error.message); return null }
  const row = (data ?? [])[0] as { lat: number; lng: number; recorded_at: string } | undefined
  return row ? { lat: row.lat, lng: row.lng, recordedAt: row.recorded_at } : null
}

/**
 * Live patient position. The mirror of subscribeToUnitLocation — the crew map
 * follows the patient the same way the patient's map follows the unit.
 */
export function subscribeToPatientLocation(
  requestId: string,
  onMove: (pos: { lat: number; lng: number; recordedAt: string }) => void,
) {
  return supabase
    .channel(`patient:${requestId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transport_patient_location',
        filter: `request_id=eq.${requestId}`,
      },
      (payload) => {
        const row = payload.new as { location: string; recorded_at: string }
        const pos = parsePoint(row.location)
        if (pos) onMove({ ...pos, recordedAt: row.recorded_at })
      },
    )
    .subscribe()
}

/** PostgREST returns geography as GeoJSON or WKT depending on config. */
function parsePoint(raw: string): { lat: number; lng: number } | null {
  if (!raw) return null
  try {
    const geo = JSON.parse(raw)
    if (geo?.coordinates?.length === 2) {
      return { lng: geo.coordinates[0], lat: geo.coordinates[1] }
    }
  } catch {
    const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(raw)
    if (m) return { lng: Number(m[1]), lat: Number(m[2]) }
  }
  return null
}

/**
 * Human readable ETA. Shown as a range past 10 minutes — false precision on a
 * number that depends on Lagos traffic destroys trust the first time it slips.
 */
export function formatEta(seconds: number | null): string {
  if (seconds == null) return 'Calculating…'
  const mins = Math.round(seconds / 60)
  if (mins <= 1) return 'Arriving now'
  if (mins <= 10) return `${mins} min`
  const low = Math.floor(mins * 0.85)
  const high = Math.ceil(mins * 1.25)
  return `${low}–${high} min`
}

export const TRANSPORT_STATUS_LABEL: Record<TransportStatus, string> = {
  requested: 'Sending request',
  scheduled: 'Scheduled',
  searching: 'Finding an ambulance',
  matched: 'Crew assigned',
  en_route_to_patient: 'Ambulance on the way',
  on_scene: 'Crew has arrived',
  transporting: 'On the way to hospital',
  arrived_at_destination: 'Arrived at hospital',
  completed: 'Completed',
  cancelled_by_requester: 'Cancelled',
  cancelled_by_provider: 'Cancelled by provider',
  no_unit_available: 'No ambulance available',
}
