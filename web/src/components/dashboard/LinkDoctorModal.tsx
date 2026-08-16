'use client'
import { useState } from 'react'

export function LinkDoctorModal({ clinicId, C, onClose, onLinked }: {
  clinicId: string | null
  C: any
  onClose: () => void
  onLinked: () => void
}) {
  const [doctorId, setDoctorId] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 440, background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 20,
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: '28px',
  }
  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.bgAlt,
    color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'monospace',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: C.textMuted,
    marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase',
  }

  async function submit() {
    if (!doctorId.trim()) { setError('Doctor ID is required'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/doctors/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorAccountId: doctorId.trim(), clinicId }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { setError(data.error); return }
    onLinked()
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Link Existing Doctor</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.textMuted,
            fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16, lineHeight: 1.5 }}>
          If a doctor already has their own account on the Doctors app, ask them for their
          Doctor ID (shown on their profile) and paste it here to link them to your hospital.
        </div>

        <label style={lbl}>Doctor ID</label>
        <input value={doctorId} onChange={e => setDoctorId(e.target.value)}
          placeholder="e.g. 3f1a9c2e-4b5d-4e2a-9f0a-1234567890ab" style={inp} />

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
            color: '#f07070', fontSize: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
            background: C.bgAlt, border: `1px solid ${C.border}`,
            color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: saving ? C.border : C.accent,
              color: C.id === 'forest' ? '#061208' : '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Linking…' : 'Link Doctor'}
          </button>
        </div>
      </div>
    </div>
  )
}
