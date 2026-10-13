import { redirect } from 'next/navigation'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { AlertsInbox } from './AlertsInbox'
import { loadDispatcherAlerts } from '@/lib/dispatcher-alerts'

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

  // Destination hospital, or destination-less requests inside this hospital's
  // fleet radius (lib/dispatcher-alerts.ts, REP-017).
  const { data: rows } = await loadDispatcherAlerts(db, adminRecord.hospital_id)

  return <AlertsInbox alerts={(rows ?? []) as never[]} />
}
