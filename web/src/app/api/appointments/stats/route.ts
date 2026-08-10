import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// Must stay in step with mobile/lib/fees.ts, which quotes the patient at
// checkout. The two can't share a module across the mobile/web boundary, and
// they previously disagreed: BookingFlowScreen quoted a 1.5x emergency premium
// while this booked revenue at 2x, so the patient saw one number and the
// hospital's reporting recorded another.
// 'pending' used to be total - completed - cancelled, which swept no_show,
// checked_in and in_progress into the same number — a hospital with seven
// no-shows saw seven "pending" appointments that were never coming. Counted
// explicitly against the statuses that genuinely still need action.
const OPEN_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress']

const PLATFORM_FEE = 500
const EMERGENCY_FEE_MULTIPLIER = 2

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
  const emergencyMultiplier = a.urgency === 'emergency' ? EMERGENCY_FEE_MULTIPLIER : 1
  return Math.round(base * emergencyMultiplier) + PLATFORM_FEE
}

async function computeRevenue(
  db: ReturnType<typeof createAdminClient>, hospitalId: string, from: string, to: string, orFilter?: string,
): Promise<number> {
  let query = (db as any).from('appointments')
    .select('type, booking_mode, urgency, doctor:doctors!appointments_doctor_id_fkey(consultation_fee, virtual_fee)')
    .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'completed')
  if (orFilter) query = query.or(orFilter)

  // Paginated. PostgREST caps an unbounded select at 1000 rows and says nothing
  // about it, so a hospital past 1000 completed appointments in the range was
  // silently under-reporting its own revenue with no error and no warning — the
  // most dangerous kind of wrong number, because it looks plausible.
  const PAGE = 1000
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await query.range(from, from + PAGE - 1)
    if (error) throw error
    const batch = (page ?? []) as any[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  const { data: hospital } = await db.from('hospitals').select('opd_fee').eq('id', hospitalId).single()
  const opdFee = (hospital as any)?.opd_fee ?? 0
  return rows.reduce((sum, a) => sum + computeAppointmentFee(a, opdFee), 0)
}

interface DoctorWaitConsultStats {
  doctorId: string
  doctorName: string
  avgWaitMinutes: number | null
  avgConsultMinutes: number | null
  sampleSize: number
}

function avgMinutes(secs: number[]): number | null {
  if (secs.length === 0) return null
  return Math.round((secs.reduce((sum, v) => sum + v, 0) / secs.length) / 60)
}

