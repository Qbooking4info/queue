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

// POST /api/hospitals/[id]/specialties -- replaces admin-api.ts's
// addHospitalSpecialty (Task 15).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handlePOST(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id: hospitalId } = await params
  if (caller.role !== 'super_admin' && caller.hospitalId !== hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { specialtyId } = await req.json()
  if (!specialtyId) return Errors.validation('specialtyId is required')

  const { error } = await db.from('hospital_specialties').insert({ hospital_id: hospitalId, specialty_id: specialtyId })
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
