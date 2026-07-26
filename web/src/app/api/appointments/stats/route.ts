import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// GET /api/appointments/stats?from&to -- replaces admin-api.ts's
// getRangeStats (Task 15). Hospital-wide only, matching the original
// function's behaviour exactly (it never took a clinicId) -- restricted to
// the roles that actually see the analytics page (front_desk and doctor
// are redirected away from it client-side already).
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return Errors.validation('from and to are required')
  if (!caller.hospitalId) return Errors.forbidden()

  const hospitalId = caller.hospitalId
  const [totalRes, completedRes, cancelledRes] = await Promise.all([
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'completed'),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'cancelled'),
  ])
  const total = totalRes.count ?? 0
  const completed = completedRes.count ?? 0
  const cancelled = cancelledRes.count ?? 0
  return NextResponse.json({ total, completed, cancelled, pending: total - completed - cancelled })
}
