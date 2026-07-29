/**
 * Queue — ambulance crew API (mobile)
 *
 * Reads go through SECURITY DEFINER RPCs (get_my_pending_offers, get_my_active_job)
 * rather than direct table queries — ambulance_crew/ambulance_shifts have RLS
 * enabled with no self-read policy, so a direct query would silently return
 * zero rows instead of erroring. Same pattern as get_my_staff_profile.
 *
 * Accept/decline goes through the web API (authedFetch), not a direct RPC call,
 * because accept_dispatch_offer() itself does not check that the caller is
 * actually crew for that unit — that authorization lives in the API route.
 * Calling the RPC directly from the client would let any authenticated user
 * accept any pending offer if they knew its id.
 */

import { supabase } from './supabase'
import { authedFetch } from './ambulance-api'
import type { TransportStatus } from './ambulance-api'

export interface PendingOffer {
  offer_id: string
  request_id: string
  ambulance_id: string
  score: number
  eta_seconds: number | null
  expires_at: string
  triage_level: number | null
  symptom_description: string | null
  pickup_address: string | null
  pickup_lat: number | null
  pickup_lng: number | null
}

export interface ActiveJob {
  request_id: string
  booking_ref: string
  status: TransportStatus
  assigned_unit_id: string
  triage_level: number | null
  symptom_description: string | null
  contact_phone: string
  pickup_address: string | null
  pickup_lat: number | null
  pickup_lng: number | null
  destination_hospital_id: string | null
  destination_hospital_name: string | null
}

/** Crew-drivable subset of the state machine — arrived_at_destination -> completed
 *  requires an actor from the receiving facility, not the crew. */
export type CrewJobStatus = 'en_route_to_patient' | 'on_scene' | 'transporting' | 'arrived_at_destination'

export async function getMyPendingOffers(): Promise<PendingOffer[]> {
  const { data, error } = await supabase.rpc('get_my_pending_offers')
  if (error) throw error
  return (data ?? []) as PendingOffer[]
}

export async function getMyActiveJob(): Promise<ActiveJob | null> {
  const { data, error } = await supabase.rpc('get_my_active_job')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return (row as ActiveJob | undefined) ?? null
}

export async function respondToOffer(
  offerId: string,
  action: 'accept' | 'decline',
  reason?: string,
): Promise<{ accepted: boolean; reason?: string }> {
  return authedFetch('/api/transport/offers/respond', { offerId, action, reason })
}

export async function updateJobStatus(requestId: string, status: CrewJobStatus): Promise<boolean> {
  const { data, error } = await supabase.rpc('crew_update_job_status', {
    p_request_id: requestId,
    p_new_status: status,
  })
  if (error) throw error
  return !!data
}

export async function sendLocationPing(
  ambulanceId: string,
  pings: Array<{ lat: number; lng: number; heading?: number; speedKmh?: number; accuracyM?: number; recordedAt: string }>,
): Promise<{ received: number; accepted: number }> {
  return authedFetch('/api/transport/location', { ambulanceId, pings })
}

export const CREW_STATUS_LABEL: Record<CrewJobStatus, string> = {
  en_route_to_patient: 'En route to patient',
  on_scene:            'On scene',
  transporting:        'Transporting to hospital',
  arrived_at_destination: 'Arrived at hospital',
}

/** The next crew-drivable status after the current one, or null if the crew's
 *  part of the job is done (arrived_at_destination is the last crew-owned step). */
export function nextJobStatus(current: TransportStatus): CrewJobStatus | null {
  const order: CrewJobStatus[] = ['en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination']
  const idx = order.indexOf(current as CrewJobStatus)
  if (idx === -1) return order[0]
  return order[idx + 1] ?? null
}
