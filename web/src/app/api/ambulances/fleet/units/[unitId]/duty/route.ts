import { NextRequest, NextResponse } from 'next/server'
import { createUserScopedClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * POST /api/ambulances/fleet/units/[unitId]/duty   { onDuty: boolean, hours?: number }
 *
 * Puts a unit on or off duty from the operator console — the desk-side twin of
 * the crew app's toggle. Both go through set_unit_duty(), which is the only
 * writer for ambulances.status.
 *
 * Uses createUserScopedClient(), not createAdminClient(). set_unit_duty resolves
 * the caller through auth.uid() to decide whether they may operate this unit, so
 * calling it with the service role would evaluate auth.uid() as null and fail
 * with "not authenticated" -- and a plain cookie-only client does exactly the
 * same for the Ambulance app's console, which calls this with a bearer token
 * and no cookies at all. The authorization lives in the function itself (a
 * provider's own crew, or its own admin/owner toggling from the console --
 * hospital-owned and independent providers work identically here); this
 * route only has to make sure it runs as the real caller, whichever way they
 * authenticated.
 *
 * requireRole still runs first so an unauthenticated request gets a clean 401
 * rather than a Postgres exception.
 */
export async function OPTIONS() {
  return corsOptions()
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ unitId: string }> },
) {
  const res = await handlePOST(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(
  req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const auth = await requireRole(['ambulance_crew', 'ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth

  const { unitId } = await params
  const body = await req.json().catch(() => null) as { onDuty?: boolean; hours?: number } | null

  if (typeof body?.onDuty !== 'boolean') {
    return Errors.validation('onDuty (boolean) is required')
  }
  if (body.hours !== undefined && (typeof body.hours !== 'number' || body.hours <= 0 || body.hours > 24)) {
    return Errors.validation('hours must be between 0 and 24')
  }

  const db = await createUserScopedClient(req)
  // p_crew_tier omitted, not null: the function defaults it to the caller's own
  // crew tier, which is the right value for a fleet admin toggling a rig on.
  const { data, error } = await db.rpc('set_unit_duty', {
    p_ambulance_id: unitId,
    p_on_duty: body.onDuty,
    p_hours: body.hours ?? 12,
  })

  if (error) {
    // These are the operator's own guardrails talking — "finish or hand over the
    // active job", "unit is out of service", "not authorised to operate this
    // unit" — so the message is passed through rather than flattened to a 500.
    const denied = error.message.includes('not authorised') || error.message.includes('not authenticated')
    return NextResponse.json({ error: error.message }, { status: denied ? 403 : 400 })
  }

  return NextResponse.json(data)
}
