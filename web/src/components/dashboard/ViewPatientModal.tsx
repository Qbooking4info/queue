'use client'
import { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getPatientProfile, getPatientMedicalHistory } from '@/lib/admin-api'
import type { PatientProfile, PatientMedicalHistory } from '@/lib/admin-api'

function calcAge(dob: string | null): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000)
}

export function ViewPatientModal({ patientId, patientName, onClose }: {
  patientId: string
  patientName: string
  onClose: () => void
}) {
  const { theme: C } = useTheme()
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [history, setHistory] = useState<PatientMedicalHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getPatientProfile(patientId), getPatientMedicalHistory(patientId)]).then(([p, h]) => {
      if (cancelled) return
      setProfile(p)
      setHistory(h)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [patientId])

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto',
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 20,
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: '28px',
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8,
  }
  const emptyText: React.CSSProperties = { fontSize: 12.5, color: C.textMuted, fontStyle: 'italic' }

  const age = profile?.date_of_birth ? calcAge(profile.date_of_birth) : null
  const hasAllergies  = (history?.allergies ?? []).length > 0
  const hasConditions = (history?.conditions ?? []).length > 0

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{profile?.full_name ?? patientName}</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
              {[age ? `${age}y` : null, profile?.gender, profile?.blood_group]
                .filter(Boolean).join(' · ') || 'Patient chart'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted,
            fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13 }}>Loading chart…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Contact */}
            <div>
              <div style={sectionLabel}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, color: C.text }}>
                <div>{profile?.phone ?? '—'}</div>
                <div>{profile?.email ?? '—'}</div>
                <div style={{ color: C.textSub }}>{[profile?.city, profile?.state].filter(Boolean).join(', ') || '—'}</div>
              </div>
            </div>

            {/* Allergies — surfaced first, safety-critical */}
            <div>
              <div style={sectionLabel}>⚠ Allergies</div>
              {hasAllergies ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {history!.allergies.map(a => (
                    <span key={a} style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 99,
                      background: C.redLight, color: C.red, border: `1px solid ${C.red}33` }}>
                      {a}
                    </span>
                  ))}
                </div>
              ) : <div style={emptyText}>No allergies on file</div>}
            </div>

            {/* Conditions */}
            <div>
              <div style={sectionLabel}>Current conditions</div>
              {hasConditions ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {history!.conditions.map(c => (
                    <span key={c} style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 99,
                      background: C.accentLight, color: C.accent, border: `1px solid ${C.accentBorder}` }}>
                      {c}
                    </span>
                  ))}
                </div>
              ) : <div style={emptyText}>No conditions on file</div>}
            </div>

            {/* Medications */}
            <div>
              <div style={sectionLabel}>Current medications</div>
              {history?.medications
                ? <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{history.medications}</div>
                : <div style={emptyText}>None recorded</div>}
            </div>

            {/* Surgeries */}
            <div>
              <div style={sectionLabel}>Previous surgeries / procedures</div>
              {history?.surgeries
                ? <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{history.surgeries}</div>
                : <div style={emptyText}>None recorded</div>}
            </div>

            {/* Family history */}
            <div>
              <div style={sectionLabel}>Family medical history</div>
              {history?.family_history
                ? <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{history.family_history}</div>
                : <div style={emptyText}>None recorded</div>}
            </div>

            {!history && (
              <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '10px 14px', fontSize: 12, color: C.textMuted }}>
                This patient hasn't filled in their medical history yet.
              </div>
            )}

            {history?.updated_at && (
              <div style={{ fontSize: 11, color: C.textMuted }}>
                Last updated by patient {new Date(history.updated_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
