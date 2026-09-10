/**
 * Queue — ambulance fleet operator API (mobile admin console)
 *
 * Thin wrappers around the web routes under /api/ambulances/**. Hospital-owned
 * and independent providers work identically here -- one registration route,
 * one identity (ambulance_provider_admins), one set of fleet-management
 * routes. There is no separate "hospital admin manages their fleet through
 * their hospital login" path anymore; ambulance management lives in this app
 * only.
 */

import { authedRequest } from './ambulance-api'
import type { TransportStatus } from './ambulance-api'

export interface FleetProvider {
  id: string
  name: string
  provider_type: 'hospital_fleet' | 'third_party'
  ownership_category: 'private' | 'government' | null
  hospital_id: string | null
  private_fleet: boolean
  service_radius_m: number | null
  service_hours_247: boolean
  contact_phone: string
  contact_email: string | null
  is_active: boolean
}

type NamedCrewRef = { id: string; crew_role: string | null; crew_tier: string | null; users: { full_name: string } | { full_name: string }[] | null }

export interface FleetCrewMember {
  id: string
  crew_member_id: string | null
  ambulance_crew: NamedCrewRef | NamedCrewRef[] | null
  // Legacy identity, kept only because old rows (and 20260730000001's RLS
  // policies) may still carry it -- nothing writes it anymore, see
  // POST /api/ambulances/fleet/shifts/[shiftId]/crew.
  hospital_admin_id: string | null
  hospital_admins: NamedCrewRef | NamedCrewRef[] | null
}

export interface FleetShift {
  id: string
  crew_tier: string
  starts_at: string
  ends_at: string
  ambulance_shift_crew: FleetCrewMember[]
}

export interface FleetUnit {
  id: string
  plate_number: string
  call_sign: string | null
  vehicle_tier: string
  capabilities: string[]
  status: string
  is_active: boolean
  ambulance_shifts: FleetShift[]
  on_duty?: boolean
  visible_to_dispatch?: boolean
  last_ping_at?: string | null
  seconds_since_ping?: number | null
}

export interface CrewOption {
  id: string
  crew_role: string | null
  crew_tier: string | null
  users: { full_name: string } | { full_name: string }[] | null
}

export interface FleetRequestRow {
  id: string
  booking_ref: string
  status: TransportStatus
  request_type: 'emergency' | 'scheduled'
  triage_level: number | null
  symptom_description: string | null
  eta_seconds: number | null
  pickup_address: string | null
  contact_phone: string
  caller_patient_name: string | null
  created_at: string
  matched_at: string | null
  completed_at: string | null
  patient: { full_name: string } | { full_name: string }[] | null
  dependent: { full_name: string } | { full_name: string }[] | null
  unit: { id: string; plate_number: string; call_sign: string | null; vehicle_tier: string } | { id: string; plate_number: string; call_sign: string | null; vehicle_tier: string }[] | null
}

export async function getFleet(): Promise<{ provider: FleetProvider | null; ambulances: FleetUnit[]; locationTtlSeconds: number }> {
  return authedRequest('/api/ambulances/fleet', 'GET')
}

export async function addUnit(input: {
  plateNumber: string; callSign?: string; vehicleTier: string; capabilities: string[]; lat: number; lng: number
}): Promise<{ id: string }> {
  return authedRequest('/api/ambulances/fleet/units', 'POST', input)
}

export async function removeUnit(unitId: string) {
  return authedRequest(`/api/ambulances/fleet/units/${unitId}`, 'DELETE')
}

export async function toggleUnitDuty(unitId: string, onDuty: boolean, hours?: number) {
  return authedRequest(`/api/ambulances/fleet/units/${unitId}/duty`, 'POST', { onDuty, hours })
}

export async function getCrewOptions(): Promise<{ crew: CrewOption[] }> {
  return authedRequest('/api/ambulances/fleet/crew', 'GET')
}

/** Returns freshly generated portal credentials -- shown once, same as the web dashboard's staff-invite flow. */
export async function addCrewMember(input: { fullName: string; crewRole: string; crewTier: string }): Promise<{ email: string; password: string }> {
  return authedRequest('/api/ambulances/fleet/crew', 'POST', input)
}

export async function addShift(ambulanceId: string, startsAt: string, endsAt: string, crewTier: string) {
  return authedRequest('/api/ambulances/fleet/shifts', 'POST', { ambulanceId, startsAt, endsAt, crewTier })
}

export async function removeShift(shiftId: string) {
  return authedRequest(`/api/ambulances/fleet/shifts/${shiftId}`, 'DELETE')
}

export async function assignCrew(shiftId: string, crewMemberId: string) {
  return authedRequest(`/api/ambulances/fleet/shifts/${shiftId}/crew`, 'POST', { crewMemberId })
}

export async function unassignCrew(shiftId: string, crewMemberId: string) {
  return authedRequest(`/api/ambulances/fleet/shifts/${shiftId}/crew?crewMemberId=${crewMemberId}`, 'DELETE')
}

export async function getFleetRequests(): Promise<{ requests: FleetRequestRow[] }> {
  return authedRequest('/api/ambulances/fleet/requests', 'GET')
}

export interface RegisterProviderInput {
  providerName: string
  providerType: 'hospital_fleet' | 'third_party'
  // hospital_fleet only
  hospitalId?: string
  // third_party only
  ownershipCategory?: 'private' | 'government'
  contactPhone: string
  contactEmail?: string
}

export async function registerAmbulanceProvider(input: RegisterProviderInput): Promise<{ success: true; providerId: string }> {
  return authedRequest('/api/ambulances/register', 'POST', input)
}

export interface ProviderSettings {
  provider_type: 'hospital_fleet' | 'third_party'
  private_fleet: boolean
  service_radius_m: number | null
  service_hours_247: boolean
}

export async function getProviderSettings(): Promise<{ settings: ProviderSettings }> {
  return authedRequest('/api/ambulances/fleet/settings', 'GET')
}

export async function updateProviderSettings(patch: { privateFleet?: boolean; serviceRadiusM?: number | null; serviceHours247?: boolean }) {
  return authedRequest('/api/ambulances/fleet/settings', 'PATCH', patch)
}
