import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() {
  return corsOptions()
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const OPEN_STATUSES = ['pending', 'pending_approval', 'confirmed', 'checked_in', 'in_progress']
const VALID_TYPES = ['in-person', 'virtual', 'home_visit']

function avgMinutes(secs: number[]): number | null {
  if (secs.length === 0) return null
  return Math.round((secs.reduce((sum, v) => sum + v, 0) / secs.length) / 60)
}

interface ApptRow {
  id: string
  status: string
  type: string
  appointment_date: string
  patient_id: string | null
  waiting_time_secs: number | null
  consult_duration_secs: number | null
}

// GET /api/doctors/me/stats?from&to&type
//
// "Everything about myself" for a doctor -- one person's practice, not one
// hospital's. A doctor can be linked to several hospitals (a `doctors` row
// each) and/or take fully independent bookings (doctor_user_id, no
// hospital_id at all -- see enforce_doctor_assignable's own split on this).
// Scoping by a single doctors.id or a single hospitalId, the way
// /api/appointments/stats does, would silently drop most of a multi-hospital
// or independent doctor's own history. This resolves every doctors.id row
// tied to the caller's own person (across every hospital) plus their direct
// user id, and unions across both.
//
// Deliberately no revenue/earnings figure here: that would need a different
// fee source per booking path (hospital-set opd_fee, the doctor's own
// consultation_fee on each hospital link, or doctor_profiles' virtual/
// home_visit fee for fully independent bookings) layered on top of a system
// that already labels its hospital-side revenue "estimated, not a settled
// ledger" -- multiplying that same uncertainty across several fee sources
// risks a doctor mistaking a rough guess for money actually received.
export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const type = searchParams.get('type')
  if (!from || !to) return Errors.validation('from and to are required')
  if (type && !VALID_TYPES.includes(type)) return Errors.validation('type must be in-person, virtual or home_visit')

  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id').eq('auth_id', caller.authId).single()
  if (!profile) return Errors.notFound('User')
  const userId = profile.id

  const { data: doctorRows } = await db.from('doctors').select('id').eq('user_id', userId)
  const doctorIds = (doctorRows ?? []).map((d: any) => d.id as string)

  const orParts = [
    ...(doctorIds.length ? [`doctor_id.in.(${doctorIds.join(',')})`, `assigned_doctor_id.in.(${doctorIds.join(',')})`] : []),
    `doctor_user_id.eq.${userId}`,
  ]

  const fetchRange = async (rangeFrom: string, rangeTo: string, typeFilter?: string): Promise<ApptRow[]> => {
    const PAGE = 1000
    const rows: ApptRow[] = []
    for (let offset = 0; ; offset += PAGE) {
      let q = db.from('appointments')
        .select('id, status, type, appointment_date, patient_id, waiting_time_secs, consult_duration_secs')
        .gte('appointment_date', rangeFrom).lte('appointment_date', rangeTo)
        .or(orParts.join(','))
      if (typeFilter) q = q.eq('type', typeFilter)
      const { data, error } = await q.range(offset, offset + PAGE - 1) as { data: ApptRow[] | null; error: unknown }
      if (error) throw error
      const batch = data ?? []
      rows.push(...batch)
      if (batch.length < PAGE) break
    }
    return rows
  }

  try {
    const rows = await fetchRange(from, to, type ?? undefined)

    const completed = rows.filter(r => r.status === 'completed')
    const cancelled = rows.filter(r => r.status === 'cancelled').length
    const noShow = rows.filter(r => r.status === 'no_show').length
    const open = rows.filter(r => OPEN_STATUSES.includes(r.status)).length
    const uniquePatients = new Set(rows.map(r => r.patient_id).filter(Boolean)).size

    const byType = {
      inPerson: rows.filter(r => r.type === 'in-person').length,
      virtual:  rows.filter(r => r.type === 'virtual').length,
      homeVisit: rows.filter(r => r.type === 'home_visit').length,
    }

    const avgWaitMinutes = avgMinutes(rows.map(r => r.waiting_time_secs).filter((v): v is number => v != null))
    const avgConsultMinutes = avgMinutes(rows.map(r => r.consult_duration_secs).filter((v): v is number => v != null))

    let rating: { avg: number | null; count: number } = { avg: null, count: 0 }
    if (rows.length) {
      const ids = rows.map(r => r.id)
      const CHUNK = 300
      const ratings: number[] = []
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data: revs } = await db.from('reviews').select('rating').in('appointment_id', ids.slice(i, i + CHUNK))
        ;(revs ?? []).forEach((r: any) => { if (typeof r.rating === 'number') ratings.push(r.rating) })
      }
      if (ratings.length) rating = { avg: Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10, count: ratings.length }
    }

    // YTD monthly trend -- independent of the from/to range picker (same as
    // StaffAnalyticsScreen's own YTD chart), but still respects the type filter
    // so "show me only my virtual consults" reads consistently everywhere on
    // the page.
    const now = new Date()
    const year = now.getFullYear()
    const curMonth = now.getMonth()
    const pad = (n: number) => String(n).padStart(2, '0')
    const ytdRows = await fetchRange(`${year}-01-01`, `${year}-${pad(curMonth + 1)}-${pad(new Date(year, curMonth + 1, 0).getDate())}`, type ?? undefined)
    const counts = Array(curMonth + 1).fill(0)
    ytdRows.forEach(r => {
      const m = new Date(r.appointment_date + 'T00:00:00').getMonth()
      if (m <= curMonth) counts[m]++
    })
    const monthly = MONTH_NAMES.slice(0, curMonth + 1).map((m, i) => ({ month: m, count: counts[i] }))

    return NextResponse.json({
      total: rows.length, completed: completed.length, cancelled, noShow, open, uniquePatients,
      byType, avgWaitMinutes, avgConsultMinutes, rating, monthly,
    })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}
