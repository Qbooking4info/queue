'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { createClient } from '@/lib/supabase/client'
import { useEmergencyAccess } from '@/lib/useEmergencyAccess'
import { Badge } from './Badge'
import { BedSpaceCard } from './BedSpaceCard'
import { SkeletonRow } from './SkeletonRow'
import { ROLE_LABELS } from './Sidebar'
import type { AdminAppointment, AdminNotification } from '@/lib/admin-api'

// v3.1 w-dash: date range pills, four KPI cards with trend vs the previous period,
// visits per day (chart or table), activity, and today's appointments with export.

type RangeKey = 'today' | '7d' | '30d' | 'custom'
type Kpis = { visits: number; collected: number | null; avgWaitMins: number | null; noShowRate: number | null }
type Summary = { current: Kpis; previous: Kpis; daily: { date: string; visits: number }[] }

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: '7d', label: '7 days' }, { key: '30d', label: '30 days' }, { key: 'custom', label: 'Custom' },
]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d) }
const naira = (n: number) => n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `₦${Math.round(n / 1000)}k` : `₦${n.toLocaleString('en-NG')}`
const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const PAYMENT_LABEL: Record<string, string> = {
  card: 'Card', transfer: 'Transfer', ussd: 'USSD', wallet: 'Wallet', hmo: 'HMO', cash: 'Pay at hospital', pay_at_hospital: 'Pay at hospital',
}

function csvEscape(v: string) { return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }

