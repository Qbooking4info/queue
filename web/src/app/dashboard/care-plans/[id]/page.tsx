'use client'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { createClient } from '@/lib/supabase/client'
import { AdherenceBar } from '@/components/dashboard/AdherenceBar'
import { PageHeader, Card, Button, Field, KpiGrid, Kpi, fmtDate, useInputStyle } from '@/components/dashboard/v31'

// One care plan: adherence, each task's last 14 days, and the controls to adjust it.

type Cadence = 'daily' | 'weekly' | 'once'
interface Task { id: string; title: string; cadence: Cadence; due_on: string | null; sort_order: number }
interface Log { task_id: string; done_on: string; done_at: string }
interface Plan {
  id: string; title: string; condition: string | null; notes: string | null; status: 'active' | 'completed' | 'stopped'
  starts_on: string; ends_on: string | null; next_check_in: string | null; created_at: string
  patient: { full_name: string | null; phone: string | null } | null; doctor: { full_name: string | null } | null; tasks: Task[]
}
interface Detail { plan: Plan; logs: Log[]; adherence7: number | null; weeks: { from: string; to: string; pct: number | null; done: number; expected: number }[] }

const CADENCE_LABEL: Record<Cadence, string> = { daily: 'Daily', weekly: 'Weekly', once: 'Once' }
const iso = (d: Date) => d.toISOString().slice(0, 10)

