import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/ambulances
 *
 * A hospital's own incoming transport requests. Existed as a query inside
 * dashboard/ambulances/page.tsx (a server component, using the admin client
 * directly) with no REST equivalent -- fine for the web dashboard, but left
 * the Hospital mobile app with nothing to call. Same query, same scoping,
 * exposed so mobile can reach it with its Bearer JWT the way it already
 * reaches PATCH /api/appointments/[id] etc.
 *
 * No super_admin here on purpose -- unlike every other role in requireRole(),
 * a super_admin's CallerInfo carries no hospitalId (the web dashboard resolves
 * which hospital they're looking at through a separate cookie-based
 * impersonation flow, not this bearer-token path), so scoping this query by
 * caller.hospitalId would silently query for `undefined` if it were allowed
 * through. Matches dashboard/ambulances/page.tsx's own role gate, which has
 * no super_admin case either -- that flow goes through /dashboard/hospitals
 * instead.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createAdminClient()

  const { data: requestsRaw, error } = await db
    .from('transport_requests')
    .select(`
      id, booking_ref, status, request_type, triage_level, symptom_description,
      eta_seconds, eta_updated_at, pickup_address, contact_phone, caller_patient_name,
      created_at, matched_at,
      patient:users!transport_requests_patient_id_fkey(full_name),
      dependent:dependents(full_name),
      unit:ambulances(plate_number, call_sign, vehicle_tier, provider:ambulance_providers(name))
    `)
    .eq('destination_hospital_id', caller.hospitalId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: requestsRaw ?? [] })
}
