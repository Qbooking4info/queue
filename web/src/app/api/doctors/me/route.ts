import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// Doctor self-service: their own stats (Task 15, replacing admin-api.ts's
// getDoctorAvgConsultDuration) and their own availability status (replacing
// setDoctorAvailability). Both keyed on caller.doctorId from the server-verified
// session by default -- never a client-supplied doctorId -- but GET now also
// accepts an optional hospitalId, resolved against the CALLER'S OWN doctors
// rows only (any is_active state, not just their currently-active one), so a
// multi-hospital doctor can view stats for a past/other affiliation without
// being able to read anyone else's.
//
// from/to/hospitalId are all optional; omitting all three preserves the exact
// prior all-time/currently-active-hospital behaviour unchanged.
//
// Also called cross-origin by the doctors app (localhost:8095 -> localhost:3000)
// for its dashboard's average-consultation-time stat -- needs real CORS handling
// and requireRole's bearer-token path (same fix as appointments/[id]/route.ts).
export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.doctorId) return Errors.forbidden()
  const db = createAdminClient()

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const hospitalId = searchParams.get('hospitalId')

  let doctorId = caller.doctorId
  if (hospitalId) {
    const { data: profile } = await db.from('users').select('id').eq('auth_id', caller.authId).single()
    const { data: doctorRow } = await db
      .from('doctors')
      .select('id')
      .eq('hospital_id', hospitalId)
      .or(`auth_user_id.eq.${caller.authId}${profile ? `,user_id.eq.${profile.id}` : ''}`)
      .maybeSingle()
    if (!doctorRow) return Errors.forbidden('You are not linked to that hospital')
    doctorId = doctorRow.id
  }

  let consultQuery = db.from('appointments')
    .select('status, consult_duration_secs', { count: 'exact' })
    .eq('doctor_id', doctorId)
  if (from && to) consultQuery = consultQuery.gte('appointment_date', from).lte('appointment_date', to)
  const { data: apptRows, count: total } = await consultQuery

  const rows = (apptRows ?? []) as { status: string; consult_duration_secs: number | null }[]
  const completed = rows.filter(r => r.status === 'completed').length
  const durations = rows.map(r => r.consult_duration_secs).filter((v): v is number => v != null)
  const avgConsultSecs = durations.length === 0
    ? null
    : durations.reduce((sum, v) => sum + v, 0) / durations.length

  let reviewQuery = db.from('reviews').select('rating').eq('doctor_id', doctorId)
  if (from && to) reviewQuery = reviewQuery.gte('created_at', from).lte('created_at', `${to}T23:59:59`)
  const { data: reviewRows } = await reviewQuery
  const ratings = ((reviewRows ?? []) as { rating: number }[]).map(r => r.rating)
  const reviewCount = ratings.length
  const avgRatingOutOf10 = reviewCount === 0
    ? null
    : Math.round((ratings.reduce((sum, r) => sum + r, 0) / reviewCount) * 2 * 100) / 100

  return NextResponse.json({
    avgConsultSecs, avgRatingOutOf10, reviewCount,
    total: total ?? 0, completed,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(['doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.doctorId) return Errors.forbidden()
  const db = createAdminClient()

  const { availability_status } = await req.json()
  if (!['on_duty', 'on_break', 'off_duty'].includes(availability_status)) {
    return Errors.validation('Invalid availability_status')
  }

  const { error } = await (db.from('doctors') as any)
    .update({ availability_status })
    .eq('id', caller.doctorId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
