import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { sendExpoPush } from '@/lib/push'

/**
 * GET  /api/locum/jobs?scope=feed|mine
 *      feed — open posts in the caller's state, soonest first.
 *      mine — everything the caller has posted, with a response count.
 * POST /api/locum/jobs
 *      Advertise a shift. The hospital must be one the caller is attached to,
 *      and the state comes from that hospital, never from the body.
 *
 * Everything here runs on the service role; locum_jobs and locum_responses have
 * RLS on with no policies, so these routes are the only way in.
 */

export async function OPTIONS() { return corsOptions() }

function withCors(res: NextResponse) {
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

/**
 * The states a doctor counts as being in: the one on their own profile, plus
 * every hospital they are attached to. Without the second half the board would
 * reach almost nobody -- a doctor's personal state is optional at sign-up and
 * is usually unset, while their hospital always has one.
 */
async function statesForDoctor(db: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ data: me }, { data: links }] = await Promise.all([
    db.from('users').select('state').eq('id', userId).maybeSingle(),
    db.from('doctors').select('hospital:hospitals(state)').eq('user_id', userId),
  ])
  const states = new Set<string>()
  if (me?.state) states.add(me.state)
  for (const l of (links ?? []) as any[]) if (l.hospital?.state) states.add(l.hospital.state)
  return [...states]
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return withCors(auth)
  const { caller } = auth
  const db = createAdminClient()

  const { data: me } = await db.from('users').select('id').eq('auth_id', caller.authId).maybeSingle()
  if (!me) return withCors(Errors.notFound('User profile'))

  const scope = new URL(req.url).searchParams.get('scope') ?? 'feed'

  const SELECT =
    'id, employment_type, state, lga, starts_on, start_time, end_time, rate_per_hour, ' +
    'hours, total_amount, notes, status, created_at, posted_by, expires_at, ' +
    'hospital:hospitals(id, name, city), specialty:specialties(id, name)'

  if (scope === 'mine') {
    const { data, error } = await db.from('locum_jobs')
      .select(`${SELECT}, responses:locum_responses(id, selected_at)`)
      .eq('posted_by', me.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return withCors(Errors.internal(error.message))
    const jobs = (data ?? []).map((j: any) => ({
      ...j,
      responses: undefined,
      responseCount: (j.responses ?? []).length,
      selectedCount: (j.responses ?? []).filter((r: any) => r.selected_at).length,
    }))
    return withCors(NextResponse.json({ jobs }))
  }

  const states = await statesForDoctor(db, me.id)
  if (!states.length) {
    // Not an error: a doctor with no state on file and no hospital link simply
    // has no board yet. The app explains how to get one.
    return withCors(NextResponse.json({ jobs: [], states: [], reason: 'no_state' }))
  }

  // Filtered on expires_at rather than waiting for the hourly sweep, so a post
  // is invisible the moment its deadline passes: 24h after the start date for a
  // locum shift, a month for a permanent post. The sweep only flips the status
  // and notifies -- it is not what makes a job disappear.
  const { data, error } = await db.from('locum_jobs')
    .select(`${SELECT}, responses:locum_responses(doctor_user_id)`)
    .in('state', states)
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .neq('posted_by', me.id)          // your own post is not a job offer to you
    .order('starts_on', { ascending: true })
    .limit(100)
  if (error) return withCors(Errors.internal(error.message))

  const jobs = (data ?? []).map((j: any) => ({
    ...j,
    responses: undefined,
    // So the feed can show "you responded" without a second round trip.
    myResponse: (j.responses ?? []).some((r: any) => r.doctor_user_id === me.id),
  }))
  return withCors(NextResponse.json({ jobs, states }))
}

interface Body {
  hospitalId?: string
  employmentType?: string
  lga?: string
  startsOn?: string
  startTime?: string
  endTime?: string
  ratePerHour?: number
  specialtyId?: string
  notes?: string
}

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isTime = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

