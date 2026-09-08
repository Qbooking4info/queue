import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/ambulances/coverage
 *
 * The last 30 days of dispatch_attempts for this hospital -- same query as
 * dashboard/ambulances/coverage/page.tsx, exposed for the Hospital mobile
 * app. Returns the raw attempt rows unaggregated, same as the web page does:
 * CoverageReport.tsx computes unserved/avgNearest/reasonTally etc. client-side
 * from these rows rather than the server pre-aggregating them, so the mobile
 * screen mirrors that same client-side computation instead of duplicating it
 * here too. hospital_admin only, matching the page's own role gate (no
 * front_desk, no super_admin -- see the sibling routes in this directory for
 * why super_admin is never in this list).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createAdminClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await db
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
    .eq('request.destination_hospital_id', caller.hospitalId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attempts: rows ?? [], days: 30 })
}
