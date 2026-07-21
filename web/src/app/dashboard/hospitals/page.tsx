'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import type { AdminHospital } from '@/lib/admin-api'

interface HospitalStat {
  id: string; name: string; city: string; state: string; type: string | null
  is_verified: boolean; joined: string
  monthly_bookings: number; total_completed: number; active_doctors: number
}

interface Analytics {
  month: string
  hospitals: HospitalStat[]
  totals: { hospitals: number; verified: number; monthly_bookings: number; total_completed: number; active_doctors: number }
}

function StatChip({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#7A9089', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function HospitalRow({ h, C, onManage, canManage }: { h: HospitalStat; C: any; onManage: () => void; canManage: boolean }) {
  return (
    <div style={{ padding: '18px 22px', borderRadius: 14, background: C.card, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{h.name}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{h.city}, {h.state} · {h.type ?? 'Hospital'}</div>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
          background: h.is_verified ? 'rgba(34,197,94,0.12)' : 'rgba(239,159,39,0.12)',
          color:      h.is_verified ? '#4ade80' : '#EF9F27',
          border:     `1px solid ${h.is_verified ? 'rgba(34,197,94,0.3)' : 'rgba(239,159,39,0.3)'}`,
        }}>
          {h.is_verified ? 'Verified' : 'Pending'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
        <StatChip label="This Month" value={h.monthly_bookings.toLocaleString()} color={C.accent} />
        <StatChip label="All-Time Completed" value={h.total_completed.toLocaleString()} color="#55A7EB" />
        <StatChip label="Active Doctors" value={h.active_doctors} color="#EF9F27" />
      </div>

      {canManage ? (
        <button onClick={onManage} style={{
          width: '100%', padding: '9px 16px', borderRadius: 10, border: 'none',
          background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Manage Hospital →
        </button>
      ) : (
        <button disabled title="You don't have access to this hospital." style={{
          width: '100%', padding: '9px 16px', borderRadius: 10, border: `1px solid ${C.border}`,
          background: C.bgAlt, color: C.textMuted,
          fontSize: 13, fontWeight: 700, cursor: 'not-allowed', fontFamily: 'inherit', opacity: 0.6,
        }}>
          Manage Hospital — No Access
        </button>
      )}
    </div>
  )
}

export default function HospitalsPage() {
  const { theme: C } = useTheme()
  const { role, allHospitals, loading: ctxLoading, switchHospital, clearHospital } = useAdmin()
  const router = useRouter()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  useEffect(() => {
    if (role === 'super_admin') clearHospital()
  }, [role])

  useEffect(() => {
    if (role !== 'super_admin') return
    fetch('/api/super-admin/analytics')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setAnalytics(d); setAnalyticsLoading(false) })
      .catch(() => setAnalyticsLoading(false))
  }, [role])

  if (role !== 'super_admin') {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: C.textMuted }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Access Restricted</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>Only platform administrators can view all hospitals.</div>
      </div>
    )
  }

  async function handleManage(h: AdminHospital) {
    await switchHospital(h)
    router.push('/dashboard')
  }

  function findAdminHospital(id: string): AdminHospital | undefined {
    return allHospitals.find(h => h.id === id)
  }

  const loading = ctxLoading || analyticsLoading
  const stats = analytics?.totals
  const hospitals = analytics?.hospitals ?? []
  const monthLabel = analytics?.month
    ? new Date(analytics.month + '-01').toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
    : ''

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Platform Analytics</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
          Aggregate view — no patient data · {monthLabel}
        </div>
      </div>

      {/* Platform-wide totals */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 24px',
        }}>
          <StatChip label="Hospitals" value={stats.hospitals} color={C.text} />
          <StatChip label="Verified" value={stats.verified} color={C.accent} />
          <StatChip label={`${monthLabel} Bookings`} value={stats.monthly_bookings.toLocaleString()} color="#55A7EB" />
          <StatChip label="All-Time Completed" value={stats.total_completed.toLocaleString()} color="#EF9F27" />
          <StatChip label="Active Doctors" value={stats.active_doctors} color="#f07070" />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>Loading…</div>
      ) : hospitals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>No hospitals found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {hospitals.map(h => {
            const adminH = findAdminHospital(h.id)
            return (
              <HospitalRow
                key={h.id} h={h} C={C}
                canManage={!!adminH}
                onManage={() => adminH ? handleManage(adminH) : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
