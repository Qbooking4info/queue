import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { setActiveClinic } from '@/lib/doctor-clinics'

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
export async function OPTIONS() {
  return corsOptions()
}

function assertOwnClinicScope(
  caller: { role: string; hospitalId?: string; clinicId?: string },
  clinicId: string,
  doctorHospitalId: string,
): boolean {
  if (caller.role !== 'super_admin' && caller.hospitalId !== doctorHospitalId) return false
  if (caller.role === 'clinic_admin' && caller.clinicId && caller.clinicId !== clinicId) return false
  return true
}

// DELETE /api/clinics/[clinicId]/doctors/[doctorId] -- replaces admin-api.ts's
// removeDoctorFromClinic (Task 15). A doctor can now be assigned to more than
// one clinic (doctor_clinics, 20260903000001) -- this removes only their
// membership in THIS clinic, which is no longer necessarily their active
// one. If it WAS their active clinic, falls back to another remaining
// assignment (earliest-linked, mirroring AuthContext's own fallback-to-
// earliest logic for hospitals) rather than leaving them with none.
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
  if (!doctor) return Errors.notFound('Doctor')
  if (!assertOwnClinicScope(caller, clinicId, doctor.hospital_id)) return Errors.forbidden()

  const { data: membership } = await db
    .from('doctor_clinics')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!membership) return Errors.notFound('Doctor is not assigned to this clinic')

  const { error: delErr } = await db.from('doctor_clinics').delete().eq('doctor_id', doctorId).eq('clinic_id', clinicId)
  if (delErr) return Errors.internal(delErr.message)

  if (doctor.clinic_id === clinicId) {
    const { data: fallback } = await db
      .from('doctor_clinics')
      .select('clinic_id')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const { error: updErr } = await db.from('doctors').update({ clinic_id: fallback?.clinic_id ?? null }).eq('id', doctorId)
    if (updErr) return Errors.internal(updErr.message)
  }

  return NextResponse.json({ success: true })
}

// PATCH /api/clinics/[clinicId]/doctors/[doctorId] -- admin/staff-driven
// "Set Active": makes this clinic the doctor's currently active one. Doctor
// must already be an assigned member of this clinic (doctor_clinics). The
// doctor's own self-service equivalent is PATCH /api/doctors/me/clinic --
// both call the same setActiveClinic helper.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ clinicId: string; doctorId: string }> }) {
  const res = await handlePATCH(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ clinicId: string; doctorId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId, doctorId } = await params
  const db = createAdminClient()

  const { data: doctor } = await db.from('doctors').select('hospital_id').eq('id', doctorId).single()
  if (!doctor) return Errors.notFound('Doctor')
  if (!assertOwnClinicScope(caller, clinicId, doctor.hospital_id)) return Errors.forbidden()

  const result = await setActiveClinic(db, doctorId, clinicId)
  if (!result.ok) return result.notMember ? Errors.validation(result.message) : Errors.internal(result.message)
  return NextResponse.json({ success: true })
}
