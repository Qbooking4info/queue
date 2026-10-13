import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { clinicOrFilter } from '@/lib/hospital-scope'
import { safePatientName } from '@/lib/dashboard-utils'

/**
 * GET /api/virtual?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Video consultations at this hospital (appointments.type = 'virtual') with
 * their call session: whether the room is live, when it started, how long it
 * ran. Shared by web and Queue Hospital.
 */
type Row = {
  id: string; booking_ref: string; appointment_date: string; start_time: string; status: string
  patient: { full_name: string | null; phone: string | null } | null
  doctor: { full_name: string | null } | null
  sessions: { status: string; started_at: string | null; ended_at: string | null; duration_secs: number | null }[] | null
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()

  const sp = req.nextUrl.searchParams
  const from = sp.get('from'), to = sp.get('to')
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
  }

  const db = createAdminClient()
  const orFilter = await clinicOrFilter(db, caller)
  let q = db.from('appointments')
    .select(`id, booking_ref, appointment_date, start_time, status,
      patient:users!appointments_patient_id_fkey(full_name, phone),
      doctor:doctors!appointments_doctor_id_fkey(full_name),
      sessions:virtual_sessions(status, started_at, ended_at, duration_secs)`)
    .eq('hospital_id', caller.hospitalId).eq('type', 'virtual')
    .gte('appointment_date', from).lte('appointment_date', to)
    .order('appointment_date', { ascending: true }).order('start_time', { ascending: true })
    .limit(1000)
  if (orFilter) q = q.or(orFilter)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const consults = ((data ?? []) as unknown as Row[]).map(a => {
    const s = (a.sessions ?? []).sort((x, y) => (y.started_at ?? '').localeCompare(x.started_at ?? ''))[0] ?? null
    return {
      id: a.id, bookingRef: a.booking_ref, date: a.appointment_date, time: a.start_time?.slice(0, 5) ?? '',
      status: a.status, patient: safePatientName(a.patient?.full_name, 'Unknown'), patientPhone: a.patient?.phone ?? null,
      doctor: a.doctor?.full_name ?? 'Unassigned',
      live: !!s && s.status === 'active' && !s.ended_at,
      startedAt: s?.started_at ?? null,
      durationMins: s?.duration_secs != null ? Math.round(s.duration_secs / 60) : null,
    }
  })

  const durations = consults.map(c => c.durationMins).filter((v): v is number => v != null)
  return NextResponse.json({
    consults,
    stats: {
      scheduled: consults.filter(c => ['pending', 'confirmed', 'checked_in'].includes(c.status)).length,
      live: consults.filter(c => c.live).length,
      completed: consults.filter(c => c.status === 'completed').length,
      avgMins: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    },
  })
}
