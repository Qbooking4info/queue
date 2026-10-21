import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { adherence, isoDay, type PlanTask, type TaskLog, type Cadence } from '@/lib/care-plans'

/**
 * GET  /api/care-plans?status=active|completed|stopped|all
 *      The hospital's care plans with patient, task count and 7-day adherence.
 * POST /api/care-plans
 *      { patientId, title, condition?, notes?, startsOn?, endsOn?, nextCheckIn?, doctorId?,
 *        tasks: [{ title, cadence: 'daily'|'weekly'|'once', dueOn? }] }
 *      The patient must have a visit at this hospital. Shared by web and Queue Hospital.
 */
const STAFF = ['hospital_admin', 'clinic_admin', 'front_desk'] as const

type PlanRow = {
  id: string; title: string; condition: string | null; status: string; starts_on: string; ends_on: string | null
  next_check_in: string | null; created_at: string; patient_id: string
  patient: { full_name: string | null; phone: string | null } | null
  doctor: { full_name: string | null } | null
  tasks: PlanTask[] | null
}

export async function GET(req: NextRequest) {
  const auth = await requireRole([...STAFF], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()

  const status = req.nextUrl.searchParams.get('status') ?? 'active'
  const db = createAdminClient()
  let q = db.from('care_plans')
    .select(`id, title, condition, status, starts_on, ends_on, next_check_in, created_at, patient_id,
      patient:users!care_plans_patient_id_fkey(full_name, phone),
      doctor:doctors(full_name),
      tasks:care_plan_tasks(id, title, cadence, due_on, sort_order)`)
    .eq('hospital_id', caller.hospitalId).order('created_at', { ascending: false }).limit(500)
  if (status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const plans = (data ?? []) as unknown as PlanRow[]

  const since = isoDay(new Date(Date.now() - 6 * 86_400_000))
  const { data: logs } = plans.length
    ? await db.from('care_plan_task_logs').select('task_id, plan_id, done_on, done_at').in('plan_id', plans.map(p => p.id)).gte('done_on', since)
    : { data: [] as (TaskLog & { plan_id: string })[] }

  return NextResponse.json({
    plans: plans.map(p => {
      const pl = ((logs ?? []) as (TaskLog & { plan_id: string })[]).filter(l => l.plan_id === p.id)
      const last = pl.map(l => l.done_at).sort().pop() ?? null
      return {
        id: p.id, title: p.title, condition: p.condition, status: p.status,
        startsOn: p.starts_on, endsOn: p.ends_on, nextCheckIn: p.next_check_in,
        patientId: p.patient_id, patient: p.patient?.full_name?.trim() || 'Unnamed patient', patientPhone: p.patient?.phone ?? null,
        doctor: p.doctor?.full_name ?? null, taskCount: (p.tasks ?? []).length,
        adherence: adherence(p.tasks ?? [], pl, p).pct, lastActivity: last,
      }
    }),
  })
}

const CADENCES: Cadence[] = ['daily', 'weekly', 'once']
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function POST(req: NextRequest) {
  // Care plans are written in the consultation now, so the author is the
  // treating doctor. Hospital staff keep POST access for the plans already in
  // flight, but the hospital apps no longer offer it.
  const auth = await requireRole([...STAFF, 'doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const asDoctor = caller.role === 'doctor'
  if (!asDoctor && !caller.hospitalId) return Errors.forbidden()

  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const title = typeof b?.title === 'string' ? b.title.trim() : ''
  const tasks = Array.isArray(b?.tasks) ? (b!.tasks as Record<string, unknown>[]) : []
  if (!b || typeof b.patientId !== 'string' || !title) return NextResponse.json({ error: 'Patient and title are required.' }, { status: 400 })
  if (title.length > 120) return NextResponse.json({ error: 'Title is too long (120 characters max).' }, { status: 400 })
  const cleanTasks = tasks
    .map((t, i) => ({ title: typeof t.title === 'string' ? t.title.trim() : '', cadence: CADENCES.includes(t.cadence as Cadence) ? t.cadence as Cadence : 'daily',
      due_on: isDate(t.dueOn) ? t.dueOn : null, sort_order: i }))
    .filter(t => t.title)
  if (!cleanTasks.length) return NextResponse.json({ error: 'Add at least one task.' }, { status: 400 })
  if (cleanTasks.some(t => t.title.length > 160)) return NextResponse.json({ error: 'A task is too long (160 characters max).' }, { status: 400 })
  if (cleanTasks.some(t => t.cadence === 'once' && !t.due_on)) return NextResponse.json({ error: 'One-off tasks need a due date.' }, { status: 400 })
  const startsOn = isDate(b.startsOn) ? b.startsOn : isoDay(new Date())
  const endsOn = isDate(b.endsOn) ? b.endsOn : null
  if (endsOn && endsOn < startsOn) return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 })

  const db = createAdminClient()
  const { data: me } = await db.from('users').select('id').eq('auth_id', caller.authId).single()

  // Who the plan belongs to, resolved server-side. The doctor and the hospital
  // are never taken from the request body: a client that could name either
  // could write a plan into someone else's hospital, or under another doctor.
  let doctorId: string | null = null
  let hospitalId: string | null = null

  if (asDoctor) {
    if (!caller.doctorId) return Errors.forbidden()
    doctorId = caller.doctorId

    // The doctor must actually have seen this patient. hospital_id on that
    // doctors row is null for an independent practice, which is exactly the
    // case the hospital_id NOT NULL drop in 20261021000001 exists for.
    const { data: d } = await db.from('doctors').select('hospital_id').eq('id', caller.doctorId).maybeSingle()
    hospitalId = d?.hospital_id ?? null

    const { count } = await db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('doctor_id', caller.doctorId).eq('patient_id', b.patientId)
    if (!count) return NextResponse.json({ error: 'You have no visit with this patient.' }, { status: 403 })
  } else {
    hospitalId = caller.hospitalId!
    const { count } = await db.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('patient_id', b.patientId)
    if (!count) return NextResponse.json({ error: 'This patient has no visit at your hospital.' }, { status: 403 })

    if (typeof b.doctorId === 'string' && b.doctorId) {
      const { data: d } = await db.from('doctors').select('id').eq('id', b.doctorId).eq('hospital_id', hospitalId).maybeSingle()
      if (!d) return NextResponse.json({ error: 'That doctor is not at your hospital.' }, { status: 400 })
      doctorId = d.id
    }
  }

  const { data: plan, error } = await db.from('care_plans').insert({
    hospital_id: hospitalId, patient_id: b.patientId, doctor_id: doctorId, created_by: me?.id ?? null,
    title, condition: typeof b.condition === 'string' && b.condition.trim() ? b.condition.trim().slice(0, 120) : null,
    notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 2000) : null,
    starts_on: startsOn, ends_on: endsOn, next_check_in: isDate(b.nextCheckIn) ? b.nextCheckIn : null,
  }).select('id').single()
  if (error || !plan) return NextResponse.json({ error: error?.message ?? 'Could not create the plan.' }, { status: 500 })

  const { error: tErr } = await db.from('care_plan_tasks').insert(cleanTasks.map(t => ({ ...t, plan_id: plan.id })))
  if (tErr) {
    await db.from('care_plans').delete().eq('id', plan.id)
    return NextResponse.json({ error: tErr.message }, { status: 500 })
  }
  return NextResponse.json({ id: plan.id }, { status: 201 })
}
