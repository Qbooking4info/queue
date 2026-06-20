'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/dashboard/Badge'
import { DateFilter, getDateBounds } from '@/components/dashboard/DateFilter'
import type { DateRangeKey, DateBounds } from '@/components/dashboard/DateFilter'
import { getAppointments, getRangeStats } from '@/lib/admin-api'
import type { AdminAppointment } from '@/lib/admin-api'
import Link from 'next/link'

const DOC_COLORS: Record<string, string> = {}
const PALETTE = ['#1A4A32','#1A2A4A','#3A1A4A','#4A2A1A','#2A1A4A','#1A3A4A']
function docColor(name: string) {
  if (!DOC_COLORS[name]) DOC_COLORS[name] = PALETTE[Object.keys(DOC_COLORS).length % PALETTE.length]
  return DOC_COLORS[name]
}

const docStatuses = ['Available', 'With Patient', 'On Break']

export default function OverviewPage() {
  const { theme: C } = useTheme()
  const { hospital, stats, doctors, loading: ctxLoading } = useAdmin()

  const [range, setRange]       = useState<DateRangeKey>('today')
  const [bounds, setBounds]     = useState<DateBounds>(getDateBounds('today'))
  const [appts, setAppts]       = useState<AdminAppointment[]>([])
  const [rangeStats, setRangeStats] = useState({ total: 0, completed: 0, cancelled: 0, pending: 0 })
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    const [a, s] = await Promise.all([
      getAppointments(hospital.id, bounds.from, bounds.to),
      getRangeStats(hospital.id, bounds.from, bounds.to),
    ])
    setAppts(a)
    setRangeStats(s)
    setLoading(false)
  }, [hospital?.id, bounds])

  useEffect(() => { load() }, [load])

  function handleRangeChange(key: DateRangeKey, b: DateBounds) {
    setRange(key)
    setBounds(b)
  }

  const today = new Date()
  const timeStr = today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>
          Good {today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}, {hospital?.name ?? 'Dashboard'} 👋
        </div>
        <div style={{ fontSize: 14, color: C.textSub, marginTop: 4 }} suppressHydrationWarning>
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {timeStr}
        </div>
      </div>

      {/* Date filter bar */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '12px 16px', marginBottom: 20 }}>
        <DateFilter value={range} onChange={handleRangeChange} label="Showing" />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard icon="📅" label="Total Appointments"
          value={loading ? '…' : rangeStats.total}
          sub={`${rangeStats.completed} completed · ${rangeStats.pending} pending`}
          colorKey="accent" />
        <StatCard icon="✔" label="Completed"
          value={loading ? '…' : rangeStats.completed}
          sub={rangeStats.total > 0 ? `${Math.round(rangeStats.completed / rangeStats.total * 100)}% completion rate` : 'No appointments'}
          colorKey="blue" />
        <StatCard icon="👨‍⚕️" label="Active Doctors"
          value={ctxLoading ? '…' : stats.activeDoctors}
          sub="On duty today" colorKey="purple" />
        <StatCard icon="⭐" label="Avg Rating"
          value={ctxLoading ? '…' : stats.avgRating.toFixed(1)}
          sub={`Based on ${stats.reviewCount} reviews`} colorKey="amber" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Appointments list */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Appointments</div>
              {!loading && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                  {appts.length} record{appts.length !== 1 ? 's' : ''} · all clinics
                </div>
              )}
            </div>
            <Link href="/dashboard/appointments"
              style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 600 }}>
              View all →
            </Link>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
            ) : appts.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                No appointments for this period
              </div>
            ) : appts.slice(0, 10).map((a, i) => (
              <div key={a.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 12,
                background: i % 2 === 1 ? C.rowAlt : C.card }}>
                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 56 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>{a.start_time}</div>
                  {range !== 'today' && (
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                      {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  )}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8,
                  background: docColor(a.doctor_name), display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                  {a.doctor_name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.patient_name}
                  </div>
                  <div style={{ fontSize: 11, color: C.textSub }}>
                    {a.specialty_name ?? 'General'} · {a.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'}
                  </div>
                </div>
                <Badge status={a.status} />
              </div>
            ))}
            {appts.length > 10 && (
              <div style={{ padding: '12px 20px', textAlign: 'center' }}>
                <Link href="/dashboard/appointments" style={{ fontSize: 12, color: C.accent, fontWeight: 600, textDecoration: 'none' }}>
                  +{appts.length - 10} more — View all →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Doctors on duty */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              fontSize: 14, fontWeight: 700, color: C.text }}>
              Doctors On Duty
            </div>
            {ctxLoading ? (
              <div style={{ padding: '16px 18px', fontSize: 12, color: C.textMuted }}>Loading…</div>
            ) : doctors.length === 0 ? (
              <div style={{ padding: '16px 18px', fontSize: 12, color: C.textMuted }}>No doctors yet</div>
            ) : doctors.slice(0, 4).map((d, i) => {
              const status = docStatuses[i % docStatuses.length]
              return (
                <div key={d.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: d.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                    {d.avatar}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.full_name}
                    </div>
                    <div style={{ fontSize: 10, color: C.textSub }}>{d.specialty_name ?? 'General'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: status === 'Available' ? C.accentLight : status === 'With Patient' ? C.amberLight : C.border,
                    color: status === 'Available' ? C.accent : status === 'With Patient' ? C.amber : C.textMuted,
                    border: `1px solid ${status === 'Available' ? C.accentBorder : 'transparent'}` }}>
                    {status}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Quick actions */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              fontSize: 14, fontWeight: 700, color: C.text }}>
              Quick Actions
            </div>
            {[
              { href: '/dashboard/doctors',  icon: '👨‍⚕️', label: 'Add a Doctor',      sub: 'Register doctors & set availability' },
              { href: '/dashboard/services', icon: '🏥', label: 'Manage Services',    sub: 'Enable specialties & set pricing'  },
              { href: '/dashboard/settings', icon: '⚙️',  label: 'Hospital Settings', sub: 'Update profile and preferences'    },
            ].map(item => (
              <Link key={item.href} href={item.href}
                style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: C.textMuted }}>{item.sub}</div>
                </div>
                <span style={{ color: C.textMuted, fontSize: 14 }}>›</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
