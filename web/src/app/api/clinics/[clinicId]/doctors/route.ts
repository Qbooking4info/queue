import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

type Body =
  | { mode: 'assign'; doctorId: string }
  | {
      mode: 'create'
      full_name: string
      title?: string
      specialty_id?: string | null
      consultation_fee?: number | null
      accepts_virtual: boolean
    }

// POST /api/clinics/[clinicId]/doctors -- replaces admin-api.ts's
// assignDoctorToClinic/createClinicDoctor (Task 15). Verifies the clinic
// belongs to the caller's hospital before either action.
export async function POST(req: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId } = await params
  const db = createAdminClient()

  const { data: clinic } = await db.from('hospital_clinics').select('hospital_id').eq('id', clinicId).single()
  if (!clinic) return Errors.notFound('Clinic')
  if (caller.role !== 'super_admin' && caller.hospitalId !== clinic.hospital_id) return Errors.forbidden()
  if (caller.role === 'clinic_admin' && caller.clinicId && caller.clinicId !== clinicId) return Errors.forbidden()

  const body = (await req.json()) as Body

  if (body.mode === 'assign') {
    const { data: doctor } = await db.from('doctors').select('hospital_id').eq('id', body.doctorId).single()
    if (!doctor || doctor.hospital_id !== clinic.hospital_id) return Errors.validation('Doctor does not belong to this hospital')
    const { error } = await db.from('doctors').update({ clinic_id: clinicId }).eq('id', body.doctorId)
    if (error) return Errors.internal(error.message)
    return NextResponse.json({ success: true })
  }

  if (!body.full_name?.trim()) return Errors.validation('full_name is required')
  const { data, error } = await db.from('doctors').insert({
    hospital_id: clinic.hospital_id,
    clinic_id: clinicId,
    full_name: body.full_name.trim(),
    title: body.title || null,
    specialty_id: body.specialty_id || null,
    consultation_fee: body.consultation_fee || null,
    accepts_virtual: body.accepts_virtual,
    is_active: true,
  } as any).select('id').single()
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ id: data.id })
}
