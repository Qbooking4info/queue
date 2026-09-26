import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId } from '@/lib/ambulance-fleet'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

const VALID_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(req: NextRequest) {
  const res = await handlePOST(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId) return Errors.validation('Set up your fleet before adding units.')

  const body = await req.json()
  const { plateNumber, callSign, vehicleTier, capabilities, lat, lng } = body

  if (!plateNumber || !vehicleTier || typeof lat !== 'number' || typeof lng !== 'number') {
    return Errors.validation('plateNumber, vehicleTier, lat, and lng are required')
  }
  if (!VALID_TIERS.includes(vehicleTier)) return Errors.validation('Invalid vehicleTier')

  const { data: created, error } = await db.from('ambulances').insert({
    provider_id: providerId,
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
