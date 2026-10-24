import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { loadDispatcherAlerts, canSeeDispatcherAlert } from '@/lib/dispatcher-alerts'

export async function OPTIONS() {
  return corsOptions()
}

/**
 * GET /api/ambulances/alerts
 *
 * Same scoping as the web dashboard's DispatcherAlertsPage (lib/dispatcher-alerts.ts):
 * the hospital's own destination requests plus destination-less requests inside its
 * fleet's radius (a "no unit available" alert usually has no destination at all, so
 * destination-only scoping hid them from everyone -- REP-017). super_admin sees all. Ambulance management
 * (including a hospital-owned fleet's own admin account) lives entirely in
 * the Ambulance app and has no hospitalId to scope this by at all now, so
 * ambulance_admin was removed from the allowed roles.
 */
export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (caller.role !== 'super_admin' && !caller.hospitalId) return NextResponse.json({ alerts: [] })

  const db = createAdminClient()
  const { data: rows, error } = await loadDispatcherAlerts(db, caller.role === 'super_admin' ? null : caller.hospitalId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ alerts: rows ?? [] })
}

/**
 * PATCH /api/ambulances/alerts   { alertId }
 *
 * Acknowledge a dispatcher alert.
 *
 * dispatcher_alerts has been written to since the ambulance system shipped —
 * by exhaustSearch(), and now by expire_overdue_searches() every time a 60s
 * emergency deadline lapses — and nothing has ever read it. A 'critical' alert
 * meaning "a triage-1 request found no ambulance" was landing in a table with
 * no reader. This is the write half of making that visible.
 *
 * Acknowledgement records who saw it, so "nobody noticed" and "someone looked
 * and judged it handled" stop being indistinguishable after the fact.
 */
export async function PATCH(req: NextRequest) {
  const res = await handlePATCH(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth

  const body = await req.json().catch(() => null) as { alertId?: string } | null
  if (!body?.alertId) return Errors.validation('alertId is required')

  const db = createAdminClient()

  // Resolve the acting user's row id — acknowledged_by references users(id),
  // not auth.uid().
  const { data: profile } = await db
    .from('users').select('id').eq('auth_id', caller.authId).single()
  if (!profile) return Errors.notFound('User')

  // Scope: the same visibility as GET. Without this any admin could clear another
  // hospital's alerts, which on this table means hiding the fact that someone
  // didn't get an ambulance.
  const { data: alert } = await db
    .from('dispatcher_alerts')
    .select('id')
    .eq('id', body.alertId)
    .single()

  if (!alert) return Errors.notFound('Alert')

  if (caller.role !== 'super_admin') {
    if (!caller.hospitalId || !(await canSeeDispatcherAlert(db, caller.hospitalId, body.alertId))) {
      return Errors.forbidden("Cannot acknowledge another hospital's alert")
    }
  }

  const { data: updated, error } = await db
    .from('dispatcher_alerts')
    .update({ acknowledged_by: profile.id, acknowledged_at: new Date().toISOString() })
    .eq('id', body.alertId)
    .is('acknowledged_at', null)
    .select('id')

  if (error) return Errors.internal(error.message)
  // Already acknowledged by someone else is a normal race, not an error.
  return NextResponse.json({ acknowledged: (updated?.length ?? 0) > 0 })
}
