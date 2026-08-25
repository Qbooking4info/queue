import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// A doctor's hospital-agnostic settings for direct (patient-initiated,
// no-hospital) bookings -- fee, specialty/bio for discovery, and whether
// their phone number is shown to patients. Self-service, any signed-in
// account may read/write its own row (see doctor_profiles RLS in
// 20260817000001_direct_doctor_booking.sql) -- "being a doctor" here is
// exactly as self-asserted as the rest of this pre-launch app's accounts.
//
// Called cross-origin from the doctors app running in a browser (e.g.
// localhost:8095 -> localhost:3000), with an Authorization header -- needs
// real CORS handling (preflight OPTIONS + headers on every response,
// including errors), not just the Allow-Origin-only pattern used by the
// unauthenticated public routes.

const EDITABLE_FIELDS = [
  'title', 'specialty_id', 'level', 'bio', 'qualification', 'years_experience',
  'virtual_fee', 'home_visit_fee', 'accepts_direct_virtual',
  'accepts_direct_home_visit', 'show_phone_to_patients',
] as const

export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  return withCors(await handleGET(req))
}

export async function PATCH(req: NextRequest) {
  return withCors(await handlePATCH(req))
}

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User profile')

  const { data } = await db.from('doctor_profiles').select('*').eq('user_id', profile.id).maybeSingle()

  return NextResponse.json({ profile: data ?? null })
}

async function handlePATCH(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User profile')

  const body = await req.json()
  const update: Record<string, unknown> = { user_id: profile.id }
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = body[field]
  }

  if (typeof update.virtual_fee === 'number' && update.virtual_fee < 0) {
    return Errors.validation('virtual_fee cannot be negative')
  }
  if (typeof update.home_visit_fee === 'number' && update.home_visit_fee < 0) {
    return Errors.validation('home_visit_fee cannot be negative')
  }

  const { data, error } = await db
    .from('doctor_profiles')
    .upsert(update as any, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) return Errors.internal(error.message)
  return NextResponse.json({ profile: data })
}
