'use client'
import { useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import Link from 'next/link'

export default function DoctorsPage() {
  const { theme: C } = useTheme()
  const { doctors, stats, loading, hospital, reload } = useAdmin()

  useEffect(() => { reload() }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Doctors & Staff</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
            {stats.activeDoctors} practitioner{stats.activeDoctors !== 1 ? 's' : ''} registered
          </div>
        </div>
        <Link href="/dashboard/doctors/add"
          style={{ background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
            border: 'none', borderRadius: 10, padding: '10px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>
          + Invite Doctor
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>Loading doctors…</div>
      ) : doctors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', border: `2px dashed ${C.border}`,
          borderRadius: 20, color: C.textMuted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍⚕️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textSub, marginBottom: 6 }}>No doctors yet</div>
          <div style={{ fontSize: 13 }}>Add your first doctor to start accepting bookings</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {doctors.map((d, i) => {
            const statuses = ['Available', 'With Patient', 'On Break']
            const status = statuses[i % statuses.length]
            return (
              <div key={d.id} style={{ background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 16, padding: 20, transition: 'background .3s' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: d.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800, color: '#a0e8c0', flexShrink: 0 }}>
                    {d.avatar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                          {d.title ? `${d.title} ` : ''}{d.full_name}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSub }}>{d.specialty_name ?? 'General Practice'}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                        background: status === 'Available' ? C.accentLight : status === 'With Patient' ? C.amberLight : C.border,
                        color: status === 'Available' ? C.accent : status === 'With Patient' ? C.amber : C.textMuted }}>
                        {status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: C.amber }}>
                        {'★'.repeat(Math.floor(d.avg_rating ?? 4))}
                      </span>
                      <span style={{ fontSize: 11, color: C.textSub }}>
                        {d.avg_rating?.toFixed(1) ?? '—'} ({d.review_count ?? 0} reviews)
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                  {[
                    { label: 'Consult Fee', value: d.consultation_fee ? `₦${d.consultation_fee.toLocaleString()}` : '—' },
                    { label: 'Experience',  value: d.years_experience ? `${d.years_experience}yr` : '—' },
                    { label: 'Virtual',     value: d.accepts_virtual ? '✓ Yes' : '✗ No' },
                  ].map(s => (
                    <div key={s.label} style={{ background: C.bgAlt, borderRadius: 10, padding: '10px',
                      textAlign: 'center', transition: 'background .3s' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ flex: 1, padding: '9px', borderRadius: 10,
                    border: `1px solid ${C.border}`, background: C.card,
                    color: C.textSub, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    View Schedule
                  </button>
                  <button style={{ flex: 1, padding: '9px', borderRadius: 10,
                    border: `1px solid ${C.accentBorder}`, background: C.accentLight,
                    color: C.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Edit Profile
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
