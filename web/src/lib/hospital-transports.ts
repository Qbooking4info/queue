import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Transport requests a hospital needs to see: patients being brought TO it
 * (destination_hospital_id) and jobs its OWN fleet is running, wherever they're
 * headed. Before, only the first set showed, and nothing ever set a destination,
 * so the ambulance desk stayed empty even while the hospital's own crew was out.
 *
 * Shared by the web dashboard and GET /api/ambulances (the hospital mobile app).
 */
export async function loadHospitalTransports(db: SupabaseClient, hospitalId: string) {
  const { data: fleet } = await db
    .from('ambulances')
    .select('id, provider:ambulance_providers!inner(hospital_id)')
    .eq('provider.hospital_id', hospitalId)
  const fleetIds = (fleet ?? []).map(u => u.id as string)

  const filter = fleetIds.length
    ? `destination_hospital_id.eq.${hospitalId},assigned_unit_id.in.(${fleetIds.join(',')})`
    : `destination_hospital_id.eq.${hospitalId}`

  const { data, error } = await db
    .from('transport_requests')
    .select(`
      id, booking_ref, status, request_type, triage_level, symptom_description,
      eta_seconds, eta_updated_at, pickup_address, contact_phone, caller_patient_name,
      created_at, matched_at, disposition, destination_hospital_id, assigned_unit_id,
      patient:users!transport_requests_patient_id_fkey(full_name),
      dependent:dependents(full_name),
      destination:hospitals!transport_requests_destination_hospital_id_fkey(name),
      unit:ambulances(plate_number, call_sign, vehicle_tier, provider:ambulance_providers(name))
    `)
    .or(filter)
    .order('created_at', { ascending: false })
    .limit(50)

  const requests = (data ?? []).map(r => ({
    ...r,
    is_inbound: r.destination_hospital_id === hospitalId,
    is_own_fleet: !!r.assigned_unit_id && fleetIds.includes(r.assigned_unit_id),
  }))
  return { requests, error }
}