export async function POST(req: NextRequest) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return withCors(auth)
  const { caller } = auth
  const db = createAdminClient()

  const { data: me } = await db.from('users').select('id, full_name').eq('auth_id', caller.authId).maybeSingle()
  if (!me) return withCors(Errors.notFound('User profile'))

  const b = (await req.json().catch(() => ({}))) as Body
  const employmentType = b.employmentType === 'full_time' ? 'full_time' : 'locum'

  if (!b.hospitalId) return withCors(Errors.validation('Choose a hospital.'))
  if (!isDate(b.startsOn)) return withCors(Errors.validation('Choose a date.'))
  if (typeof b.ratePerHour !== 'number' || !(b.ratePerHour >= 0)) {
    return withCors(Errors.validation('Enter a rate per hour.'))
  }
  if (b.ratePerHour > 10_000_000) return withCors(Errors.validation('That rate looks wrong.'))
  if (b.startTime && !isTime(b.startTime)) return withCors(Errors.validation('Start time must be HH:MM.'))
  if (b.endTime && !isTime(b.endTime)) return withCors(Errors.validation('End time must be HH:MM.'))
  if ((b.startTime && !b.endTime) || (!b.startTime && b.endTime)) {
    return withCors(Errors.validation('Give both a start and an end time, or neither.'))
  }

  // A doctor may only advertise somewhere they actually work. Checked against
  // their own doctors rows, so a hospital id from the body proves nothing.
  // Matched on either id column, the same way AuthContext resolves a doctor's
  // links: a portal-created row carries user_id, a self-registered one carries
  // auth_user_id. Filtering on user_id alone would reject a self-registered
  // doctor whose hospitals the app had just offered them.
  //
  // limit(1) rather than maybeSingle(): a doctor with two rows at one hospital
  // is unusual but not impossible, and it should not turn into an error here.
  const { data: links } = await db.from('doctors')
    .select('id, hospital:hospitals(id, name, state)')
    .eq('hospital_id', b.hospitalId)
    .eq('is_active', true)
    .or(`user_id.eq.${me.id},auth_user_id.eq.${caller.authId}`)
    .limit(1)
  const link = links?.[0]
  const hospital = (link as any)?.hospital
  if (!link || !hospital) {
    return withCors(Errors.validation('You can only post for a hospital you are attached to.'))
  }
  if (!hospital.state) {
    return withCors(Errors.validation(`${hospital.name} has no state set, so nobody could be notified. Ask the hospital to set it first.`))
  }

  const { data: job, error } = await db.from('locum_jobs').insert({
    posted_by: me.id,
    hospital_id: hospital.id,
    employment_type: employmentType,
    state: hospital.state,
    lga: b.lga?.trim() || null,
    starts_on: b.startsOn,
    start_time: b.startTime || null,
    end_time: b.endTime || null,
    rate_per_hour: b.ratePerHour,
    specialty_id: b.specialtyId || null,
    notes: b.notes?.trim()?.slice(0, 2000) || null,
  } as any).select('id, state, starts_on, rate_per_hour, total_amount').single()

  if (error || !job) return withCors(Errors.internal(error?.message ?? 'Could not post the job.'))

  // Notify every other doctor in that state. Best effort: a notification that
  // fails must not undo a job that is already posted.
  try {
    const { data: candidates } = await db.from('doctors')
      .select('user_id, hospital:hospitals(state)')
      .not('user_id', 'is', null)
    const { data: byProfile } = await db.from('users').select('id').eq('state', job.state)

    const targets = new Set<string>()
    for (const c of (candidates ?? []) as any[]) {
      if (c.hospital?.state === job.state) targets.add(c.user_id)
    }
    for (const u of byProfile ?? []) targets.add((u as any).id)
    targets.delete(me.id)

    if (targets.size) {
      const money = job.total_amount
        ? `₦${Number(job.total_amount).toLocaleString()}`
        : `₦${Number(job.rate_per_hour).toLocaleString()}/hr`
      const title = employmentType === 'full_time' ? 'New position posted' : 'New locum shift'
      const body = `${hospital.name} · ${job.starts_on} · ${money}`

      await db.from('notifications').insert([...targets].map(uid => ({
        user_id: uid,
        type: 'locum_job',
        title,
        body,
        data: { jobId: job.id, state: job.state },
      })))

      // The token lives on the user row, and sendExpoPush is per recipient.
      const { data: tokens } = await db.from('users')
        .select('id, push_token').in('id', [...targets]).not('push_token', 'is', null)
      await Promise.all((tokens ?? []).map((u: any) =>
        sendExpoPush(db, u.id, u.push_token, title, body, { jobId: job.id, type: 'locum_job' })
          .catch(() => false)))
    }
  } catch (e) {
    console.error('[locum] notify failed', e)
  }

  return withCors(NextResponse.json({ id: job.id }, { status: 201 }))
}
