import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId } from '@/lib/ambulance-fleet'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * GET /api/ambulances/fleet
 *
 * The caller's own fleet -- ambulances with their shifts and assigned crew,
 * for the Ambulance app's Fleet screen. Every provider (hospital-owned or
 * independent) is created via POST /api/ambulances/register and managed by
 * its own ambulance_provider_admins account, so this is ambulance_admin-only;
 * there is no separate "create a hospital's fleet" path here anymore.
 *
 * Called cross-origin by the Ambulance Expo app running in a browser during
 * development (and any web build of it) -- same CORS handling as every other
 * route mobile apps call directly with a bearer token.
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
  if (!providerId) return NextResponse.json({ provider: null, ambulances: [] })

  const { data: provider } = await db.from('ambulance_providers')
    .select('id, name, provider_type, ownership_category, hospital_id, private_fleet, service_radius_m, service_hours_247, contact_phone, contact_email, is_active')
    .eq('id', providerId)
    .maybeSingle()

  if (!provider) return NextResponse.json({ provider: null, ambulances: [] })

  const { data: ambulances } = await db.from('ambulances')
    .select(`
      id, plate_number, call_sign, vehicle_tier, capabilities, status, is_active,
      ambulance_shifts (
        id, crew_tier, starts_at, ends_at,
        ambulance_shift_crew (
          id, hospital_admin_id, crew_member_id,
          hospital_admins ( id, crew_role, crew_tier, users ( full_name ) ),
          ambulance_crew ( id, crew_role, crew_tier, users ( full_name ) )
        )
      )
    `)
    .eq('provider_id', provider.id)
    .order('created_at')

  // Dispatchability, not just duty status.
  //
  // find_candidate_units requires BOTH status='available' AND a position fresher
  // than unit_location_ttl_seconds(). A rig can be on duty and still invisible to
  // dispatch because its crew backgrounded the app and the position went stale.
  // Showing only "available" would let an operator believe they have coverage
  // they do not actually have, which on this product means a patient waiting on
  // an ambulance that was never dispatchable.
  const ids = (ambulances ?? []).map(a => a.id)
  const [{ data: locs }, { data: ttlRaw }] = await Promise.all([
    ids.length
      ? db.from('ambulance_current_location').select('ambulance_id, recorded_at').in('ambulance_id', ids)
      : Promise.resolve({ data: [] as { ambulance_id: string; recorded_at: string }[] }),
    db.rpc('unit_location_ttl_seconds'),
  ])

  const ttl = typeof ttlRaw === 'number' ? ttlRaw : 120
  const lastPing = new Map((locs ?? []).map(l => [l.ambulance_id, l.recorded_at]))
  const now = Date.now()

  const enriched = (ambulances ?? []).map(a => {
    const shifts = (a.ambulance_shifts ?? []) as { starts_at: string; ends_at: string }[]
    const onShift = shifts.some(s => Date.parse(s.starts_at) <= now && Date.parse(s.ends_at) > now)
    const ping = lastPing.get(a.id) ?? null
    const ageSec = ping ? Math.round((now - Date.parse(ping)) / 1000) : null
    const fresh = ageSec !== null && ageSec <= ttl
    return {
      ...a,
      last_ping_at: ping,
      seconds_since_ping: ageSec,
      on_duty: a.status === 'available' && onShift,
      visible_to_dispatch: a.status === 'available' && onShift && fresh,
    }
  })

  return NextResponse.json({ provider, ambulances: enriched, locationTtlSeconds: ttl })
}
