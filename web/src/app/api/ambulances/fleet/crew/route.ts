import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

/** This hospital's ambulance_crew-role staff, for the shift-assignment picker. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { data } = await db.from('hospital_admins')
    .select('id, crew_role, crew_tier, users(full_name)')
    .eq('hospital_id', caller.hospitalId)
    .eq('role', 'ambulance_crew')
    .eq('is_active', true)
    .order('created_at')

  return NextResponse.json({ crew: data ?? [] })
}
