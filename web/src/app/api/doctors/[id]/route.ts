import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// PATCH /api/doctors/[id] -- hospital/clinic staff's ONLY lever over a
// doctor's account: activate or deactivate them at this hospital.
// Doctors are independent, self-registered accounts (see doctors/link) --
// their profile (name, title, fees, bio, qualification, specialty, email,
// password, ...) is theirs alone to edit, via PATCH /api/doctors/profile
// and Supabase auth directly. This route previously also accepted a long
// whitelist of profile fields (and a sibling route reset the doctor's own
// portal password) -- both removed: a hospital should never be able to
// rewrite a doctor's profile or take over their login out from under them.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()
  try {
    const { id } = await params
    const { is_active } = await req.json()
    if (typeof is_active !== 'boolean') return Errors.validation('is_active must be a boolean')

    const { data: doctor } = await db.from('doctors').select('id, hospital_id').eq('id', id).single()
    if (!doctor || (caller.hospitalId && doctor.hospital_id !== caller.hospitalId)) {
      return Errors.forbidden()
    }

    // A clinic_admin may only deactivate doctors actually assigned to their
    // own clinic -- membership, not just currently-active-there, matching
    // the same rule assign/unassign/set-active already enforce (doctor_clinics).
    if (caller.role === 'clinic_admin' && caller.clinicId) {
      const { data: membership } = await db
        .from('doctor_clinics')
        .select('id')
        .eq('doctor_id', id)
        .eq('clinic_id', caller.clinicId)
        .maybeSingle()
      if (!membership) return Errors.forbidden()
    }

    const { error } = await db.from('doctors').update({ is_active }).eq('id', id)
    if (error) return Errors.internal(error.message)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}
