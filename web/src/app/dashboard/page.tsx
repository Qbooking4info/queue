'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/dashboard/Badge'
import { ViewPatientModal } from '@/components/dashboard/ViewPatientModal'
import { DateFilter, getDateBounds } from '@/components/dashboard/DateFilter'
import type { DateRangeKey, DateBounds } from '@/components/dashboard/DateFilter'
import {
  getAppointments, getClinicAppointments, getRangeStats, getClinicRangeStats,
  setDoctorAvailability, getDoctorAvgConsultDuration,
} from '@/lib/admin-api'
import type { AdminAppointment, DoctorAvailabilityStatus } from '@/lib/admin-api'
import Link from 'next/link'

const DOC_COLORS: Record<string, string> = {}
const PALETTE = ['#1A4A32','#1A2A4A','#3A1A4A','#4A2A1A','#2A1A4A','#1A3A4A']
function docColor(name: string) {
  if (!DOC_COLORS[name]) DOC_COLORS[name] = PALETTE[Object.keys(DOC_COLORS).length % PALETTE.length]
  return DOC_COLORS[name]
}

const AVAIL_CONFIG: Record<DoctorAvailabilityStatus, { label: string; color: string; bg: string; border: string }> = {
  on_duty:  { label: 'On Duty',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' },
  on_break: { label: 'On Break', color: '#EF9F27', bg: 'rgba(239,159,39,0.12)', border: 'rgba(239,159,39,0.3)' },
  off_duty: { label: 'Off Duty', color: '#888',    bg: 'rgba(128,128,128,0.1)', border: 'rgba(128,128,128,0.25)' },
}

function ApptRow({ a, range, C }: { a: AdminAppointment; range: DateRangeKey; C: any }) {
  return (
    <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 52 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>{a.start_time}</div>
        {range !== 'today' && (
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
            {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        )}
      </div>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: docColor(a.doctor_name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
        {a.doctor_name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.patient_name}</div>
        <div style={{ fontSize: 11, color: C.textSub }}>
          {a.doctor_name} · {a.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'}
        </div>
      </div>
      <Badge status={a.status} />
    </div>
  )
}

export default function OverviewPage() {
  const { theme: C } = useTheme()
  const {
    hospital, clinicName, clinicId, role, user, doctorId, doctorAvailability,
    stats, doctors, todayAppointments, loading: ctxLoading,
  } = useAdmin()

  const [range,       setRange]       = useState<DateRangeKey>('today')
  const [bounds,      setBounds]      = useState<DateBounds>(getDateBounds('today'))
  const [viewingPatient, setViewingPatient] = useState<{ id: string; name: string } | null>(null)
  const [appts,       setAppts]       = useState<AdminAppointment[]>([])
  const [rangeStats,  setRangeStats]  = useState({ total: 0, completed: 0, cancelled: 0, pending: 0 })
  const [loading,     setLoading]     = useState(true)
  const [avail,       setAvail]       = useState<DoctorAvailabilityStatus>(doctorAvailability ?? 'on_duty')
  const [savingAvail, setSavingAvail] = useState(false)
  const [avgConsultSecs, setAvgConsultSecs] = useState<number | null>(null)

  useEffect(() => { if (doctorAvailability) setAvail(doctorAvailability) }, [doctorAvailability])

  useEffect(() => {
    if (role !== 'doctor' || !doctorId) return
    getDoctorAvgConsultDuration(doctorId).then(setAvgConsultSecs)
  }, [role, doctorId])

  const isScopedToClinic = (role === 'clinic_admin' || role === 'front_desk') && !!clinicId

  const load = useCallback(async () => {
    if (role === 'doctor') { setLoading(false); return }
    if (!hospital?.id) return
    setLoading(true)
    const [a, s] = await Promise.all([
      isScopedToClinic
        ? getClinicAppointments(hospital.id, clinicId!, bounds.from, bounds.to)
        : getAppointments(hospital.id, bounds.from, bounds.to),
      isScopedToClinic
        ? getClinicRangeStats(hospital.id, clinicId!, bounds.from, bounds.to)
        : getRangeStats(hospital.id, bounds.from, bounds.to),
    ])
    setAppts(a)
    setRangeStats(s)
    setLoading(false)
  }, [hospital?.id, bounds, isScopedToClinic, clinicId, role])

  useEffect(() => { load() }, [load])

  async function handleAvailabilityChange(status: DoctorAvailabilityStatus) {
    if (!doctorId) return
    setSavingAvail(true)
    setAvail(status)
    await setDoctorAvailability(doctorId, status)
    setSavingAvail(false)
  }

  const today = new Date()
  const timeStr = today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const greeting = today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'

  function greetingName() {
    if (role === 'doctor') return user?.displayName ?? 'Doctor'
    if ((role === 'clinic_admin' || role === 'front_desk') && clinicName) {
      return `${hospital?.name ?? ''} ${clinicName}`.trim()
    }
    if (role === 'super_admin') return user?.displayName ?? 'Admin'
    return hospital?.name ?? 'Dashboard'
  }

  const Header = () => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>
        Good {greeting}, {greetingName()} 👋
      </div>
      <div style={{ fontSize: 14, color: C.textSub, marginTop: 4 }} suppressHydrationWarning>
        {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {timeStr}
      </div>
    </div>
  )

  // ── Doctor dashboard ──────────────────────────────────────────────────────────
  if (role === 'doctor') {
    const cfg = AVAIL_CONFIG[avail]
    return (
      <div>
        <Header />

        {/* Availability toggle */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, marginBottom: 12 }}>My Availability Status</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(Object.keys(AVAIL_CONFIG) as DoctorAvailabilityStatus[]).map(s => {
              const c = AVAIL_CONFIG[s]
              const active = avail === s
              return (
                <button key={s} onClick={() => handleAvailabilityChange(s)} disabled={savingAvail}
                  style={{ padding: '9px 20px', borderRadius: 10, cursor: savingAvail ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                    background: active ? c.bg : C.bgAlt,
                    color: active ? c.color : C.textMuted,
                    border: `1px solid ${active ? c.border : C.border}`,
                    opacity: savingAvail ? 0.7 : 1, transition: 'all .15s' }}>
                  {s === 'on_duty' ? '🟢 ' : s === 'on_break' ? '🟡 ' : '⚫ '}{c.label}
                </button>
              )
            })}
          </div>
          {savingAvail && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>Saving…</div>}
        </div>

        {/* Doctor stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="📅" label="Today's Appointments"
            value={ctxLoading ? '…' : stats.todayTotal}
            sub={`${stats.todayCompleted} completed`} colorKey="accent" />
          <StatCard icon="✔" label="Completed Today"
            value={ctxLoading ? '…' : stats.todayCompleted}
            sub={stats.todayTotal > 0 ? `${Math.round(stats.todayCompleted / stats.todayTotal * 100)}% done` : 'None yet'}
            colorKey="blue" />
          <StatCard icon="👥" label="Total Patients Seen"
            value={ctxLoading ? '…' : stats.totalBookings}
            sub="All time" colorKey="purple" />
          <StatCard icon="⭐" label="Avg Rating"
            value={ctxLoading ? '…' : (stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—')}
            sub={stats.reviewCount > 0 ? `${stats.reviewCount} reviews` : 'No reviews yet'}
            colorKey="amber" />
          <StatCard icon="🕐" label="Avg Consultation Time"
            value={avgConsultSecs == null ? '—' : `${Math.round(avgConsultSecs / 60)}m`}
            sub={avgConsultSecs == null ? 'No data yet' : 'Per patient'}
            colorKey="blue" />
        </div>

        {/* Today's queue */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Today's Appointments</div>
            <Link href="/dashboard/appointments" style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 600 }}>
              View all →
            </Link>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {ctxLoading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
            ) : todayAppointments.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No appointments today</div>
            ) : todayAppointments.map((a, i) => (
              <div key={a.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 12,
                background: i % 2 === 1 ? C.rowAlt : C.card }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, minWidth: 42 }}>{a.start_time}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.patient_name}</div>
                  <div style={{ fontSize: 11, color: C.textSub }}>
                    {a.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'}{a.reason ? ` · ${a.reason}` : ''}
                  </div>
                </div>
                {a.patient_id && (
                  <button onClick={() => setViewingPatient({ id: a.patient_id!, name: a.patient_name })}
                    style={{ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 8,
                      background: C.accentLight, color: C.accent, border: `1px solid ${C.accentBorder}`,
                      cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    View Patient
                  </button>
                )}
                <Badge status={a.status} />
              </div>
            ))}
          </div>
        </div>

        {viewingPatient && (
          <ViewPatientModal
            patientId={viewingPatient.id}
            patientName={viewingPatient.name}
            onClose={() => setViewingPatient(null)}
          />
        )}
      </div>
    )
  }

  // ── Front desk dashboard ──────────────────────────────────────────────────────
  if (role === 'front_desk') {
    return (
      <div>
        <Header />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="📅" label="Today's Appointments"
            value={loading ? '…' : rangeStats.total}
            sub={`${rangeStats.completed} completed · ${rangeStats.pending} pending`}
            colorKey="accent" />
          <StatCard icon="✔" label="Completed"
            value={loading ? '…' : rangeStats.completed}
            sub={rangeStats.total > 0 ? `${Math.round(rangeStats.completed / rangeStats.total * 100)}% done` : '—'}
            colorKey="blue" />
          <StatCard icon="👨‍⚕️" label="Doctors Available"
            value={ctxLoading ? '…' : doctors.filter(d => ((d as any).availability_status ?? 'on_duty') === 'on_duty').length}
            sub="Currently on duty" colorKey="purple" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          {/* Appointments */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Appointments</div>
              <Link href="/dashboard/appointments" style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 600 }}>
                View all →
              </Link>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
              ) : appts.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No appointments</div>
              ) : appts.slice(0, 10).map((a, i) => (
                <div key={a.id} style={{ background: i % 2 === 1 ? C.rowAlt : C.card }}>
                  <ApptRow a={a} range={range} C={C} />
                </div>
              ))}
            </div>
          </div>

          {/* Doctor availability — view only */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              fontSize: 14, fontWeight: 700, color: C.text }}>Doctor Availability</div>
            {ctxLoading ? (
              <div style={{ padding: '16px 18px', fontSize: 12, color: C.textMuted }}>Loading…</div>
            ) : doctors.length === 0 ? (
              <div style={{ padding: '16px 18px', fontSize: 12, color: C.textMuted }}>No doctors assigned</div>
            ) : doctors.map(d => {
              const status = ((d as any).availability_status ?? 'on_duty') as DoctorAvailabilityStatus
              const cfg = AVAIL_CONFIG[status]
              return (
                <div key={d.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: d.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                    {d.avatar}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.full_name}</div>
                    <div style={{ fontSize: 10, color: C.textSub }}>{d.specialty_name ?? 'General'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Admin / clinic_admin dashboard ────────────────────────────────────────────
  return (
    <div>
      <Header />

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '12px 16px', marginBottom: 20 }}>
        <DateFilter value={range} onChange={(k, b) => { setRange(k); setBounds(b) }} label="Showing" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard icon="📅" label="Total Appointments"
          value={loading ? '…' : rangeStats.total}
          sub={`${rangeStats.completed} completed · ${rangeStats.pending} pending`}
          colorKey="accent" />
        <StatCard icon="✔" label="Completed"
          value={loading ? '…' : rangeStats.completed}
          sub={rangeStats.total > 0 ? `${Math.round(rangeStats.completed / rangeStats.total * 100)}% done` : 'No appointments'}
          colorKey="blue" />
        <StatCard icon="👨‍⚕️" label="Active Doctors"
          value={ctxLoading ? '…' : stats.activeDoctors}
          sub="On duty today" colorKey="purple" />
        <StatCard icon="⭐" label="Avg Rating"
          value={ctxLoading ? '…' : stats.avgRating.toFixed(1)}
          sub={`Based on ${stats.reviewCount} reviews`} colorKey="amber" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Appointments */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Appointments</div>
              {!loading && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{appts.length} records</div>}
            </div>
            <Link href="/dashboard/appointments" style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 600 }}>
              View all →
            </Link>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
            ) : appts.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No appointments for this period</div>
            ) : appts.slice(0, 10).map((a, i) => (
              <div key={a.id} style={{ background: i % 2 === 1 ? C.rowAlt : C.card }}>
                <ApptRow a={a} range={range} C={C} />
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

        {/* Right column: doctors + quick actions (admins only) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              fontSize: 14, fontWeight: 700, color: C.text }}>
              Doctors On Duty
            </div>
            {ctxLoading ? (
              <div style={{ padding: '16px 18px', fontSize: 12, color: C.textMuted }}>Loading…</div>
            ) : doctors.length === 0 ? (
              <div style={{ padding: '16px 18px', fontSize: 12, color: C.textMuted }}>No doctors yet</div>
            ) : doctors.slice(0, 5).map(d => {
              const status = ((d as any).availability_status ?? 'on_duty') as DoctorAvailabilityStatus
              const cfg = AVAIL_CONFIG[status]
              return (
                <div key={d.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: d.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                    {d.avatar}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.full_name}</div>
                    <div style={{ fontSize: 10, color: C.textSub }}>{d.specialty_name ?? 'General'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Quick Actions — admins only, not front_desk or doctor */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              fontSize: 14, fontWeight: 700, color: C.text }}>
              Quick Actions
            </div>
            {[
              { href: '/dashboard/doctors/add', icon: '👨‍⚕️', label: 'Register Doctor',   sub: 'Add a new practitioner' },
              { href: '/dashboard/services',    icon: '🏥',   label: 'Manage Services',  sub: 'Enable specialties & pricing' },
              { href: '/dashboard/settings',    icon: '⚙️',   label: 'Hospital Settings', sub: 'Update profile and preferences' },
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
