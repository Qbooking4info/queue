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

// DELETE /api/clinics/[clinicId]/doctors/[doctorId] -- replaces admin-api.ts's
// removeDoctorFromClinic (Task 15). Verifies the doctor is actually assigned
// to this clinic, and this clinic belongs to the caller's hospital, before
// unassigning.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ clinicId: string; doctorId: string }> }) {
  const res = await handleDELETE(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ clinicId: string; doctorId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId, doctorId } = await params
  const db = createAdminClient()

  const { data: doctor } = await db.from('doctors').select('hospital_id, clinic_id').eq('id', doctorId).single()
  if (!doctor || doctor.clinic_id !== clinicId) return Errors.notFound('Doctor')
  if (caller.role !== 'super_admin' && caller.hospitalId !== doctor.hospital_id) return Errors.forbidden()
  if (caller.role === 'clinic_admin' && caller.clinicId && caller.clinicId !== clinicId) return Errors.forbidden()

  const { error } = await db.from('doctors').update({ clinic_id: null }).eq('id', doctorId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
