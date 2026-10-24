import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { sendExpoPush } from '@/lib/push'

/**
 * POST /api/locum/jobs/[id]/select   { responseId }
 *
 * The poster picks a doctor. This is the moment the doctor's phone number is
 * released to the poster -- the GET route returns it only for a selected
 * response -- so it is also the moment the doctor is told their number has
 * been shared. Nobody's contact details leave this system silently.
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

  const { responseId } = await req.json().catch(() => ({})) as { responseId?: string }
  if (!responseId) return withCors(Errors.validation('Choose a doctor.'))

  const { data: job } = await db.from('locum_jobs')
    .select('id, posted_by, status, starts_on, rate_per_hour, employment_type, hospital:hospitals(name)')
    .eq('id', id).maybeSingle()
  if (!job) return withCors(Errors.notFound('Job'))
  if (job.posted_by !== me.id) return withCors(Errors.forbidden())
  if (job.status === 'cancelled') return withCors(Errors.validation('This post was cancelled.'))

  const { data: resp } = await db.from('locum_responses')
    .select('id, doctor_user_id, effective_rate, selected_at')
    .eq('id', responseId).eq('job_id', id).maybeSingle()
  if (!resp) return withCors(Errors.notFound('Response'))
  if (resp.selected_at) return withCors(NextResponse.json({ ok: true, alreadySelected: true }))

  const now = new Date().toISOString()
  const { error: sErr } = await db.from('locum_responses')
    .update({ selected_at: now }).eq('id', responseId)
  if (sErr) return withCors(Errors.internal(sErr.message))

  // The post is filled by the first selection and leaves the board at once.
  // Other responses stay visible to the poster -- a selected doctor can still
  // fall through, and re-opening a closed post to find the second choice would
  // be worse than keeping the list.
  const { data: justClosed } = await db.from('locum_jobs')
    .update({ status: 'filled', filled_with: resp.doctor_user_id, updated_at: now })
    .eq('id', id).eq('status', 'open')
    .select('id').maybeSingle()

  try {
    const hospitalName = (job as any).hospital?.name ?? 'the hospital'
    const title = 'You were selected'
    const body = `${hospitalName} · ${job.starts_on} · ₦${Number(resp.effective_rate).toLocaleString()}/hr. They can now see your phone number.`

    await db.from('notifications').insert({
      user_id: resp.doctor_user_id, type: 'locum_selected', title, body,
      data: { jobId: id },
    } as any)

    const { data: doc } = await db.from('users')
      .select('id, push_token').eq('id', resp.doctor_user_id).maybeSingle()
    if (doc?.push_token) {
      await sendExpoPush(db, doc.id, doc.push_token, title, body, { jobId: id, type: 'locum_selected' })
        .catch(() => false)
    }

    // Everyone else who put their name forward is told the post is closed, and
    // only on the selection that actually closed it -- justClosed is null when
    // the job had already left 'open', so a second selection cannot send this
    // round twice. Leaving them to notice the post vanish would have them
    // holding a date for work that is not coming.
    if (justClosed) {
      const { data: losers } = await db.from('locum_responses')
        .select('doctor_user_id, doctor:users!locum_responses_doctor_user_id_fkey(id, push_token)')
        .eq('job_id', id).is('selected_at', null)

      const others = (losers ?? []) as any[]
      if (others.length) {
        const closedTitle = 'Posting closed'
        const closedBody = `${hospitalName} · this ${job.employment_type === 'full_time' ? 'position' : 'shift'} has been filled.`

        await db.from('notifications').insert(others.map(o => ({
          user_id: o.doctor_user_id,
          type: 'locum_closed',
          title: closedTitle,
          body: closedBody,
          data: { jobId: id, reason: 'filled' },
        })) as any)

        await Promise.all(others
          .filter(o => o.doctor?.push_token)
          .map(o => sendExpoPush(db, o.doctor.id, o.doctor.push_token, closedTitle, closedBody,
            { jobId: id, type: 'locum_closed' }).catch(() => false)))
      }
    }
  } catch (e) {
    console.error('[locum] select notify failed', e)
  }

  return withCors(NextResponse.json({ ok: true }))
}
