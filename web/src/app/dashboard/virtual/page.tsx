'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/dashboard/Badge'
import { PageHeader, Card, Button, Segmented, DataTable, Empty, KpiGrid, Kpi, downloadCsv, fmtDate, useCellStyle } from '@/components/dashboard/v31'

// v3.1 Virtual Care: the hospital's video consultations, which are live right
// now, what's coming, and how long calls run. Doctors run the calls from Queue
// Doctor; this is the hospital's oversight view.

type RangeKey = 'today' | 'upcoming' | 'past'
interface Consult {
  id: string; bookingRef: string; date: string; time: string; status: string; patient: string; patientPhone: string | null
  doctor: string; live: boolean; startedAt: string | null; durationMins: number | null
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

export default function VirtualCarePage() {
  const { theme: C } = useTheme()
  const { hospital } = useAdmin()
  const td = useCellStyle()
  const [range, setRange] = useState<RangeKey>('today')
  const [data, setData] = useState<{ consults: Consult[]; stats: { scheduled: number; live: number; completed: number; avgMins: number | null } } | null>(null)

  const bounds = useMemo(() => range === 'today' ? { from: shift(0), to: shift(0) }
    : range === 'upcoming' ? { from: shift(1), to: shift(30) } : { from: shift(-30), to: shift(-1) }, [range])

  const load = useCallback(() => {
    fetch(`/api/virtual?from=${bounds.from}&to=${bounds.to}`).then(r => r.ok ? r.json() : null).then(setData).catch(() => setData(null))
  }, [bounds])
  useEffect(() => { setData(null); load() }, [load])

  // Calls starting and ending flip the appointment's status, so following appointments
  // is enough. virtual_sessions is not readable by staff sessions (it holds call tokens).
  useEffect(() => {
    if (!hospital?.id) return
    const supabase = createClient()
    const ch = supabase.channel(`virtual-${hospital.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `hospital_id=eq.${hospital.id}` }, load)
      .subscribe()
    const t = setInterval(load, 30_000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [hospital?.id, load])

  const consults = data?.consults ?? []
  const live = consults.filter(c => c.live)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Virtual Care" eyebrow="Video consultations at this hospital"
        actions={<>
          <Segmented label="Range" value={range} onChange={setRange}
            options={[{ key: 'today', label: 'Today' }, { key: 'upcoming', label: 'Next 30 days' }, { key: 'past', label: 'Last 30 days' }]} />
          <Button disabled={!consults.length} onClick={() => downloadCsv(`virtual-${range}-${shift(0)}.csv`,
            ['Date', 'Time', 'Patient', 'Doctor', 'Status', 'Minutes', 'Ref'],
            consults.map(c => [c.date, c.time, c.patient, c.doctor, c.status, c.durationMins, c.bookingRef]))}>Export CSV</Button>
        </>} />

      <KpiGrid>
        <Kpi label="Live now" value={data ? data.stats.live : '…'} sub={data?.stats.live ? 'In a call' : 'No calls running'} />
        <Kpi label="Scheduled" value={data ? data.stats.scheduled : '…'} />
        <Kpi label="Completed" value={data ? data.stats.completed : '…'} />
        <Kpi label="Avg call length" value={data ? (data.stats.avgMins != null ? `${data.stats.avgMins}m` : '—') : '…'} />
      </KpiGrid>

      {live.length > 0 && (
        <div role="status" style={{ borderRadius: 14, background: C.accentLight, color: C.accent, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, background: C.accent }} />
          <b style={{ fontSize: 14 }}>Live now</b>
          <span style={{ fontSize: 14 }}>{live.map(c => `${c.doctor} with ${c.patient}`).join(' · ')}</span>
        </div>
      )}

      <Card title={range === 'today' ? 'Today' : range === 'upcoming' ? 'Coming up' : 'Past 30 days'}>
        {data == null ? <div style={{ padding: 16, fontSize: 13, color: C.textMuted }}>Loading…</div>
          : consults.length === 0 ? <Empty title="No video consultations" body={range === 'today'
              ? 'Patients book video visits from Virtual Care in the Queue app. Doctors need video turned on in their profile.' : undefined} />
          : (
            <DataTable head={['Date', 'Time', 'Patient', 'Doctor', 'Call', 'Status']} minWidth={720}>
              {consults.map(c => (
                <tr key={c.id}>
                  <td style={td}>{fmtDate(c.date)}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{c.time}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{c.patient}</td>
                  <td style={td}>{c.doctor}</td>
                  <td style={td}>{c.live ? <b style={{ color: C.accent }}>● Live</b> : c.durationMins != null ? `${c.durationMins} min` : '—'}</td>
                  <td style={td}><Badge status={c.status} /></td>
                </tr>
              ))}
            </DataTable>
          )}
      </Card>
    </div>
  )
}
