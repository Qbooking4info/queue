import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() {
  return corsOptions()
}

/**
 * GET /api/ambulances/alerts
 *
 * Same query as the web dashboard's DispatcherAlertsPage. Alerts are scoped
 * by the *destination hospital* of the underlying request (dispatcher_alerts
 * has no notion of which ambulance provider was involved -- a "no unit
 * available" alert means no provider was involved) -- a hospital-side
 * concern, read here by the web dashboard only. Ambulance management
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
  if (!caller.hospitalId) return NextResponse.json({ alerts: [] })

  const db = createAdminClient()
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
    .eq('request.destination_hospital_id', caller.hospitalId)
    .order('created_at', { ascending: false })
    .limit(100)

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

  // Scope: an alert belongs to a hospital through its transport request's
  // destination. Without this any admin could clear another hospital's alerts,
  // which on this table means hiding the fact that someone didn't get an
  // ambulance.
  const { data: alert } = await db
    .from('dispatcher_alerts')
    .select('id, request_id, transport_requests(destination_hospital_id)')
    .eq('id', body.alertId)
    .single()

  if (!alert) return Errors.notFound('Alert')

  if (caller.role !== 'super_admin') {
    const tr = (alert as { transport_requests?: { destination_hospital_id: string | null } | null }).transport_requests
    if (!caller.hospitalId || tr?.destination_hospital_id !== caller.hospitalId) {
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
