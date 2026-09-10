import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId, assertOwnAmbulance } from '@/lib/ambulance-fleet'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

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
  if (!providerId) return Errors.forbidden()

  const body = await req.json()
  const { ambulanceId, startsAt, endsAt, crewTier } = body
  if (!ambulanceId || !startsAt || !endsAt || !crewTier) {
    return Errors.validation('ambulanceId, startsAt, endsAt, and crewTier are required')
  }

  if (!(await assertOwnAmbulance(db, ambulanceId, providerId))) return Errors.notFound('Ambulance')

  const { data: created, error } = await db.from('ambulance_shifts').insert({
    ambulance_id: ambulanceId,
    crew_tier: crewTier,
    starts_at: startsAt,
    ends_at: endsAt,
  }).select('id').single()

  // The no_overlapping_shifts exclusion constraint surfaces here as a generic
  // Postgres error — good enough for now, the message says exactly what happened.
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ id: created.id }, { status: 201 })
}
