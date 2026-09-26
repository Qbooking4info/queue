import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId } from '@/lib/ambulance-fleet'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * GET /api/ambulances/fleet/requests
 *
 * This fleet's own jobs -- requests assigned to one of its units -- for the
 * Ambulance app's admin Active/History tabs. Distinct from
 * /api/dashboard/ambulances (which is the *receiving hospital's* view,
 * scoped by destination_hospital_id): a fleet operator needs to see every
 * job their own units have run, regardless of which hospital it went to,
 * and nothing like that exists on the web dashboard today since a fleet
 * operator's console never existed before this route.
 */
export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId) return NextResponse.json({ requests: [] })

  const { data: requests } = await db
    .from('transport_requests')
    .select(`
      id, booking_ref, status, request_type, triage_level, symptom_description,
      eta_seconds, pickup_address, contact_phone, caller_patient_name,
      created_at, matched_at, completed_at,
      patient:users!transport_requests_patient_id_fkey(full_name),
      dependent:dependents(full_name),
      unit:ambulances!inner(id, plate_number, call_sign, vehicle_tier, provider_id)
    `)
    .eq('unit.provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ requests: requests ?? [] })
}
