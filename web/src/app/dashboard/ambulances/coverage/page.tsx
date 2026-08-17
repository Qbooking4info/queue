import { redirect } from 'next/navigation'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { CoverageReport } from './CoverageReport'

export const dynamic = 'force-dynamic'

/**
 * Coverage gaps.
 *
 * dispatch_attempts records what every dispatch round actually saw — how many
 * units were in range, how many survived the clinical filters, why the rest were
 * dropped, and crucially how far away the nearest unit was *even when it was
 * unusable*. Until now that table had no reader.
 *
 * The distinction this page exists to draw: "no ambulance available" collapses
 * three different businesses problems into one message. Nearest rig 40km away is
 * a coverage gap — recruit there. Rig 300m away but off duty is an adoption gap
 * — the operator isn't using the app. Three on duty and all mid-job is a
 * capacity gap — existing partners need more units. Same symptom, completely
 * different responses.
 */
export default async function CoveragePage() {
  const { db, adminRecord } = await getHospitalContext()

  if (!['admin', 'owner'].includes(adminRecord.role ?? '')) redirect('/dashboard')

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows } = await db
    .from('dispatch_attempts')
    .select(`
      id, round, radius_m, candidates_found, candidates_after_filter,
      reject_reasons, offers_made, nearest_unit_m, active_units_total,
      on_duty_units_total, created_at,
      request:transport_requests!inner(
        id, booking_ref, status, triage_level, pickup_address,
        destination_hospital_id, created_at
      )
    `)
    .eq('request.destination_hospital_id', adminRecord.hospital_id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)

  return <CoverageReport attempts={(rows ?? []) as never[]} days={30} />
}
