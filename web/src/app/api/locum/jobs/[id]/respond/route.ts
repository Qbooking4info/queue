import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { sendExpoPush } from '@/lib/push'

/**
 * POST   /api/locum/jobs/[id]/respond
 *        { kind: 'accept' | 'counter', counterRate?: number, message?: string }
 * DELETE /api/locum/jobs/[id]/respond — withdraw.
 *
 * effective_rate is set here, never sent by the client: the posted rate on an
 * accept, the doctor's own on a counter. It is what the poster's ranking sorts
 * on, so a client that could set it could buy the top of the list.
 */

export async function OPTIONS() { return corsOptions() }

function withCors(res: NextResponse) {
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return withCors(auth)
  const db = createAdminClient()

  const { data: me } = await db.from('users').select('id, full_name').eq('auth_id', auth.caller.authId).maybeSingle()
  if (!me) return withCors(Errors.notFound('User profile'))

  const b = await req.json().catch(() => ({})) as { kind?: string; counterRate?: number; message?: string }
  const kind = b.kind === 'counter' ? 'counter' : b.kind === 'accept' ? 'accept' : null
  if (!kind) return withCors(Errors.validation('Choose accept or counter.'))

  const { data: job } = await db.from('locum_jobs')
    .select('id, posted_by, status, rate_per_hour, hours, starts_on')
    .eq('id', id).maybeSingle()
  if (!job) return withCors(Errors.notFound('Job'))
  if (job.posted_by === me.id) return withCors(Errors.validation('This is your own post.'))
  if (job.status !== 'open') return withCors(Errors.validation('This post is no longer open.'))

  let effective = Number(job.rate_per_hour)
  if (kind === 'counter') {
    const r = b.counterRate
    if (typeof r !== 'number' || !(r > 0)) return withCors(Errors.validation('Enter the rate you want.'))
    if (r > 10_000_000) return withCors(Errors.validation('That rate looks wrong.'))
    if (r <= Number(job.rate_per_hour)) {
      // Countering at or below the asking price is an accept; saying so avoids
      // a response that looks like a negotiation but is not one.
      return withCors(Errors.validation('Your rate is not higher than the posted rate — accept it instead.'))
    }
    effective = r
  }

  // Upsert on the one-response-per-doctor constraint: changing your mind
  // replaces your response rather than stacking a second one.
  const { data: saved, error } = await db.from('locum_responses').upsert({
    job_id: id,
    doctor_user_id: me.id,
    kind,
    counter_rate: kind === 'counter' ? effective : null,
    effective_rate: effective,
    message: b.message?.trim()?.slice(0, 500) || null,
  } as any, { onConflict: 'job_id,doctor_user_id' }).select('id').single()

  if (error || !saved) return withCors(Errors.internal(error?.message ?? 'Could not save your response.'))

  // Tell the poster. Best effort -- the response is already saved.
  try {
    const hours = job.hours ? Number(job.hours) : null
    const money = hours
      ? `₦${(effective * hours).toLocaleString()} total`
      : `₦${effective.toLocaleString()}/hr`
    const title = kind === 'accept' ? 'Shift accepted' : 'Counter offer'
    const body = `${me.full_name ?? 'A doctor'} · ${money}`

    await db.from('notifications').insert({
      user_id: job.posted_by, type: 'locum_response', title, body,
      data: { jobId: id, responseId: saved.id },
    } as any)

    const { data: poster } = await db.from('users')
      .select('id, push_token').eq('id', job.posted_by).maybeSingle()
    if (poster?.push_token) {
      await sendExpoPush(db, poster.id, poster.push_token, title, body, { jobId: id, type: 'locum_response' })
        .catch(() => false)
    }
  } catch (e) {
    console.error('[locum] respond notify failed', e)
  }

  return withCors(NextResponse.json({ id: saved.id, effectiveRate: effective }))
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return withCors(auth)
  const db = createAdminClient()

  const { data: me } = await db.from('users').select('id').eq('auth_id', auth.caller.authId).maybeSingle()
  if (!me) return withCors(Errors.notFound('User profile'))

  // Not once selected: by then the poster has their number and may have acted
  // on it, so withdrawing is a conversation, not a button.
  const { data, error } = await db.from('locum_responses')
    .delete().eq('job_id', id).eq('doctor_user_id', me.id).is('selected_at', null)
    .select('id').maybeSingle()
  if (error) return withCors(Errors.internal(error.message))
  if (!data) return withCors(Errors.validation('You have already been selected for this shift.'))

  return withCors(NextResponse.json({ ok: true }))
}
