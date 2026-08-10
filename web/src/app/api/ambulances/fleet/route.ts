import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

/**
 * GET/POST /api/ambulances/fleet
 *
 * A hospital's own ambulance_providers row (provider_type='hospital_fleet').
 * GET also returns the hospital's ambulances with their shifts and assigned
 * crew, for the fleet management page. POST creates the provider row itself —
 * a hospital gets at most one hospital_fleet provider.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { data: provider } = await db.from('ambulance_providers')
    .select('id, name, contact_phone, contact_email, is_active')
    .eq('hospital_id', caller.hospitalId)
    .eq('provider_type', 'hospital_fleet')
    .maybeSingle()

  if (!provider) return NextResponse.json({ provider: null, ambulances: [] })

  const { data: ambulances } = await db.from('ambulances')
    .select(`
      id, plate_number, call_sign, vehicle_tier, capabilities, status, is_active,
      ambulance_shifts (
        id, crew_tier, starts_at, ends_at,
        ambulance_shift_crew ( id, hospital_admin_id, hospital_admins ( id, crew_role, crew_tier, users ( full_name ) ) )
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

export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { data: existing } = await db.from('ambulance_providers')
    .select('id').eq('hospital_id', caller.hospitalId).eq('provider_type', 'hospital_fleet').maybeSingle()
  if (existing) return Errors.validation('This hospital already has a fleet provider.')

  const body = await req.json()
  const { name, contactPhone, contactEmail } = body
  if (!contactPhone) return Errors.validation('contactPhone is required')

  const { data: hospital } = await db.from('hospitals').select('name').eq('id', caller.hospitalId).single()

  const { data: created, error } = await db.from('ambulance_providers').insert({
    name: name || `${hospital?.name ?? 'Hospital'} Ambulance Fleet`,
    provider_type: 'hospital_fleet',
    hospital_id: caller.hospitalId,
    contact_phone: contactPhone,
    contact_email: contactEmail || null,
    is_active: true,
  }).select('id, name, contact_phone, contact_email, is_active').single()

  if (error) return Errors.internal(error.message)
  return NextResponse.json({ provider: created }, { status: 201 })
}
