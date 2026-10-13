'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { startConversation } from '@/lib/chat'
import { ViewPatientModal } from '@/components/dashboard/ViewPatientModal'
import { PageHeader, Card, Button, DataTable, Empty, KpiGrid, Kpi, downloadCsv, fmtDate, useCellStyle, useInputStyle } from '@/components/dashboard/v31'

// v3.1 Patients: everyone who has visited this hospital, searchable, with a path
// to their record, a message, or a care plan.

interface Patient {
  id: string; name: string; phone: string | null; gender: string | null; age: number | null
  patientNumber: string | null; visits: number; lastVisit: string | null; nextVisit: string | null; noShows: number
}

export default function PatientsPage() {
  const { theme: C } = useTheme()
  const router = useRouter()
  const td = useCellStyle()
  const input = useInputStyle()
  const [patients, setPatients] = useState<Patient[] | null>(null)
  const [q, setQ] = useState('')
  const [viewing, setViewing] = useState<Patient | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/patients').then(r => r.ok ? r.json() : Promise.reject(r))
      .then(b => setPatients(b.patients ?? [])).catch(() => { setPatients([]); setError('Could not load patients.') })
  }, [])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return patients ?? []
    return (patients ?? []).filter(p => p.name.toLowerCase().includes(s) || (p.phone ?? '').includes(s.replace(/\s/g, ''))
      || (p.patientNumber ?? '').toLowerCase().includes(s))
  }, [patients, q])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => {
    const all = patients ?? []
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    return {
      total: all.length,
      upcoming: all.filter(p => p.nextVisit).length,
      recent: all.filter(p => p.lastVisit && p.lastVisit >= monthAgo).length,
      returning: all.filter(p => p.visits > 1).length,
    }
  }, [patients])

  async function message(p: Patient) {
    setBusy(p.id); setError(null)
    const r = await startConversation('patient', p.id)
    setBusy(null)
    if (r.ok) router.push(`/dashboard/messages?c=${r.data}`)
    else setError(r.error)
  }

  const sexLabel = (g: string | null) => g ? g[0].toUpperCase() : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Patients" eyebrow="Everyone who has booked or visited"
        actions={<Button onClick={() => downloadCsv(`patients-${today}.csv`,
          ['Patient', 'Patient number', 'Phone', 'Age', 'Sex', 'Visits', 'No-shows', 'Last visit', 'Next visit'],
          shown.map(p => [p.name, p.patientNumber, p.phone, p.age, p.gender, p.visits, p.noShows, p.lastVisit, p.nextVisit]))}
          disabled={!shown.length}>Export CSV</Button>} />

      <KpiGrid>
        <Kpi label="Patients" value={patients ? stats.total : '…'} />
        <Kpi label="Seen in last 30 days" value={patients ? stats.recent : '…'} />
        <Kpi label="With an upcoming visit" value={patients ? stats.upcoming : '…'} />
        <Kpi label="Returning" value={patients ? stats.returning : '…'} sub="More than one completed visit" />
      </KpiGrid>

      {error && <div role="alert" style={{ padding: 12, borderRadius: 12, background: C.redLight, color: C.red, fontSize: 13 }}>{error}</div>}

      <Card>
        <input aria-label="Search patients" placeholder="Search by name, phone or patient number" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, maxWidth: 420 }} />
        {patients == null ? <div style={{ padding: 16, fontSize: 13, color: C.textMuted }}>Loading…</div>
          : shown.length === 0 ? <Empty title={q ? 'No patient matches that search' : 'No patients yet'}
              body={q ? 'Try a phone number or the QB number from their app profile.' : 'Patients appear here after their first booking or walk-in with an app account.'} />
          : (
            <DataTable head={['Patient', 'Patient no.', 'Phone', 'Age · sex', 'Visits', 'Last visit', 'Next visit', '']} minWidth={860}>
              {shown.map(p => (
                <tr key={p.id}>
                  <td style={{ ...td, fontWeight: 700 }}>{p.name}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{p.patientNumber ?? '—'}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{p.phone ?? '—'}</td>
                  <td style={td}>{[p.age != null ? `${p.age}` : null, sexLabel(p.gender)].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{p.visits}{p.noShows ? <span style={{ color: C.amber }}> · {p.noShows} no-show</span> : null}</td>
                  <td style={td}>{fmtDate(p.lastVisit)}</td>
                  <td style={td}>{p.nextVisit ? <b style={{ color: C.accent }}>{fmtDate(p.nextVisit)}</b> : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <Button onClick={() => setViewing(p)}>Record</Button>
                      <Button onClick={() => message(p)} disabled={busy === p.id}>{busy === p.id ? 'Opening…' : 'Message'}</Button>
                      <Button variant="link" onClick={() => router.push(`/dashboard/care-plans?new=1&patient=${p.id}&name=${encodeURIComponent(p.name)}`)}>Care plan</Button>
                    </span>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
      </Card>

      {viewing && <ViewPatientModal patientId={viewing.id} patientName={viewing.name} onClose={() => setViewing(null)} />}
    </div>
  )
}
