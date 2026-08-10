import { redirect } from 'next/navigation'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { AlertsInbox } from './AlertsInbox'

export const dynamic = 'force-dynamic'

/**
 * Dispatcher alerts.
 *
 * dispatcher_alerts has been written to since the ambulance system shipped and
 * never read by anything. Every exhausted search and every lapsed 60s deadline
 * files a row here — severity 'critical' when the triage level was 1 or 2. On a
 * product whose promise is "we tell you instantly when we can't find you an
 * ambulance", the operator side of that promise was a table nobody opened.
 */
export default async function DispatcherAlertsPage() {
  const { db, adminRecord } = await getHospitalContext()

  if (!['admin', 'owner', 'front_desk'].includes(adminRecord.role ?? '')) redirect('/dashboard')

  // Scoped through the request's destination hospital, matching how the
  // ambulances list scopes itself.
  const { data: rows } = await db
    .from('dispatcher_alerts')
    .select(`
      id, severity, kind, message, created_at, acknowledged_at,
      request:transport_requests!inner(
        id, booking_ref, status, triage_level, symptom_description,
        pickup_address, contact_phone, caller_patient_name, created_at,
        destination_hospital_id, failure_reason
      ),
      ack:users!dispatcher_alerts_acknowledged_by_fkey(full_name)
    `)
    .eq('request.destination_hospital_id', adminRecord.hospital_id)
    .order('created_at', { ascending: false })
    .limit(100)

  return <AlertsInbox alerts={(rows ?? []) as never[]} />
}
