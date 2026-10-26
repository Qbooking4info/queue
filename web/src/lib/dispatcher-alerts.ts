import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

const ALERT_SELECT = `
  id, severity, kind, message, created_at, acknowledged_at,
  request:transport_requests!inner(
    id, booking_ref, status, triage_level, symptom_description,
    pickup_address, contact_phone, caller_patient_name, created_at,
    destination_hospital_id, failure_reason
  ),
  ack:users!dispatcher_alerts_acknowledged_by_fkey(full_name)
`

/**
 * Dispatcher alerts a caller may see. hospitalId null = platform super admin (all).
 *
 * Scoping used to be "the request's destination is my hospital", which matched no
 * one for an emergency that never got a crew — the "no unit available" case these
 * alerts exist for. dispatcher_alert_ids_for_hospital() also includes destination-
 * less requests inside the hospital's own fleet radius (REP-017).
 */
export async function loadDispatcherAlerts(db: Db, hospitalId: string | null, limit = 100) {
  const ids = hospitalId ? await visibleAlertIds(db, hospitalId, limit) : null
  if (ids && !ids.length) return { data: [], error: null }

  let query = db.from('dispatcher_alerts').select(ALERT_SELECT)
  if (ids) query = query.in('id', ids)

  return query.order('created_at', { ascending: false }).limit(limit)
}

export async function canSeeDispatcherAlert(db: Db, hospitalId: string, alertId: string): Promise<boolean> {
  const ids = await visibleAlertIds(db, hospitalId, 1000)
  return ids.includes(alertId)
}

async function visibleAlertIds(db: Db, hospitalId: string, limit: number): Promise<string[]> {
  // Not in the generated types until the next gen-types run.
  const rpc = db.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>
  const { data, error } = await rpc.call(db, 'dispatcher_alert_ids_for_hospital', {
    p_hospital_id: hospitalId,
    p_limit: limit,
  })
  if (error) throw error
  return ((data ?? []) as Array<{ alert_id: string }>).map(r => r.alert_id)
}
