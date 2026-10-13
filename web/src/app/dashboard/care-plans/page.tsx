'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { AdherenceBar } from '@/components/dashboard/AdherenceBar'
import { PageHeader, Card, Button, Segmented, DataTable, Empty, Field, fmtDate, useCellStyle, useInputStyle } from '@/components/dashboard/v31'

// v3.1 Care Plans: plans the hospital sets for a patient, which the patient
// follows and ticks off in My Care. Adherence = ticks done vs expected, last 7 days.

type Status = 'active' | 'completed' | 'stopped'
interface PlanRow {
  id: string; title: string; condition: string | null; status: Status; startsOn: string; endsOn: string | null; nextCheckIn: string | null
  patient: string; doctor: string | null; taskCount: number; adherence: number | null; lastActivity: string | null
}
type Cadence = 'daily' | 'weekly' | 'once'
interface DraftTask { title: string; cadence: Cadence; dueOn: string }

const today = () => new Date().toISOString().slice(0, 10)

function NewPlan({ onDone, onCancel, preset }: { onDone: (id: string) => void; onCancel: () => void; preset: { id: string; name: string } | null }) {
  const { theme: C } = useTheme()
  const { doctors } = useAdmin()
  const input = useInputStyle()
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(preset)
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<{ id: string; name: string; phone: string | null; patientNumber: string | null }[]>([])
  const [title, setTitle] = useState('')
  const [condition, setCondition] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [startsOn, setStartsOn] = useState(today())
  const [endsOn, setEndsOn] = useState('')
  const [nextCheckIn, setNextCheckIn] = useState('')
  const [notes, setNotes] = useState('')
  const [tasks, setTasks] = useState<DraftTask[]>([{ title: '', cadence: 'daily', dueOn: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (patient || search.trim().length < 2) { setMatches([]); return }
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(search.trim())}`).then(r => r.ok ? r.json() : { patients: [] })
        .then(b => setMatches((b.patients ?? []).slice(0, 8)))
    }, 250)
    return () => clearTimeout(t)
  }, [search, patient])

  async function save() {
    if (!patient) { setError('Choose a patient.'); return }
    setSaving(true); setError(null)
    const res = await fetch('/api/care-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: patient.id, title, condition, notes, startsOn, endsOn: endsOn || null,
        nextCheckIn: nextCheckIn || null, doctorId: doctorId || null,
        tasks: tasks.filter(t => t.title.trim()).map(t => ({ title: t.title, cadence: t.cadence, dueOn: t.cadence === 'once' ? t.dueOn : null })) }) })
    const b = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(b.error ?? 'Could not create the plan.'); return }
    onDone(b.id)
  }

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 } as const
  return (
    <Card title="New care plan" actions={<Button onClick={onCancel}>Cancel</Button>}>
      <form onSubmit={e => { e.preventDefault(); save() }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Patient">
          {patient ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: C.text }}>
              {patient.name} <Button onClick={() => { setPatient(null); setSearch('') }}>Change</Button>
            </span>
          ) : (
            <span style={{ position: 'relative', display: 'block' }}>
              <input autoFocus placeholder="Search name, phone or patient number" value={search} onChange={e => setSearch(e.target.value)} style={input} />
              {matches.length > 0 && (
                <span role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 48, zIndex: 20, background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, display: 'block' }}>
                  {matches.map(m => (
                    <button key={m.id} type="button" role="option" aria-selected="false" onClick={() => setPatient({ id: m.id, name: m.name })}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 8,
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: C.text }}>
                      <b>{m.name}</b> <span style={{ color: C.textMuted, fontWeight: 500 }}>{[m.patientNumber, m.phone].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                </span>
              )}
            </span>
          )}
        </Field>
        <div style={grid}>
          <Field label="Plan title"><input required maxLength={120} placeholder="e.g. Blood pressure control" value={title} onChange={e => setTitle(e.target.value)} style={input} /></Field>
          <Field label="Condition (optional)"><input maxLength={120} placeholder="e.g. Hypertension" value={condition} onChange={e => setCondition(e.target.value)} style={input} /></Field>
          <Field label="Doctor (optional)">
            <select value={doctorId} onChange={e => setDoctorId(e.target.value)} style={input}>
              <option value="">No doctor</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </Field>
        </div>
        <div style={grid}>
          <Field label="Starts"><input type="date" required value={startsOn} onChange={e => setStartsOn(e.target.value)} style={input} /></Field>
          <Field label="Ends (optional)"><input type="date" min={startsOn} value={endsOn} onChange={e => setEndsOn(e.target.value)} style={input} /></Field>
          <Field label="Next check-in (optional)"><input type="date" min={today()} value={nextCheckIn} onChange={e => setNextCheckIn(e.target.value)} style={input} /></Field>
        </div>

        <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <legend style={{ fontSize: 13, fontWeight: 700, color: C.textSub, padding: '0 6px' }}>Tasks the patient ticks off</legend>
          {tasks.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input aria-label={`Task ${i + 1}`} maxLength={160} placeholder="e.g. Take amlodipine 5 mg" value={t.title}
                onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} style={{ ...input, flex: '1 1 260px', width: 'auto' }} />
              <select aria-label={`Task ${i + 1} cadence`} value={t.cadence} onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, cadence: e.target.value as Cadence } : x))}
                style={{ ...input, width: 130 }}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="once">Once</option>
              </select>
              {t.cadence === 'once' && <input aria-label={`Task ${i + 1} due date`} type="date" required value={t.dueOn} min={startsOn}
                onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, dueOn: e.target.value } : x))} style={{ ...input, width: 170 }} />}
              {tasks.length > 1 && <Button variant="danger" ariaLabel={`Remove task ${i + 1}`} onClick={() => setTasks(ts => ts.filter((_, j) => j !== i))}>Remove</Button>}
            </div>
          ))}
          <div><Button variant="link" onClick={() => setTasks(ts => [...ts, { title: '', cadence: 'daily', dueOn: '' }])}>+ Add task</Button></div>
        </fieldset>

        <Field label="Notes for the patient (optional)">
          <textarea maxLength={2000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...input, height: 'auto', padding: 12, resize: 'vertical' }} />
        </Field>
        {error && <div role="alert" style={{ padding: 12, borderRadius: 12, background: C.redLight, color: C.red, fontSize: 13 }}>{error}</div>}
        <div><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Creating…' : 'Create plan'}</Button></div>
      </form>
    </Card>
  )
}

export default function CarePlansPage() {
  const { theme: C } = useTheme()
  const router = useRouter()
  const td = useCellStyle()
  const [status, setStatus] = useState<Status | 'all'>('active')
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [preset, setPreset] = useState<{ id: string; name: string } | null>(null)

  const load = useCallback(() => {
    fetch(`/api/care-plans?status=${status}`).then(r => r.ok ? r.json() : { plans: [] }).then(b => setPlans(b.plans ?? [])).catch(() => setPlans([]))
  }, [status])
  useEffect(() => { setPlans(null); load() }, [load])

  // Arriving from Patients: ?new=1&patient=<id>&name=<name>
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('new') === '1') {
      setCreating(true)
      if (p.get('patient')) setPreset({ id: p.get('patient')!, name: p.get('name') ?? 'Patient' })
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const due = (iso: string | null) => iso && iso <= today()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Care Plans" eyebrow="Plans your patients follow and tick off in the Queue app"
        actions={!creating && <Button variant="primary" onClick={() => { setPreset(null); setCreating(true) }}>+ New care plan</Button>} />

      {creating && <NewPlan preset={preset} onCancel={() => setCreating(false)} onDone={id => router.push(`/dashboard/care-plans/${id}`)} />}

      <Card actions={<Segmented label="Plan status" value={status} onChange={setStatus}
        options={[{ key: 'active', label: 'Active' }, { key: 'completed', label: 'Completed' }, { key: 'stopped', label: 'Stopped' }, { key: 'all', label: 'All' }]} />}
        title="Plans">
        {plans == null ? <div style={{ padding: 16, fontSize: 13, color: C.textMuted }}>Loading…</div>
          : plans.length === 0 ? <Empty title={status === 'active' ? 'No active care plans' : 'Nothing here'}
              body="Create a plan for a patient with daily or weekly tasks. They see it in My Care and tick tasks off; adherence shows here."
              action={!creating ? <Button variant="link" onClick={() => setCreating(true)}>+ New care plan</Button> : undefined} />
          : (
            <DataTable head={['Patient', 'Plan', 'Tasks', 'Adherence · 7 days', 'Next check-in', 'Last activity']} minWidth={820}>
              {plans.map(p => (
                <tr key={p.id}>
                  <td style={{ ...td, fontWeight: 700 }}><Link href={`/dashboard/care-plans/${p.id}`} style={{ color: C.text, textDecoration: 'none' }}>{p.patient}</Link></td>
                  <td style={td}>
                    <Link href={`/dashboard/care-plans/${p.id}`} style={{ color: C.accent, fontWeight: 700, textDecoration: 'none' }}>{p.title}</Link>
                    <div style={{ fontSize: 12, color: C.textMuted }}>{[p.condition, p.doctor, p.status !== 'active' ? p.status : null].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{p.taskCount}</td>
                  <td style={td}><AdherenceBar pct={p.adherence} /></td>
                  <td style={td}>{p.nextCheckIn ? <span style={{ color: due(p.nextCheckIn) ? C.amber : C.text, fontWeight: due(p.nextCheckIn) ? 700 : 400 }}>{fmtDate(p.nextCheckIn)}{due(p.nextCheckIn) ? ' · due' : ''}</span> : '—'}</td>
                  <td style={td}>{p.lastActivity ? fmtDate(p.lastActivity) : <span style={{ color: C.textMuted }}>No ticks yet</span>}</td>
                </tr>
              ))}
            </DataTable>
          )}
      </Card>
    </div>
  )
}
