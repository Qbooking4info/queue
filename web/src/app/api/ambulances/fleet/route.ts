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

  return NextResponse.json({ provider, ambulances: ambulances ?? [] })
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