export function HospitalDashboard() {
  const { theme: C } = useTheme()
  const { hospital, role, clinicName } = useAdmin()
  const { canManageBedSpace } = useEmergencyAccess()

  const [range, setRange] = useState<RangeKey>('today')
  const [custom, setCustom] = useState({ from: daysAgo(13), to: ymd(new Date()) })
  const [summary, setSummary] = useState<Summary | null>(null)
  const [today, setToday] = useState<AdminAppointment[] | null>(null)
  const [activity, setActivity] = useState<AdminNotification[] | null>(null)
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState(-1)

  const bounds = useMemo(() => {
    if (range === 'today') return { from: ymd(new Date()), to: ymd(new Date()) }
    if (range === '7d') return { from: daysAgo(6), to: ymd(new Date()) }
    if (range === '30d') return { from: daysAgo(29), to: ymd(new Date()) }
    return custom
  }, [range, custom])

  const loadSummary = useCallback(() => {
    if (!hospital?.id) return
    fetch(`/api/dashboard/summary?from=${bounds.from}&to=${bounds.to}`)
      .then(r => r.ok ? r.json() : null).then(setSummary).catch(() => setSummary(null))
  }, [hospital?.id, bounds])

  const loadToday = useCallback(() => {
    if (!hospital?.id) return
    const t = ymd(new Date())
    fetch(`/api/appointments?from=${t}&to=${t}`)
      .then(r => r.ok ? r.json() : { appointments: [] })
      .then(b => setToday(((b.appointments ?? []) as AdminAppointment[]).sort((a, z) => a.start_time.localeCompare(z.start_time))))
      .catch(() => setToday([]))
  }, [hospital?.id])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadToday() }, [loadToday])
  useEffect(() => {
    if (!hospital?.id) return
    fetch(`/api/hospitals/${hospital.id}/activity`)
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(b => setActivity(b.notifications ?? [])).catch(() => setActivity([]))
  }, [hospital?.id])

  // Live: any appointment change for this hospital refreshes the numbers and table.
  useEffect(() => {
    if (!hospital?.id) return
    const supabase = createClient()
    const ch = supabase.channel(`dash-${hospital.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `hospital_id=eq.${hospital.id}` },
        () => { loadSummary(); loadToday() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [hospital?.id, loadSummary, loadToday])

  // ── KPI cards ──────────────────────────────────────────────────────────────
  type Card = { label: string; value: string; trend: string | null; good: boolean | null }
  const cards: Card[] = useMemo(() => {
    if (!summary) return []
    const { current: c, previous: p } = summary
    const pct = (a: number, b: number) => b === 0 ? null : Math.round(((a - b) / b) * 100)
    const visitsPct = pct(c.visits, p.visits)
    const collectedPct = c.collected != null && p.collected != null ? pct(c.collected, p.collected) : null
    const waitDelta = c.avgWaitMins != null && p.avgWaitMins != null ? c.avgWaitMins - p.avgWaitMins : null
    const nsDelta = c.noShowRate != null && p.noShowRate != null ? Math.round((c.noShowRate - p.noShowRate) * 10) / 10 : null
    const arrow = (n: number) => n > 0 ? '▲' : n < 0 ? '▼' : '–'
    return [
      { label: 'Visits', value: c.visits.toLocaleString('en-NG'),
        trend: visitsPct == null ? null : `${arrow(visitsPct)} ${Math.abs(visitsPct)}% vs previous`, good: visitsPct == null || visitsPct === 0 ? null : visitsPct > 0 },
      { label: 'Collected (Paystack)', value: c.collected == null ? '—' : naira(c.collected),
        trend: collectedPct == null ? (c.collected == null ? 'Hospital-wide only' : null) : `${arrow(collectedPct)} ${Math.abs(collectedPct)}% vs previous`,
        good: collectedPct == null || collectedPct === 0 ? null : collectedPct > 0 },
      { label: 'Avg wait', value: c.avgWaitMins == null ? '—' : `${c.avgWaitMins}m`,
        trend: waitDelta == null || waitDelta === 0 ? null : `${arrow(waitDelta)} ${Math.abs(waitDelta)} min, ${waitDelta < 0 ? 'better' : 'worse'}`,
        good: waitDelta == null || waitDelta === 0 ? null : waitDelta < 0 },
      { label: 'No-show rate', value: c.noShowRate == null ? '—' : `${c.noShowRate}%`,
        trend: nsDelta == null || nsDelta === 0 ? null : `${arrow(nsDelta)} ${Math.abs(nsDelta)} pts, ${nsDelta < 0 ? 'better' : 'worse'}`,
        good: nsDelta == null || nsDelta === 0 ? null : nsDelta < 0 },
    ]
  }, [summary])

  // ── Chart geometry (same frame as the prototype: 640×220, plot 40..630 × 20..200) ──
  const daily = summary?.daily ?? []
  // Three equal gridline steps on a 1/2/5 scale, so the axis reads 0, 5, 10, 15 or 0, 20, 40, 60.
  const maxV = Math.max(3, ...daily.map(d => d.visits))
  const raw = maxV / 3, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
  const top = step * 3
  const x = (i: number) => 40 + i * (590 / 13)
  const y = (v: number) => 200 - (v / top) * 180
  const points = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.visits).toFixed(1)}`).join(' ')
  const last = daily[daily.length - 1]

  // ── Export ──────────────────────────────────────────────────────────────────
  const tableRows = (today ?? []).map(a => ({
    time: a.start_time?.slice(0, 5) ?? '', patient: a.patient_name, doctor: a.doctor_name,
    mode: a.type === 'virtual' ? 'Video' : 'In person',
    payment: a.payment_method ? (PAYMENT_LABEL[a.payment_method] ?? a.payment_method) : '—', status: a.status,
  }))
  function exportCsv() {
    const head = ['Time', 'Patient', 'Doctor', 'Mode', 'Payment', 'Status']
    const body = tableRows.map(r => [r.time, r.patient, r.doctor, r.mode, r.payment, r.status.replace(/_/g, ' ')].map(csvEscape).join(','))
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `appointments-${ymd(new Date())}.csv`; a.click()
    URL.revokeObjectURL(a.href)
  }
  function exportPdf() {
    const w = window.open('', '_blank'); if (!w) return
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
    w.document.write(`<!doctype html><title>Today's appointments</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#0B1B1E}
      h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #E3ECEB}</style>
      <h1>${esc(hospital?.name ?? 'Hospital')} · today's appointments · ${new Date().toLocaleDateString('en-GB')}</h1>
      <table><thead><tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Mode</th><th>Payment</th><th>Status</th></tr></thead><tbody>
      ${tableRows.map(r => `<tr><td>${esc(r.time)}</td><td>${esc(r.patient)}</td><td>${esc(r.doctor)}</td><td>${r.mode}</td><td>${esc(r.payment)}</td><td>${r.status.replace(/_/g, ' ')}</td></tr>`).join('')}
      </tbody></table><script>window.onload=()=>window.print()</script>`)
    w.document.close()
  }

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 } as const
  const smallBtn = { height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card,
    color: C.text, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const
  const good = C.id === 'forest' ? '#4ADE80' : '#15803D'
  const roleLabel = role ? ROLE_LABELS[role] : 'Hospital admin'
  const dateLine = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, color: C.text }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: C.textMuted }} suppressHydrationWarning>
            {roleLabel}{clinicName ? ` · ${clinicName}` : ''} · {dateLine}
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px' }}>Dashboard</h1>
        </div>
        <div role="group" aria-label="Date range" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {RANGES.map(r => (
            <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}
              style={{ height: 38, padding: '0 14px', borderRadius: 99, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                ...(range === r.key
                  ? { background: C.accent, color: C.id === 'forest' ? '#04201D' : '#FFFFFF', border: `1px solid ${C.accent}` }
                  : { background: C.card, color: C.textSub, border: `1px solid ${C.border}` }) }}>
              {r.label}
            </button>
          ))}
          {range === 'custom' && (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: C.textSub }}>
              <label>From <input type="date" value={custom.from} max={custom.to} onChange={e => e.target.value && setCustom(c => ({ ...c, from: e.target.value }))}
                style={{ height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, padding: '0 8px', fontFamily: 'inherit' }} /></label>
              <label>To <input type="date" value={custom.to} min={custom.from} onChange={e => e.target.value && setCustom(c => ({ ...c, to: e.target.value }))}
                style={{ height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, padding: '0 8px', fontFamily: 'inherit' }} /></label>
            </span>
          )}
        </div>
      </div>

      {canManageBedSpace && hospital && (
        <BedSpaceCard hospitalId={hospital.id} status={hospital.bed_space_status ?? 'unknown'} updatedAt={hospital.bed_space_updated_at ?? null} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {(summary ? cards : Array.from({ length: 4 }, () => null)).map((k, i) => (
          <div key={i} style={card}>
            {k ? (
              <>
                <div style={{ fontSize: 13, color: C.textMuted }}>{k.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, minHeight: 16,
                  color: k.good == null ? C.textMuted : k.good ? good : C.amber }}>{k.trend ?? 'No change vs previous'}</div>
              </>
            ) : <><SkeletonRow height={14} mb={8} /><SkeletonRow height={30} mb={6} /><SkeletonRow height={12} mb={0} /></>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section style={{ ...card, flex: '999 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Visits per day · last 14 days</h2>
            <button type="button" onClick={() => setAsTable(t => !t)} style={{ ...smallBtn, color: C.accent, fontWeight: 700 }}>
              {asTable ? 'View chart' : 'View as table'}
            </button>
          </div>
          {!summary ? <SkeletonRow height={200} mb={0} /> : asTable ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>Day</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>Visits</th>
                </tr></thead>
                <tbody>{daily.map(d => (
                  <tr key={d.date}><td style={{ padding: '5px 8px', borderBottom: `1px solid ${C.bgAlt}` }}>{dayLabel(d.date)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', borderBottom: `1px solid ${C.bgAlt}` }}>{d.visits}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <svg viewBox="0 0 640 220" role="img" style={{ width: '100%', height: 'auto', display: 'block' }}
                aria-label={`Line chart of visits per day over 14 days, from ${daily[0]?.visits ?? 0} on ${daily[0] ? dayLabel(daily[0].date) : ''} to ${last?.visits ?? 0} on ${last ? dayLabel(last.date) : ''}`}>
                {[0, 1, 2, 3].map(g => {
                  const v = top - step * g, yy = y(v)
                  return (
                    <g key={g}>
                      <line x1="40" y1={yy} x2="630" y2={yy} stroke={g === 3 ? C.borderMed : C.bgAlt} strokeWidth="1" />
                      <text x="32" y={yy + 4} textAnchor="end" fontSize="11" fill={C.textMuted}>{v}</text>
                    </g>
                  )
                })}
                {daily[0] && <text x="40" y="216" fontSize="11" fill={C.textMuted}>{dayLabel(daily[0].date)}</text>}
                {last && <text x="630" y="216" textAnchor="end" fontSize="11" fill={C.textMuted}>{dayLabel(last.date)}</text>}
                {hover >= 0 && <line x1={x(hover)} y1="20" x2={x(hover)} y2="200" stroke={C.textMuted} strokeWidth="1" />}
                <polyline points={points} fill="none" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {last && <circle cx={x(13)} cy={y(last.visits)} r="5" fill={C.accent} stroke={C.card} strokeWidth="2" />}
                {last && <text x={x(13) - 10} y={y(last.visits) - 10} fontSize="12" fontWeight="700" fill={C.text} textAnchor="end">{last.visits} today</text>}
                {hover >= 0 && daily[hover] && <circle cx={x(hover)} cy={y(daily[hover].visits)} r="5" fill={C.accent} stroke={C.card} strokeWidth="2" />}
                {daily.map((_, i) => (
                  <rect key={i} x={x(i) - 590 / 26} y="10" width={590 / 13} height="195" fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} />
                ))}
              </svg>
              {hover >= 0 && daily[hover] && (
                <div style={{ position: 'absolute', top: 4, left: `${(x(hover) / 640) * 100}%`, transform: 'translateX(-50%)',
                  background: C.text, color: C.card, borderRadius: 8, padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                  <b>{daily[hover].visits}</b> visits · {dayLabel(daily[hover].date)}
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ ...card, flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>Activity</h2>
          {activity == null ? [0, 1, 2].map(i => <SkeletonRow key={i} height={18} mb={10} />)
            : activity.length === 0 ? <div style={{ fontSize: 13, color: C.textMuted, padding: '8px 0' }}>No activity yet today.</div>
            : activity.slice(0, 6).map((n, i, all) => (
              <Link key={n.id} href={n.href} style={{ fontSize: 13, lineHeight: 1.45, padding: '8px 0', color: C.text, textDecoration: 'none',
                borderBottom: i < all.length - 1 ? `1px solid ${C.bgAlt}` : 'none' }}>
                {n.msg} <span style={{ color: C.textMuted }}>· {n.time}</span>
              </Link>
            ))}
        </section>
      </div>

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Today&apos;s appointments</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={exportCsv} disabled={!tableRows.length} style={smallBtn}>Export CSV</button>
            <button type="button" onClick={exportPdf} disabled={!tableRows.length} style={smallBtn}>Export PDF</button>
          </div>
        </div>
        {today == null ? [0, 1, 2, 3].map(i => <SkeletonRow key={i} height={36} mb={6} />) : today.length === 0 ? (
          <div style={{ padding: '28px 8px', textAlign: 'center', fontSize: 14, color: C.textMuted }}>
            No appointments today.{' '}
            {role !== 'super_admin' && <Link href="/dashboard/appointments?walkin=1" style={{ color: C.accent, fontWeight: 700 }}>Add a walk-in</Link>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: C.textMuted, fontSize: 12 }}>
                {['Time', 'Patient', 'Doctor', 'Mode', 'Payment', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 8px', fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {today.map((a, i) => {
                  const td = { padding: '11px 8px', borderBottom: i < today.length - 1 ? `1px solid ${C.bgAlt}` : 'none' }
                  const r = tableRows[i]
                  return (
                    <tr key={a.id}>
                      <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{r.time}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.patient}</td>
                      <td style={td}>{r.doctor}</td>
                      <td style={td}>{r.mode}</td>
                      <td style={td}>{r.payment}</td>
                      <td style={td}><Badge status={a.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
