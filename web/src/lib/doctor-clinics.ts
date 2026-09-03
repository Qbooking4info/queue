import { createAdminClient } from '@/lib/supabase/admin'

type AdminDb = ReturnType<typeof createAdminClient>

export type SetActiveClinicResult =
  | { ok: true }
  | { ok: false; notMember: boolean; message: string }

// Shared by both "Set Active" entry points -- the admin/staff-driven
// PATCH /api/clinics/[clinicId]/doctors/[doctorId] and the doctor's own
// self-service PATCH /api/doctors/me/clinic -- so the membership-check-then-
// activate logic isn't duplicated between them. A doctor may only be made
// active in a clinic they're already assigned to (a doctor_clinics row);
// doctors.clinic_id itself is untouched by assignment -- only this function
// (and the initial-assignment/link auto-activate paths) ever writes it.
export async function setActiveClinic(
  db: AdminDb,
  doctorId: string,
  clinicId: string,
): Promise<SetActiveClinicResult> {
  const { data: membership } = await db
    .from('doctor_clinics')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!membership) {
    return { ok: false, notMember: true, message: 'Doctor is not assigned to this clinic' }
  }

  const { error } = await db.from('doctors').update({ clinic_id: clinicId }).eq('id', doctorId)
  if (error) return { ok: false, notMember: false, message: error.message }
  return { ok: true }
}
