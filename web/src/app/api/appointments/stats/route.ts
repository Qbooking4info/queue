import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

const PLATFORM_FEE = 500

// Estimated revenue, not a settled-payments ledger -- the app has no payment
// processing wired up yet (the `payments` table exists but nothing writes to
// it), so this mirrors the same fee math the booking screens show at checkout:
// base fee (doctor's consultation/virtual fee, or the hospital's OPD fee for
// hospital-mode bookings) x2 for emergency bookings, plus the flat platform fee.
function computeAppointmentFee(
  a: { type: string; booking_mode: string | null; urgency: string | null; doctor: { consultation_fee: number | null; virtual_fee: number | null } | null },
  opdFee: number,
): number {
  const base = a.booking_mode === 'doctor'
    ? (a.type === 'virtual' ? (a.doctor?.virtual_fee ?? a.doctor?.consultation_fee ?? 0) : (a.doctor?.consultation_fee ?? 0))
    : opdFee
  const emergencyMultiplier = a.urgency === 'emergency' ? 2 : 1
  return Math.round(base * emergencyMultiplier) + PLATFORM_FEE
}

async function computeRevenue(
  db: ReturnType<typeof createAdminClient>, hospitalId: string, from: string, to: string, orFilter?: string,
): Promise<number> {
  let query = (db as any).from('appointments')
    .select('type, booking_mode, urgency, doctor:doctors!appointments_doctor_id_fkey(consultation_fee, virtual_fee)')
    .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'completed')
  if (orFilter) query = query.or(orFilter)

  const [{ data: rows }, { data: hospital }] = await Promise.all([
    query,
    db.from('hospitals').select('opd_fee').eq('id', hospitalId).single(),
  ])
  const opdFee = (hospital as any)?.opd_fee ?? 0
  return ((rows ?? []) as any[]).reduce((sum, a) => sum + computeAppointmentFee(a, opdFee), 0)
}

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

    const [totalRes, completedRes, cancelledRes, revenue] = await Promise.all([
      base(), base().eq('status', 'completed'), base().eq('status', 'cancelled'),
      computeRevenue(db, hospitalId, from, to, orFilter),
    ])
    const total = totalRes.count ?? 0
    const completed = completedRes.count ?? 0
    const cancelled = cancelledRes.count ?? 0
    return NextResponse.json({ total, completed, cancelled, pending: total - completed - cancelled, revenue })
  }

  const [totalRes, completedRes, cancelledRes, revenue] = await Promise.all([
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'completed'),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'cancelled'),
    computeRevenue(db, hospitalId, from, to),
  ])
  const total = totalRes.count ?? 0
  const completed = completedRes.count ?? 0
  const cancelled = cancelledRes.count ?? 0
  return NextResponse.json({ total, completed, cancelled, pending: total - completed - cancelled, revenue })
}
