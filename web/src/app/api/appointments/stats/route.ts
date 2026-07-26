import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// GET /api/appointments/stats?from&to -- replaces admin-api.ts's
// getRangeStats/getClinicRangeStats (Task 15). Scope (whole hospital / one
// clinic) is derived from the server-verified caller, same as
// GET /api/appointments.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return Errors.validation('from and to are required')
  if (!caller.hospitalId) return Errors.forbidden()

  const hospitalId = caller.hospitalId

  if ((caller.role === 'clinic_admin' || caller.role === 'front_desk') && caller.clinicId) {
    const clinicId = caller.clinicId
    const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', clinicId)
    const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)
    const orFilter = doctorIds.length > 0
      ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
      : `clinic_id.eq.${clinicId}`

    const base = () => db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).or(orFilter)

    const [totalRes, completedRes, cancelledRes] = await Promise.all([
      base(), base().eq('status', 'completed'), base().eq('status', 'cancelled'),
    ])
    const total = totalRes.count ?? 0
    const completed = completedRes.count ?? 0
    const cancelled = cancelledRes.count ?? 0
    return NextResponse.json({ total, completed, cancelled, pending: total - completed - cancelled })
  }

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
