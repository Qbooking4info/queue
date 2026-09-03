import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { nameToColor, nameToInitials } from '@/lib/dashboard-utils'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
export async function OPTIONS() {
  return corsOptions()
}

// GET /api/doctors/unassigned -- replaces admin-api.ts's getUnassignedDoctors
// (Task 15). Scoped to the caller's own hospital, not a client-supplied one.
export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  // requireRole must be given `req` -- without it, it can't see the
  // Authorization: Bearer header a cross-origin mobile caller sends, and
  // silently falls back to a cookie-only check that always fails for them
  // even once CORS allows the request through.
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { data, error } = await db
    .from('doctors')
    .select(`
      id, full_name, title, avg_rating, review_count, is_active,
      accepts_virtual, consultation_fee, years_experience,
      specialty:specialties!doctors_specialty_id_fkey(name)
    `)
    .eq('hospital_id', caller.hospitalId)
    .eq('is_active', true)
    .is('clinic_id', null)
    .order('full_name')
  if (error) return Errors.internal(error.message)

  return NextResponse.json({
    doctors: ((data ?? []) as any[]).map(d => ({
      id: d.id, full_name: d.full_name, title: d.title,
      specialty_name: d.specialty?.name ?? null,
      avg_rating: d.avg_rating, review_count: d.review_count,
      is_active: d.is_active, accepts_virtual: d.accepts_virtual,
      consultation_fee: d.consultation_fee, years_experience: d.years_experience,
      avatar: nameToInitials(d.full_name), color: nameToColor(d.full_name),
      clinic_id: null, availability_status: 'on_duty' as const,
    })),
  })
}
