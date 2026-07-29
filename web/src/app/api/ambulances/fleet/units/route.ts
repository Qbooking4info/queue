import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

const VALID_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']

export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { data: provider } = await db.from('ambulance_providers')
    .select('id').eq('hospital_id', caller.hospitalId).eq('provider_type', 'hospital_fleet').maybeSingle()
  if (!provider) return Errors.validation('Set up your fleet before adding units.')

  const body = await req.json()
  const { plateNumber, callSign, vehicleTier, capabilities, lat, lng } = body

  if (!plateNumber || !vehicleTier || typeof lat !== 'number' || typeof lng !== 'number') {
    return Errors.validation('plateNumber, vehicleTier, lat, and lng are required')
  }
  if (!VALID_TIERS.includes(vehicleTier)) return Errors.validation('Invalid vehicleTier')

  const { data: created, error } = await db.from('ambulances').insert({
    provider_id: provider.id,
    plate_number: plateNumber,
    call_sign: callSign || null,
    vehicle_tier: vehicleTier,
    capabilities: Array.isArray(capabilities) ? capabilities : [],
    status: 'offline',
    home_base: `SRID=4326;POINT(${lng} ${lat})`,
    is_active: true,
  }).select('id').single()

  if (error) return Errors.internal(error.message)
  return NextResponse.json({ id: created.id }, { status: 201 })
}