// waiting_time_secs (check-in -> consult start) and consult_duration_secs (consult
// start -> end) are both Postgres GENERATED columns -- NULL until their inputs exist,
// so no status filter is needed here beyond the existing date-range/scope: a pending
// or cancelled appointment just contributes nothing to either average. Aggregated in
// JS rather than a DB-side avg()/group by, matching computeRevenue's existing pattern
// in this same file -- there's no per-hospital/date-range RPC for this, and volumes
// here don't warrant adding one.
//
// Queried as two separate selects, not one combined select -- PostgREST rejects a
// query's *entire* select list if even one column in it doesn't exist yet, and
// waiting_time_secs (supabase/migrations/20260806000001_waiting_time_column.sql) may
// land after this code does. Splitting them means consult-duration stats (already-existing
// column, real data today) keep working even before that migration is applied, instead
// of a single missing column silently zeroing out both.
async function computeWaitConsultStats(
  db: ReturnType<typeof createAdminClient>, hospitalId: string, from: string, to: string, orFilter?: string,
): Promise<{ avgWaitMinutes: number | null; avgConsultMinutes: number | null; doctorStats: DoctorWaitConsultStats[] }> {
  const scoped = (select: string) => {
    let q = (db as any).from('appointments').select(select)
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to)
    return orFilter ? q.or(orFilter) : q
  }

  const [{ data: waitData }, { data: consultData }] = await Promise.all([
    scoped('doctor_id, assigned_doctor_id, waiting_time_secs, doctor:doctors!appointments_doctor_id_fkey(full_name)'),
    scoped('doctor_id, assigned_doctor_id, consult_duration_secs, doctor:doctors!appointments_doctor_id_fkey(full_name)'),
  ])
  const waitRows = (waitData ?? []) as any[]
  const consultRows = (consultData ?? []) as any[]

  const byDoctor = new Map<string, { name: string; wait: number[]; consult: number[] }>()
  const get = (r: any) => {
    // assign_doctor writes both doctor_id and assigned_doctor_id to the same value, so
    // this only diverges if they somehow disagree -- fall back to whichever is set.
    const doctorId: string | null = r.doctor_id ?? r.assigned_doctor_id
    if (!doctorId) return null
    if (!byDoctor.has(doctorId)) byDoctor.set(doctorId, { name: r.doctor?.full_name ?? 'Unknown', wait: [], consult: [] })
    return byDoctor.get(doctorId)!
  }
  for (const r of waitRows) {
    if (r.waiting_time_secs != null) get(r)?.wait.push(r.waiting_time_secs)
  }
  for (const r of consultRows) {
    if (r.consult_duration_secs != null) get(r)?.consult.push(r.consult_duration_secs)
  }

  const doctorStats = [...byDoctor.entries()]
    .map(([doctorId, v]) => ({
      doctorId, doctorName: v.name,
      avgWaitMinutes: avgMinutes(v.wait),
      avgConsultMinutes: avgMinutes(v.consult),
      sampleSize: Math.max(v.wait.length, v.consult.length),
    }))
    .filter(d => d.sampleSize > 0)
    .sort((a, b) => b.sampleSize - a.sampleSize)

  return {
    avgWaitMinutes: avgMinutes(waitRows.map(r => r.waiting_time_secs).filter((v): v is number => v != null)),
    avgConsultMinutes: avgMinutes(consultRows.map(r => r.consult_duration_secs).filter((v): v is number => v != null)),
    doctorStats,
  }
}

// GET /api/appointments/stats?from&to -- replaces admin-api.ts's
// getRangeStats/getClinicRangeStats (Task 15). Scope (whole hospital / one
// clinic) is derived from the server-verified caller, same as
// GET /api/appointments.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
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

    const [totalRes, completedRes, cancelledRes, pendingRes, revenue, waitConsult] = await Promise.all([
      base(), base().eq('status', 'completed'), base().eq('status', 'cancelled'),
      base().in('status', OPEN_STATUSES),
      computeRevenue(db, hospitalId, from, to, orFilter),
      computeWaitConsultStats(db, hospitalId, from, to, orFilter),
    ])
    const total = totalRes.count ?? 0
    const completed = completedRes.count ?? 0
    const cancelled = cancelledRes.count ?? 0
    return NextResponse.json({
      total, completed, cancelled, pending: pendingRes.count ?? 0, revenue,
      avgWaitMinutes: waitConsult.avgWaitMinutes, avgConsultMinutes: waitConsult.avgConsultMinutes,
      doctorStats: waitConsult.doctorStats,
    })
  }

  const [totalRes, completedRes, cancelledRes, pendingRes, revenue, waitConsult] = await Promise.all([
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'completed'),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).eq('status', 'cancelled'),
    db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).in('status', OPEN_STATUSES),
    computeRevenue(db, hospitalId, from, to),
    computeWaitConsultStats(db, hospitalId, from, to),
  ])
  const total = totalRes.count ?? 0
  const completed = completedRes.count ?? 0
  const cancelled = cancelledRes.count ?? 0
  return NextResponse.json({
    total, completed, cancelled, pending: pendingRes.count ?? 0, revenue,
    avgWaitMinutes: waitConsult.avgWaitMinutes, avgConsultMinutes: waitConsult.avgConsultMinutes,
    doctorStats: waitConsult.doctorStats,
  })
}
