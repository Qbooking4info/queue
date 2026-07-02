'use client'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import type { AdminHospital } from '@/lib/admin-api'

function HospitalCard({ h, C }: { h: AdminHospital; C: any }) {
  return (
    <div style={{ padding: '20px 24px', borderRadius: 16, background: C.card, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{h.name}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{h.city}, {h.state}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{h.type ?? 'Hospital'}</div>
        </div>
        <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          background: h.is_verified ? 'rgba(34,197,94,0.12)' : 'rgba(239,159,39,0.12)',
          color: h.is_verified ? '#4ade80' : '#EF9F27',
          border: `1px solid ${h.is_verified ? 'rgba(34,197,94,0.3)' : 'rgba(239,159,39,0.3)'}` }}>
          {h.is_verified ? 'Verified' : 'Pending'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {h.total_bookings != null && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>{h.total_bookings.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Total Bookings</div>
          </div>
        )}
        {h.avg_rating != null && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#EF9F27' }}>★ {h.avg_rating.toFixed(1)}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Avg Rating</div>
          </div>
        )}
        {h.phone && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{h.phone}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Phone</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function HospitalsPage() {
  const { theme: C } = useTheme()
  const { role, allHospitals, loading } = useAdmin()

  if (role !== 'super_admin') {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: C.textMuted }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Access Restricted</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>Only platform administrators can view all hospitals.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>
          All Hospitals
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
          {allHospitals.length} hospital{allHospitals.length !== 1 ? 's' : ''} on the platform
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>Loading…</div>
      ) : allHospitals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>No hospitals found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {allHospitals.map(h => <HospitalCard key={h.id} h={h} C={C} />)}
        </div>
      )}
    </div>
  )
}
