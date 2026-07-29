import { redirect } from 'next/navigation'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { AutoRefreshAmbulances } from './AutoRefreshAmbulances'
import { AmbulancesList } from './AmbulancesList'

export const dynamic = 'force-dynamic'

export default async function AmbulancesPage() {
  const { db, adminRecord } = await getHospitalContext()

  if (!['admin', 'owner', 'front_desk'].includes(adminRecord.role ?? '')) redirect('/dashboard')

  const { data: requestsRaw } = await db
    .from('transport_requests')
    .select(`
      id, booking_ref, status, request_type, triage_level, symptom_description,
      eta_seconds, eta_updated_at, pickup_address, contact_phone, caller_patient_name,
      created_at, matched_at,
      patient:users!transport_requests_patient_id_fkey(full_name),
      dependent:dependents(full_name),
      unit:ambulances(plate_number, call_sign, vehicle_tier, provider:ambulance_providers(name))
    `)
    .eq('destination_hospital_id', adminRecord.hospital_id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <>
      <AutoRefreshAmbulances hospitalId={adminRecord.hospital_id} />
      <AmbulancesList
        requests={requestsRaw ?? []}
        canManageFleet={adminRecord.role === 'admin' || adminRecord.role === 'owner'}
      />
    </>
  )
}
