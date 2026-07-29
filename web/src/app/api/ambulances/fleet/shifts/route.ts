import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const body = await req.json()
  const { ambulanceId, startsAt, endsAt, crewTier } = body
  if (!ambulanceId || !startsAt || !endsAt || !crewTier) {
    return Errors.validation('ambulanceId, startsAt, endsAt, and crewTier are required')
  }

  const { data: unit } = await db.from('ambulances')
    .select('id, ambulance_providers!inner(hospital_id)')
    .eq('id', ambulanceId)
    .single()
  const provider = unit ? (Array.isArray(unit.ambulance_providers) ? unit.ambulance_providers[0] : unit.ambulance_providers) : null
  if (!provider || provider.hospital_id !== caller.hospitalId) return Errors.notFound('Ambulance')

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