export default function CarePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { theme: C } = useTheme()
  const { hospital } = useAdmin()
  const input = useInputStyle()
  const [d, setD] = useState<Detail | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [checkIn, setCheckIn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [notes, setNotes] = useState('')
  const [newTask, setNewTask] = useState<{ title: string; cadence: Cadence; dueOn: string }>({ title: '', cadence: 'daily', dueOn: '' })

  const load = useCallback(async () => {
    const r = await fetch(`/api/care-plans/${id}`)
    if (r.status === 404) { setMissing(true); return }
    const b = await r.json().catch(() => null)
    if (!r.ok || !b) { setError(b?.error ?? 'Could not load the plan.'); return }
    setD(b)
    setCheckIn(b.plan.next_check_in ?? ''); setEndsOn(b.plan.ends_on ?? ''); setNotes(b.plan.notes ?? '')
  }, [id])
  useEffect(() => { load() }, [load])

  // Ticks from the patient's app arrive live.
  useEffect(() => {
    if (!hospital?.id) return
    const supabase = createClient()
    const ch = supabase.channel(`care-plan-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'care_plan_task_logs', filter: `plan_id=eq.${id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, hospital?.id, load])

  async function patch(body: Record<string, unknown>) {
    setSaving(true); setError(null)
    const r = await fetch(`/api/care-plans/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const b = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError(b.error ?? 'Could not save.'); return false }
    await load(); return true
  }

  const [days] = useState(() => Array.from({ length: 14 }, (_, i) => iso(new Date(Date.now() - (13 - i) * 86_400_000))))

  if (missing) return <div style={{ color: C.text }}>This care plan doesn’t exist or belongs to another hospital. <Link href="/dashboard/care-plans" style={{ color: C.accent }}>Back to care plans</Link></div>
  if (!d) return <div style={{ color: C.textMuted, fontSize: 14 }}>{error ?? 'Loading…'}</div>

  const { plan, logs } = d
  const done = (taskId: string, day: string) => logs.some(l => l.task_id === taskId && l.done_on === day)
  const lastTick = logs[0]?.done_at ?? null
  const good = C.id === 'forest' ? '#4ADE80' : '#15803D'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><Link href="/dashboard/care-plans" style={{ fontSize: 13, color: C.accent, fontWeight: 700, textDecoration: 'none' }}>← Care plans</Link></div>
      <PageHeader title={plan.title}
        eyebrow={[plan.patient?.full_name ?? 'Patient', plan.condition, plan.doctor?.full_name, plan.status !== 'active' ? plan.status.toUpperCase() : null].filter(Boolean).join(' · ')}
        actions={plan.status === 'active' ? <>
          <Button onClick={() => patch({ status: 'completed' })} disabled={saving}>Mark completed</Button>
          <Button variant="danger" onClick={() => { if (confirm('Stop this plan? The patient will no longer see tasks to tick.')) patch({ status: 'stopped' }) }} disabled={saving}>Stop plan</Button>
        </> : <Button variant="link" onClick={() => patch({ status: 'active' })} disabled={saving}>Reactivate</Button>} />

      {error && <div role="alert" style={{ padding: 12, borderRadius: 12, background: C.redLight, color: C.red, fontSize: 13 }}>{error}</div>}

      <KpiGrid>
        <Kpi label="Adherence · 7 days" value={<AdherenceBar pct={d.adherence7} />} />
        <Kpi label="Tasks" value={plan.tasks.length} />
        <Kpi label="Next check-in" value={<span style={{ fontSize: 20 }}>{fmtDate(plan.next_check_in)}</span>} />
        <Kpi label="Last tick" value={<span style={{ fontSize: 20 }}>{lastTick ? fmtDate(lastTick) : '—'}</span>} sub={`Started ${fmtDate(plan.starts_on)}${plan.ends_on ? ` · ends ${fmtDate(plan.ends_on)}` : ''}`} />
      </KpiGrid>

      <Card title="By week">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {d.weeks.map(w => (
            <div key={w.from} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: C.textMuted }}>{fmtDate(w.from)} – {fmtDate(w.to)}</div>
              <div style={{ marginTop: 6 }}><AdherenceBar pct={w.pct} /></div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{w.done} of {w.expected} ticks</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Tasks · last 14 days">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13, color: C.text }}>
            <thead><tr>
              <th style={{ textAlign: 'left', padding: '8px 6px', color: C.textMuted, fontSize: 12 }}>Task</th>
              {days.map(day => <th key={day} style={{ padding: '8px 2px', color: C.textMuted, fontSize: 11, fontWeight: 600 }}>{new Date(day + 'T00:00:00').getDate()}</th>)}
              <th />
            </tr></thead>
            <tbody>
              {plan.tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ padding: '10px 6px', borderTop: `1px solid ${C.bgAlt}` }}>
                    <b>{t.title}</b>
                    <div style={{ fontSize: 12, color: C.textMuted }}>{CADENCE_LABEL[t.cadence]}{t.due_on ? ` · due ${fmtDate(t.due_on)}` : ''}</div>
                  </td>
                  {days.map(day => {
                    const hit = done(t.id, day)
                    return (
                      <td key={day} style={{ textAlign: 'center', borderTop: `1px solid ${C.bgAlt}` }}>
                        <span title={`${day}: ${hit ? 'done' : 'not ticked'}`} aria-label={`${day} ${hit ? 'done' : 'not ticked'}`}
                          style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, background: hit ? good : C.bgAlt, color: hit ? (C.id === 'forest' ? '#052e16' : '#FFFFFF') : 'transparent' }}>✓</span>
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right', borderTop: `1px solid ${C.bgAlt}`, paddingLeft: 8 }}>
                    {plan.status === 'active' && plan.tasks.length > 1 && (
                      <Button variant="danger" ariaLabel={`Remove ${t.title}`} onClick={() => { if (confirm(`Remove “${t.title}”?`)) patch({ removeTaskIds: [t.id] }) }}>Remove</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.status === 'active' && (
          <form onSubmit={async e => { e.preventDefault(); if (await patch({ addTasks: [newTask] })) setNewTask({ title: '', cadence: 'daily', dueOn: '' }) }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <input aria-label="New task" required maxLength={160} placeholder="Add a task" value={newTask.title}
              onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} style={{ ...input, flex: '1 1 240px', width: 'auto' }} />
            <select aria-label="Cadence" value={newTask.cadence} onChange={e => setNewTask(t => ({ ...t, cadence: e.target.value as Cadence }))} style={{ ...input, width: 130 }}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="once">Once</option>
            </select>
            {newTask.cadence === 'once' && <input aria-label="Due date" type="date" required value={newTask.dueOn} onChange={e => setNewTask(t => ({ ...t, dueOn: e.target.value }))} style={{ ...input, width: 170 }} />}
            <Button type="submit" variant="link" disabled={saving}>+ Add task</Button>
          </form>
        )}
      </Card>

      <Card title="Plan details">
        <form onSubmit={e => { e.preventDefault(); patch({ nextCheckIn: checkIn || null, endsOn: endsOn || null, notes }) }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label="Next check-in"><input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} style={input} /></Field>
            <Field label="Ends"><input type="date" min={plan.starts_on} value={endsOn} onChange={e => setEndsOn(e.target.value)} style={input} /></Field>
          </div>
          <Field label="Notes for the patient"><textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...input, height: 'auto', padding: 12, resize: 'vertical' }} /></Field>
          <div><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
        </form>
      </Card>
    </div>
  )
}
