'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SpecialtyRow } from '@/lib/admin-api'

// The step-code / step-confirm Doctor ID lookup+link flow, with no modal chrome of
// its own -- reused both standalone (LinkDoctorModal, below) and embedded as a tab
// inside AssignDoctorModal (clinics/[clinicId]/page.tsx), which already owns its own
// overlay/header. This is the ONLY way a doctor gets added anywhere in the dashboard
// (see 20260826 removal of the manual "+ Invite Doctor"/"Add New Doctor" forms) --
// every entry point must go through this same ID lookup, never a name-and-specialty form.
export function LinkDoctorForm({ clinicId, C, onCancel, onLinked, cancelLabel = 'Cancel' }: {
  clinicId: string | null
  C: any
  onCancel: () => void
  onLinked: () => void
  cancelLabel?: string
}) {
  const [step,       setStep]       = useState<'code' | 'confirm'>('code')
  const [doctorId,   setDoctorId]   = useState('')
  const [fullName,   setFullName]   = useState('')
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  const [specialtyId, setSpecialtyId] = useState('')
  const [busy,       setBusy]       = useState(false)
  const [error,      setError]      = useState('')

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.bgAlt,
    color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: C.textMuted,
    marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase',
  }

  // Step 1: resolve the Doctor ID to an account, and find what specialty they're
  // already practicing under elsewhere (if anywhere) to pre-fill the picker --
  // the admin still confirms/changes it since specialty is per-hospital, not
  // carried over automatically like the rest of the profile.
  async function lookUp() {
    if (!doctorId.trim()) { setError('Doctor ID is required'); return }
    setBusy(true); setError('')
    const [lookupRes, specialtiesRes] = await Promise.all([
      fetch(`/api/doctors/link?code=${encodeURIComponent(doctorId.trim())}`),
      specialties.length ? Promise.resolve(null) : createClient().from('specialties').select('id, name, icon, slug').order('name'),
    ])
    const data = await lookupRes.json()
    setBusy(false)
    if (data.error) { setError(data.error); return }
    if (data.alreadyLinked) { setError('This doctor is already linked to your hospital'); return }
    if (specialtiesRes?.data) setSpecialties(specialtiesRes.data as SpecialtyRow[])
    setFullName(data.fullName)
    setSpecialtyId(data.suggestedSpecialtyId ?? '')
    setStep('confirm')
  }

  async function submit() {
    setBusy(true); setError('')
    const res = await fetch('/api/doctors/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorCode: doctorId.trim(), clinicId, specialtyId: specialtyId || null }),
    })
    const data = await res.json()
    setBusy(false)
    if (data.error) { setError(data.error); return }
    onLinked()
  }

  return step === 'code' ? (
    <>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16, lineHeight: 1.5 }}>
        If a doctor already has their own account on the Doctors app, ask them for their
        6-character Doctor ID (shown on their profile) and type it here to link them to your hospital.
      </div>

      <label style={lbl}>Doctor ID</label>
      <input value={doctorId} onChange={e => setDoctorId(e.target.value.toUpperCase())}
        placeholder="e.g. K7M3QX" maxLength={6}
        style={{ ...inp, fontFamily: 'monospace', fontSize: 18, letterSpacing: '.15em', textAlign: 'center' }} />

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
          color: '#f07070', fontSize: 12 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
          background: C.bgAlt, border: `1px solid ${C.border}`,
          color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
          {cancelLabel}
        </button>
        <button onClick={lookUp} disabled={busy}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: busy ? C.border : C.accent,
            color: C.id === 'forest' ? '#061208' : '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Looking up…' : 'Look Up'}
        </button>
      </div>
    </>
  ) : (
    <>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16, lineHeight: 1.5 }}>
        Found <strong style={{ color: C.text }}>{fullName}</strong>. Their profile (bio, qualifications,
        experience, photo) transfers automatically — just choose the specialty they'll practice under
        at your hospital.
      </div>

      <label style={lbl}>Specialty</label>
      <select value={specialtyId} onChange={e => setSpecialtyId(e.target.value)} style={inp}>
        <option value="">Select specialty…</option>
        {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
          color: '#f07070', fontSize: 12 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <button onClick={() => { setStep('code'); setError('') }} style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
          background: C.bgAlt, border: `1px solid ${C.border}`,
          color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
          Back
        </button>
        <button onClick={submit} disabled={busy}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: busy ? C.border : C.accent,
            color: C.id === 'forest' ? '#061208' : '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Linking…' : 'Confirm & Link'}
        </button>
      </div>
    </>
  )
}

export function LinkDoctorModal({ clinicId, C, onClose, onLinked }: {
  clinicId: string | null
  C: any
  onClose: () => void
  onLinked: () => void
}) {
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

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Link Existing Doctor</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.textMuted,
            fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <LinkDoctorForm clinicId={clinicId} C={C} onCancel={onClose} onLinked={onLinked} />
      </div>
    </div>
  )
}
