import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

type Body = { mode: 'assign'; doctorId: string }

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
export async function OPTIONS() {
  return corsOptions()
}

// POST /api/clinics/[clinicId]/doctors -- replaces admin-api.ts's
// assignDoctorToClinic (Task 15). Verifies the clinic belongs to the caller's
// hospital before assigning. The sibling createClinicDoctor ('mode: create',
// manually inserting a brand-new doctors row) was removed 20260826 -- every
// doctor is now added via POST /api/doctors/link (ID-based) instead, the same
// change that removed the standalone "+ Invite Doctor" flow.
export async function POST(req: NextRequest, ctx: { params: Promise<{ clinicId: string }> }) {
  const res = await handlePOST(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId } = await params
  const db = createAdminClient()

  const { data: clinic } = await db.from('hospital_clinics').select('hospital_id').eq('id', clinicId).single()
  if (!clinic) return Errors.notFound('Clinic')
  if (caller.role !== 'super_admin' && caller.hospitalId !== clinic.hospital_id) return Errors.forbidden()
  if (caller.role === 'clinic_admin' && caller.clinicId && caller.clinicId !== clinicId) return Errors.forbidden()

  const body = (await req.json()) as Body

  const { data: doctor } = await db.from('doctors').select('hospital_id').eq('id', body.doctorId).single()
  if (!doctor || doctor.hospital_id !== clinic.hospital_id) return Errors.validation('Doctor does not belong to this hospital')

  // Add to the assignment pool -- idempotent, already-assigned is not an
  // error. A doctor can now be assigned to several clinics at once; only
  // set as ACTIVE below if they don't already have one, so assigning to a
  // 2nd/3rd clinic never silently moves them out of the one they're
  // currently working (see doctor_clinics, 20260903000001).
  const { error: memberErr } = await db
    .from('doctor_clinics')
    .upsert({ doctor_id: body.doctorId, clinic_id: clinicId }, { onConflict: 'doctor_id,clinic_id', ignoreDuplicates: true })
  if (memberErr) return Errors.internal(memberErr.message)

  const { error } = await db.from('doctors').update({ clinic_id: clinicId }).eq('id', body.doctorId).is('clinic_id', null)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
