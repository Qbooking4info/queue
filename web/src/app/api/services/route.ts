import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
export async function OPTIONS() {
  return corsOptions()
}

// GET /api/services -- replaces admin-api.ts's getHospitalServices/
// getRegisteredSpecialties (Task 15). Scoped to the caller's own hospital
// (and clinic, for clinic_admin/front_desk). getAllSpecialties is not
// bundled here -- specialties has a public read policy, fetched by the
// page via the caller's own RLS-bound client instead.
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
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const hospitalId = caller.hospitalId
  const db = createAdminClient()

  const isScopedToClinic = (caller.role === 'clinic_admin' || caller.role === 'front_desk') && !!caller.clinicId

  let servicesQuery = db
    .from('services')
    .select('id, name, description, specialty_id, base_price, virtual_price, duration_mins, is_active, clinic_id, specialty:specialties!services_specialty_id_fkey(name)')
    .eq('hospital_id', hospitalId)
  if (isScopedToClinic) {
    servicesQuery = (servicesQuery as any).or(`clinic_id.eq.${caller.clinicId},clinic_id.is.null`)
  }

  const [{ data: serviceRows }, registeredSpecialties] = await Promise.all([
    (servicesQuery as any).order('name'),
    isScopedToClinic
      ? Promise.resolve([])
      : (async () => {
          const [hsRes, docRes] = await Promise.all([
            db.from('hospital_specialties')
              .select('specialty:specialties!hospital_specialties_specialty_id_fkey(id, name, icon, slug)')
              .eq('hospital_id', hospitalId),
            db.from('doctors')
              .select('specialty:specialties!doctors_specialty_id_fkey(id, name, icon, slug)')
              .eq('hospital_id', hospitalId).eq('is_active', true),
          ])
          const seen = new Set<string>()
          const combined = [...((hsRes.data as any[]) ?? []), ...((docRes.data as any[]) ?? [])]
          return combined.map(r => r.specialty).filter(s => s?.id && !seen.has(s.id) && seen.add(s.id))
        })(),
  ])

  return NextResponse.json({
    services: ((serviceRows ?? []) as any[]).map(s => ({
      id: s.id, name: s.name, description: s.description ?? null,
      specialty_id: s.specialty_id ?? null, specialty_name: s.specialty?.name ?? null,
      base_price: s.base_price ?? null, virtual_price: s.virtual_price ?? null,
      duration_mins: s.duration_mins ?? null, is_active: s.is_active ?? true,
      clinic_id: s.clinic_id ?? null,
    })),
    registeredSpecialties,
  })
}

export async function POST(req: NextRequest) {
  const res = await handlePOST(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const body = await req.json() as {
    name: string; description?: string; specialty_id?: string
    base_price?: number; virtual_price?: number; duration_mins?: number
    clinicId?: string
  }
  if (!body.name?.trim()) return Errors.validation('name is required')

  // A clinic_admin/front_desk may only create services for their own clinic (or hospital-wide, null).
  const clinicId = body.clinicId ?? (caller.clinicId ?? undefined)
  if (clinicId && caller.role !== 'super_admin' && caller.role !== 'hospital_admin' && caller.clinicId && caller.clinicId !== clinicId) {
    return Errors.forbidden()
  }

  const { error } = await db.from('services').insert({
    hospital_id: caller.hospitalId,
    clinic_id: clinicId ?? null,
    name: body.name.trim(),
    description: body.description ?? null,
    specialty_id: body.specialty_id ?? null,
    base_price: body.base_price ?? null,
    virtual_price: body.virtual_price ?? null,
    duration_mins: body.duration_mins ?? null,
    is_active: true,
  } as any)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
