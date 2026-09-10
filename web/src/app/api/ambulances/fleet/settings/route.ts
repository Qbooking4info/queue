import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId } from '@/lib/ambulance-fleet'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * GET/PATCH /api/ambulances/fleet/settings
 *
 * private_fleet / service_radius_m / service_hours_247, now columns on
 * ambulance_providers itself rather than on the hospital (see
 * 20260906000001_ambulance_provider_admins.sql) -- a hospital-owned
 * provider's own admin sets these the same way an independent operator does,
 * since both register and are managed identically. private_fleet only means
 * anything for a hospital-owned provider ("only send patients to their own
 * hospital, or be flexible") -- an independent operator has no home hospital
 * for it to refer to, so the app hides that toggle for them, and PATCH
 * silently ignores it if sent anyway.
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
  if (!providerId) return Errors.notFound('Provider')

  const { data: settings, error } = await db.from('ambulance_providers')
    .select('provider_type, private_fleet, service_radius_m, service_hours_247')
    .eq('id', providerId)
    .single()

  if (error || !settings) return Errors.notFound('Provider')
  return NextResponse.json({ settings })
}

export async function PATCH(req: NextRequest) {
  const res = await handlePATCH(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId) return Errors.notFound('Provider')

  const body = await req.json().catch(() => null) as {
    privateFleet?: boolean; serviceRadiusM?: number | null; serviceHours247?: boolean
  } | null
  if (!body) return Errors.validation('Invalid body')

  const updates: Record<string, unknown> = {}
  if (typeof body.privateFleet === 'boolean') updates.private_fleet = body.privateFleet
  if (body.serviceRadiusM === null || typeof body.serviceRadiusM === 'number') updates.service_radius_m = body.serviceRadiusM
  if (typeof body.serviceHours247 === 'boolean') updates.service_hours_247 = body.serviceHours247

  if (Object.keys(updates).length === 0) return NextResponse.json({ success: true })

  const { error } = await db.from('ambulance_providers').update(updates as never).eq('id', providerId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
