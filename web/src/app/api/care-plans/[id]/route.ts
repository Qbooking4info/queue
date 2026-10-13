import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { adherence, isoDay, type PlanTask, type TaskLog, type Cadence } from '@/lib/care-plans'

/**
 * GET   /api/care-plans/[id]  plan, tasks, 28 days of ticks, 7-day and per-week adherence
 * PATCH /api/care-plans/[id]  { status?, nextCheckIn?, notes?, endsOn?, addTasks?: [...], removeTaskIds?: [...] }
 * Only for plans at the caller's hospital. Shared by web and Queue Hospital.
 */
const STAFF = ['hospital_admin', 'clinic_admin', 'front_desk'] as const
const DAY = 86_400_000
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

async function load(db: ReturnType<typeof createAdminClient>, id: string, hospitalId: string) {
  const { data } = await db.from('care_plans')
    .select(`id, hospital_id, title, condition, notes, status, starts_on, ends_on, next_check_in, created_at, patient_id,
      patient:users!care_plans_patient_id_fkey(full_name, phone),
      doctor:doctors(full_name),
      tasks:care_plan_tasks(id, title, cadence, due_on, sort_order)`)
    .eq('id', id).eq('hospital_id', hospitalId).maybeSingle()
  return data as unknown as (Record<string, unknown> & { id: string; starts_on: string; ends_on: string | null; tasks: PlanTask[] | null }) | null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole([...STAFF], req)
  if (auth instanceof NextResponse) return auth
  if (!auth.caller.hospitalId) return Errors.forbidden()
  const { id } = await params
  const db = createAdminClient()
  const plan = await load(db, id, auth.caller.hospitalId)
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tasks = (plan.tasks ?? []).sort((a, b) => a.sort_order - b.sort_order)
  const { data: logsRaw } = await db.from('care_plan_task_logs').select('task_id, done_on, done_at')
    .eq('plan_id', id).gte('done_on', isoDay(new Date(Date.now() - 27 * DAY))).order('done_at', { ascending: false })
  const logs = (logsRaw ?? []) as TaskLog[]

  // Four weekly buckets, oldest first, each scored against the plan's own dates.
  const weeks = [3, 2, 1, 0].map(w => {
    const endIso = isoDay(new Date(Date.now() - w * 7 * DAY))
    const startIso = isoDay(new Date(Date.now() - (w * 7 + 6) * DAY))
    return { from: startIso, to: endIso, ...adherence(tasks, logs, plan, 7, endIso) }
  })

  return NextResponse.json({
    plan: { ...plan, tasks },
    logs,
    adherence7: adherence(tasks, logs, plan).pct,
    weeks,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole([...STAFF], req)
  if (auth instanceof NextResponse) return auth
  if (!auth.caller.hospitalId) return Errors.forbidden()
  const { id } = await params
  const db = createAdminClient()
  const plan = await load(db, id, auth.caller.hospitalId)
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const patch: { updated_at: string; status?: string; next_check_in?: string | null; ends_on?: string | null; notes?: string | null } = { updated_at: new Date().toISOString() }
  if (b.status !== undefined) {
    if (!['active', 'completed', 'stopped'].includes(b.status as string)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    patch.status = b.status as string
  }
  if (b.nextCheckIn !== undefined) patch.next_check_in = isDate(b.nextCheckIn) ? b.nextCheckIn : null
  if (b.endsOn !== undefined) {
    if (b.endsOn !== null && !isDate(b.endsOn)) return NextResponse.json({ error: 'Invalid end date' }, { status: 400 })
    if (isDate(b.endsOn) && b.endsOn < plan.starts_on) return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 })
    patch.ends_on = b.endsOn as string | null
  }
  if (b.notes !== undefined) patch.notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 2000) : null

  const { error } = await db.from('care_plans').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(b.removeTaskIds) && b.removeTaskIds.length) {
    await db.from('care_plan_tasks').delete().eq('plan_id', id).in('id', (b.removeTaskIds as unknown[]).filter((x): x is string => typeof x === 'string'))
  }
  if (Array.isArray(b.addTasks) && b.addTasks.length) {
    const base = (plan.tasks ?? []).reduce((m, t) => Math.max(m, t.sort_order), -1) + 1
    const rows = (b.addTasks as Record<string, unknown>[])
      .map((t, i) => ({ plan_id: id, title: typeof t.title === 'string' ? t.title.trim().slice(0, 160) : '',
        cadence: (['daily', 'weekly', 'once'] as Cadence[]).includes(t.cadence as Cadence) ? t.cadence as Cadence : 'daily',
        due_on: isDate(t.dueOn) ? t.dueOn : null, sort_order: base + i }))
      .filter(t => t.title && (t.cadence !== 'once' || t.due_on))
    if (rows.length) {
      const { error: tErr } = await db.from('care_plan_tasks').insert(rows)
      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
