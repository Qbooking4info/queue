import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * GET   /api/locum/jobs/[id]
 *       The post, plus — for the poster only — every response, ranked cheapest
 *       first and earliest first among equals.
 * PATCH /api/locum/jobs/[id]   { action: 'cancel' }
 *
 * The phone-number gate lives here: a responder's number is returned only once
 * the poster has selected them. Until then the poster sees a name, a rate and a
 * time, which is everything needed to choose and nothing more.
 */

export async function OPTIONS() { return corsOptions() }

function withCors(res: NextResponse) {
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return withCors(auth)
  const db = createAdminClient()

  const { data: me } = await db.from('users').select('id').eq('auth_id', auth.caller.authId).maybeSingle()
  if (!me) return withCors(Errors.notFound('User profile'))

  const { data: job, error } = await db.from('locum_jobs')
    .select(
      'id, employment_type, state, lga, starts_on, start_time, end_time, rate_per_hour, ' +
      'hours, total_amount, notes, status, created_at, posted_by, ' +
      'hospital:hospitals(id, name, city, state), specialty:specialties(id, name), ' +
      'poster:users!locum_jobs_posted_by_fkey(full_name)',
    )
    .eq('id', id).maybeSingle()
  if (error) return withCors(Errors.internal(error.message))
  if (!job) return withCors(Errors.notFound('Job'))

  const isPoster = (job as any).posted_by === me.id

  if (!isPoster) {
    // A responder sees the post and their own response, never anyone else's --
    // otherwise the board becomes an auction where everyone can undercut.
    const { data: mine } = await db.from('locum_responses')
      .select('id, kind, counter_rate, effective_rate, message, selected_at, created_at')
      .eq('job_id', id).eq('doctor_user_id', me.id).maybeSingle()
    return withCors(NextResponse.json({ job, isPoster: false, myResponse: mine ?? null }))
  }

  const { data: rows } = await db.from('locum_responses')
    .select(
      'id, kind, counter_rate, effective_rate, message, selected_at, created_at, doctor_user_id, ' +
      'doctor:users!locum_responses_doctor_user_id_fkey(full_name, phone, avatar_url)',
    )
    .eq('job_id', id)
    .order('effective_rate', { ascending: true })
    .order('created_at', { ascending: true })

  const responses = (rows ?? []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    counterRate: r.counter_rate,
    effectiveRate: r.effective_rate,
    message: r.message,
    selectedAt: r.selected_at,
    createdAt: r.created_at,
    doctorUserId: r.doctor_user_id,
    fullName: r.doctor?.full_name ?? 'Doctor',
    avatarUrl: r.doctor?.avatar_url ?? null,
    // Released on selection only.
    phone: r.selected_at ? (r.doctor?.phone ?? null) : null,
  }))

  return withCors(NextResponse.json({ job, isPoster: true, responses }))
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return withCors(auth)
  const db = createAdminClient()

  const { data: me } = await db.from('users').select('id').eq('auth_id', auth.caller.authId).maybeSingle()
  if (!me) return withCors(Errors.notFound('User profile'))

  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'cancel') return withCors(Errors.validation('Unsupported action.'))

  // Conditioned on posted_by so a doctor cannot cancel someone else's post, and
  // on status so a filled job is not quietly reopened as cancelled.
  const { data, error } = await db.from('locum_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id).eq('posted_by', me.id).eq('status', 'open')
    .select('id').maybeSingle()
  if (error) return withCors(Errors.internal(error.message))
  if (!data) return withCors(Errors.validation('This post can no longer be cancelled.'))

  return withCors(NextResponse.json({ ok: true }))
}
