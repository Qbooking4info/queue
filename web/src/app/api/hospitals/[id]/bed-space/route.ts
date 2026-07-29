import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

const VALID_STATUSES = ['enough', 'limited', 'very_limited', 'none'] as const

// PATCH /api/hospitals/[id]/bed-space -- separate from /settings so front-desk staff
// (who need to refresh this every ~2 min during a shift) can update it without being
// granted access to the rest of hospital Settings, which stays admin-only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id } = await params

  if (caller.role !== 'super_admin' && caller.hospitalId !== id) return Errors.forbidden()

  const db = createAdminClient()

  // A clinic_admin/front_desk scoped to some other clinic (e.g. General Surgery)
  // has no reason to touch this -- only the hospital's overall admin, or staff
  // assigned specifically to its emergency clinic, may update bed space.
  if (caller.role === 'clinic_admin' || caller.role === 'front_desk') {
    const { data: hospitalRow } = await db.from('hospitals').select('clinic_model').eq('id', id).single()
    if ((hospitalRow as any)?.clinic_model === 'multi') {
      const { data: erClinic } = await db.from('hospital_clinics')
        .select('id').eq('hospital_id', id).eq('is_emergency', true).maybeSingle()
      if (!erClinic || caller.clinicId !== (erClinic as any).id) return Errors.forbidden()
    }
  }

  const { status } = await req.json()
  if (!VALID_STATUSES.includes(status)) {
    return Errors.validation(`status must be one of: ${VALID_STATUSES.join(', ')}`)
  }

  const updated_at = new Date().toISOString()
  const { error } = await db.from('hospitals').update({
    bed_space_status: status,
    bed_space_updated_at: updated_at,
  } as any).eq('id', id)
  if (error) return Errors.internal(error.message)

  return NextResponse.json({ success: true, bed_space_status: status, bed_space_updated_at: updated_at })
}
