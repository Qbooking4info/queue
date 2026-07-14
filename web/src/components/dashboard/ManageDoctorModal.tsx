'use client'
import { useState } from 'react'
import type { AdminDoctor } from '@/lib/admin-api'

export function ManageDoctorModal({ doctor, col, C, onClose, onUpdated }: {
  doctor: AdminDoctor
  col: { bg: string; text: string }
  C: any
  onClose: () => void
  onUpdated: (d: AdminDoctor) => void
}) {
  const [tab,      setTab]      = useState<'edit'|'password'>('edit')
  const [name,     setName]     = useState(doctor.full_name)
  const [email,    setEmail]    = useState(doctor.email ?? '')
  const [title,    setTitle]    = useState(doctor.title ?? '')
  const [fee,      setFee]      = useState(doctor.consultation_fee?.toString() ?? '')
  const [vFee,     setVFee]     = useState('')
  const [exp,      setExp]      = useState(doctor.years_experience?.toString() ?? '')
  const [password, setPassword] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 480, background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 20,
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: '28px',
    maxHeight: '90vh', overflowY: 'auto',
  }
  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.bgAlt,
    color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: C.textMuted,
    marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase',
  }

  async function saveProfile() {
    setSaving(true); setError(''); setSuccess('')
    const body: Record<string, unknown> = {
      full_name: name.trim() || undefined,
      title: title.trim() || null,
      consultation_fee: fee ? Number(fee) : null,
      virtual_fee: vFee ? Number(vFee) : undefined,
      years_experience: exp ? Number(exp) : null,
      ...(email.trim() ? { email: email.trim() } : {}),
    }
    const res = await fetch(`/api/doctors/${doctor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { setError(data.error); return }
    setSuccess('Profile updated')
    onUpdated({ ...doctor, full_name: name.trim() || doctor.full_name,
      email: email.trim() || doctor.email,
      title: title.trim() || null, consultation_fee: fee ? Number(fee) : doctor.consultation_fee,
      years_experience: exp ? Number(exp) : doctor.years_experience })
  }

  async function savePassword() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError(''); setSuccess('')
    const res = await fetch(`/api/doctors/${doctor.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: password }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { setError(data.error); return }
    setSuccess('Password updated successfully')
    setPassword('')
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
              {doctor.title ? `${doctor.title} ` : ''}{doctor.full_name}
            </div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{doctor.specialty_name ?? 'Doctor'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted,
            fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.bgAlt,
          borderRadius: 10, padding: 4 }}>
          {(['edit', 'password'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); setSuccess('') }}
              style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: tab === t ? C.card : 'transparent',
                color: tab === t ? C.text : C.textMuted,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
              {t === 'edit' ? 'Edit Profile' : 'Reset Password'}
            </button>
          ))}
        </div>

        {tab === 'edit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Title</label>
                <select value={title} onChange={e => setTitle(e.target.value)} style={inp}>
                  <option value="">None</option>
                  {['Dr.','Prof.','Assoc. Prof.','Mr.','Mrs.','Ms.'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} style={inp} />
              </div>
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="doctor@hospital.ng" style={inp} />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                If this doctor has a portal login, changing this also updates their sign-in email.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Consultation Fee (₦)</label>
                <input type="number" value={fee} onChange={e => setFee(e.target.value)}
                  placeholder="e.g. 5000" min={0} style={inp} />
              </div>
              <div>
                <label style={lbl}>Years Experience</label>
                <input type="number" value={exp} onChange={e => setExp(e.target.value)}
                  placeholder="e.g. 8" min={0} style={inp} />
              </div>
            </div>
            <div>
              <label style={lbl}>Virtual Fee (₦) — leave blank to keep current</label>
              <input type="number" value={vFee} onChange={e => setVFee(e.target.value)}
                placeholder="e.g. 3000" min={0} style={inp} />
            </div>
          </div>
        )}

        {tab === 'password' && (
          <div>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14 }}>
              Set a new portal password for <strong>{doctor.full_name}</strong>.
              Share the new password with the doctor securely.
            </div>
            <label style={lbl}>New Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters" style={inp} />
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
            color: '#f07070', fontSize: 12 }}>{error}</div>
        )}
        {success && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            color: '#4ade80', fontSize: 12 }}>{success}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
            background: C.bgAlt, border: `1px solid ${C.border}`,
            color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={tab === 'edit' ? saveProfile : savePassword} disabled={saving}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: saving ? C.border : col.text,
              color: '#061208', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
