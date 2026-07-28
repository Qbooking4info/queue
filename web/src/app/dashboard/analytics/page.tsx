'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { StatCard } from '@/components/dashboard/StatCard'
import { DateFilter, getDateBounds } from '@/components/dashboard/DateFilter'
import type { DateRangeKey, DateBounds } from '@/components/dashboard/DateFilter'
import type { AdminAppointment } from '@/lib/admin-api'
import { CalendarDays, CheckCircle2, XCircle, Star, Building2, Video, Wallet } from 'lucide-react'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function computeSpecialtyBreakdown(appts: AdminAppointment[]) {
  const counts: Record<string, number> = {}
  appts.forEach(a => {
    const name = a.specialty_name ?? 'General'
    counts[name] = (counts[name] ?? 0) + 1
  })
  const total = appts.length || 1
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }))
}

function computeTypeBreakdown(appts: AdminAppointment[]) {
  const virtual   = appts.filter(a => a.type === 'virtual').length
  const inperson  = appts.length - virtual
  return { virtual, inperson }
}

export default function AnalyticsPage() {
  const { theme: C } = useTheme()
  const { hospital, stats, role } = useAdmin()
  const router = useRouter()

  useEffect(() => {
    if (role === 'doctor' || role === 'front_desk') router.replace('/dashboard')
  }, [role])

  const [range, setRange]       = useState<DateRangeKey>('this_month')
  const [bounds, setBounds]     = useState<DateBounds>(getDateBounds('this_month'))
  const [rangeStats, setRangeStats] = useState({ total: 0, completed: 0, cancelled: 0, pending: 0, revenue: 0 })
  const [appts, setAppts]           = useState<AdminAppointment[]>([])
  const [loading, setLoading]       = useState(true)
  const [ytdMonths, setYtdMonths]   = useState<string[]>([])
  const [ytdBookings, setYtdBookings] = useState<number[]>([])

  const load = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    const year = new Date().getFullYear()
    const ytdTo = new Date().toISOString().split('T')[0]
    const [statsRes, apptsRes, ytdRes] = await Promise.all([
      fetch(`/api/appointments/stats?from=${bounds.from}&to=${bounds.to}`),
      fetch(`/api/appointments?from=${bounds.from}&to=${bounds.to}`),
      fetch(`/api/appointments?from=${year}-01-01&to=${ytdTo}`),
    ])
    if (statsRes.ok) setRangeStats(await statsRes.json())
    if (apptsRes.ok) setAppts((await apptsRes.json()).appointments)
    if (ytdRes.ok) {
      const ytdAppts: AdminAppointment[] = (await ytdRes.json()).appointments ?? []
      const currentMonth = new Date().getMonth()
      const counts = Array(currentMonth + 1).fill(0)
      ytdAppts.forEach(a => {
        const m = new Date(a.appointment_date).getMonth()
        if (m <= currentMonth) counts[m]++
      })
      setYtdMonths(MONTH_NAMES.slice(0, currentMonth + 1))
      setYtdBookings(counts)
    }
    setLoading(false)
  }, [hospital?.id, bounds])

  useEffect(() => { load() }, [load])

  function handleRangeChange(key: DateRangeKey, b: DateBounds) {
    setRange(key)
    setBounds(b)
  }

  const showupRate = rangeStats.total > 0
    ? Math.round((rangeStats.completed / rangeStats.total) * 100)
    : 0

  const specialty = computeSpecialtyBreakdown(appts)
  const types     = computeTypeBreakdown(appts)

  const SPEC_COLORS = [C.accent, C.blue, C.purple, C.amber, C.textSub]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Analytics</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
          Performance overview · {new Date().getFullYear()}
        </div>
      </div>

      {/* Date filter */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '12px 16px', marginBottom: 20 }}>
        <DateFilter value={range} onChange={handleRangeChange} label="Period" />
      </div>

      {/* KPIs */}
      <div className="dash-stat-grid-5" style={{ marginBottom: 22 }}>
        <StatCard icon={<CalendarDays size={18} />} label="Total Appointments"
          value={loading ? '…' : rangeStats.total.toLocaleString()}
          sub="Selected period" colorKey="accent" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed"
          value={loading ? '…' : rangeStats.completed.toLocaleString()}
          sub={loading ? '' : `${showupRate}% show-up rate`} colorKey="blue" />
        <StatCard icon={<XCircle size={18} />} label="Cancelled"
          value={loading ? '…' : rangeStats.cancelled.toLocaleString()}
          sub="Selected period" colorKey="purple" />
        <StatCard icon={<Star size={18} />} label="Patient Rating"
          value={stats.avgRating.toFixed(1)}
          sub={`${stats.reviewCount} reviews`} colorKey="amber" />
        <StatCard icon={<Wallet size={18} />} label="Est. Revenue"
          value={loading ? '…' : `₦${rangeStats.revenue.toLocaleString()}`}
          sub="From completed visits" colorKey="accent" />
      </div>

      {/* Breakdown + charts */}
      <div className="dash-half-grid" style={{ marginBottom: 16 }}>
        {/* Specialty breakdown — live from selected period */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Top Specialties
          </div>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 18 }}>
            {loading ? 'Loading…' : `${appts.length} appointment${appts.length !== 1 ? 's' : ''} in period`}
          </div>
          {loading ? (
            <div style={{ color: C.textMuted, fontSize: 13 }}>Loading…</div>
          ) : specialty.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 13 }}>No data for this period</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {specialty.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 120, fontSize: 12, color: C.textSub, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ flex: 1, height: 8, background: C.bgAlt, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${s.pct}%`, height: '100%', background: SPEC_COLORS[i] ?? C.accent,
                      borderRadius: 99, transition: 'width .6s' }} />
                  </div>
                  <div style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.text }}>{s.pct}%</div>
                  <div style={{ width: 40, textAlign: 'right', fontSize: 11, color: C.textMuted }}>{s.count}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Visit type breakdown — live */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Visit Type Split</div>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 20 }}>In-person vs virtual</div>
          {loading ? (
            <div style={{ color: C.textMuted, fontSize: 13 }}>Loading…</div>
          ) : appts.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 13 }}>No data for this period</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                {[
                  { label: 'In-person', count: types.inperson, color: C.accent, icon: <Building2 size={20} /> },
                  { label: 'Virtual',   count: types.virtual,  color: C.blue,   icon: <Video size={20} /> },
                ].map(t => (
                  <div key={t.label} style={{ flex: 1, background: C.bgAlt, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ marginBottom: 6, color: t.color }}>{t.icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: t.color }}>{t.count}</div>
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {appts.length > 0 ? Math.round(t.count / appts.length * 100) : 0}%
                    </div>
                  </div>
                ))}
              </div>
              {/* mini progress bar */}
              <div style={{ height: 10, background: C.bgAlt, borderRadius: 99, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${appts.length > 0 ? Math.round(types.inperson / appts.length * 100) : 0}%`,
                  background: C.accent, transition: 'width .6s' }} />
                <div style={{ flex: 1, background: C.blue }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Monthly Bookings YTD — real data */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 20, marginBottom: 16, transition: 'background .3s' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Monthly Bookings (YTD)</div>
        <div style={{ fontSize: 12, color: C.textSub, marginBottom: 20 }}>Total appointments per month · {new Date().getFullYear()}</div>
        {loading ? (
          <div style={{ color: C.textMuted, fontSize: 13 }}>Loading…</div>
        ) : ytdMonths.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: 13 }}>No data yet this year</div>
        ) : (() => {
          const maxB = Math.max(...ytdBookings, 1)
          return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140 }}>
              {ytdMonths.map((m, i) => (
                <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub }}>{ytdBookings[i]}</div>
                  <div style={{ width: '100%', borderRadius: '6px 6px 0 0',
                    background: i === ytdMonths.length - 1 ? C.accent : C.accentMid,
                    height: `${(ytdBookings[i] / maxB) * 110}px`, minHeight: 4, transition: 'height .4s' }} />
                  <div style={{ fontSize: 11, color: C.textMuted }}>{m}</div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
