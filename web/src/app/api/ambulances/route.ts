import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHospitalTransports } from '@/lib/hospital-transports'

/**
 * GET /api/ambulances
 *
 * A hospital's ambulance desk: patients inbound to it, plus its own fleet's jobs
 * (see loadHospitalTransports). Existed as a query inside
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

  const { requests, error } = await loadHospitalTransports(db, caller.hospitalId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests })
}
