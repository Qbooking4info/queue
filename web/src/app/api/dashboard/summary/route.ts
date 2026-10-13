import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'

/**
 * GET /api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The four KPIs on the hospital dashboard (v3.1 w-dash), each with the same
 * figure for the equal-length period just before, plus visits per day for the
 * 14 days ending `to`:
 *   visits      appointments in range that weren't cancelled
 *   collected   successful Paystack payments, paid_at in range (naira)
 *   avgWaitMins mean check-in -> consult start (waiting_time_secs)
 *   noShowRate  no_show / (visits), percent
 *
 * Scoped like /api/appointments/stats: whole hospital, or one clinic for
 * clinic_admin / front_desk. Shared by web and Queue Hospital.
 */

type Row = { appointment_date: string; status: string; waiting_time_secs: number | null }
type Kpis = { visits: number; collected: number | null; avgWaitMins: number | null; noShowRate: number | null }

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(s + 'T00:00:00Z')

function kpisFrom(rows: Row[], collected: number | null): Kpis {
  const live = rows.filter(r => r.status !== 'cancelled')
  const waits = live.map(r => r.waiting_time_secs).filter((v): v is number => v != null)
  const noShows = live.filter(r => r.status === 'no_show').length
  return {
    visits: live.length,
    collected,
    avgWaitMins: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length / 60) : null,
    noShowRate: live.length ? Math.round((noShows / live.length) * 1000) / 10 : null,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const hospitalId = caller.hospitalId

  const sp = req.nextUrl.searchParams
  const from = sp.get('from'), to = sp.get('to')
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
  }

  // Previous period: same length, ending the day before `from`.
  const lenDays = Math.round((parse(to).getTime() - parse(from).getTime()) / DAY) + 1
  const prevTo = iso(new Date(parse(from).getTime() - DAY))
  const prevFrom = iso(new Date(parse(from).getTime() - lenDays * DAY))
  // Chart window: 14 days ending `to`.
  const chartFrom = iso(new Date(parse(to).getTime() - 13 * DAY))
  const earliest = [prevFrom, chartFrom].sort()[0]

  const db = createAdminClient()

  let orFilter: string | null = null
  if ((caller.role === 'clinic_admin' || caller.role === 'front_desk') && caller.clinicId) {
    const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', caller.clinicId)
    const ids = (docs ?? []).map(d => d.id)
    orFilter = ids.length ? `clinic_id.eq.${caller.clinicId},doctor_id.in.(${ids.join(',')})` : `clinic_id.eq.${caller.clinicId}`
  }

  // One paginated read covering the previous period, the current period and the chart.
  const rows: Row[] = []
  for (let off = 0; ; off += 1000) {
    let q = db.from('appointments').select('appointment_date, status, waiting_time_secs')
      .eq('hospital_id', hospitalId).gte('appointment_date', earliest).lte('appointment_date', to)
    if (orFilter) q = q.or(orFilter)
    const { data, error } = await q.range(off, off + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }

  // Payments carry no clinic, so a clinic-scoped caller gets null rather than the
  // whole hospital's takings presented as their clinic's.
  async function collectedBetween(a: string, b: string): Promise<number> {
    const { data } = await db.from('payments').select('amount')
      .eq('hospital_id', hospitalId).eq('status', 'success')
      .gte('paid_at', `${a}T00:00:00Z`).lt('paid_at', `${iso(new Date(parse(b).getTime() + DAY))}T00:00:00Z`)
    return (data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0)
  }
  const [collectedNow, collectedPrev] = orFilter
    ? [null, null]
    : await Promise.all([collectedBetween(from, to), collectedBetween(prevFrom, prevTo)])

  const inRange = (r: Row, a: string, b: string) => r.appointment_date >= a && r.appointment_date <= b
  const current = kpisFrom(rows.filter(r => inRange(r, from, to)), collectedNow)
  const previous = kpisFrom(rows.filter(r => inRange(r, prevFrom, prevTo)), collectedPrev)

  const daily = Array.from({ length: 14 }, (_, i) => {
    const date = iso(new Date(parse(chartFrom).getTime() + i * DAY))
    return { date, visits: rows.filter(r => r.appointment_date === date && r.status !== 'cancelled').length }
  })

  return NextResponse.json({ current, previous, daily, period: { from, to, prevFrom, prevTo } })
}
