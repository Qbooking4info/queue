'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { getAllSpecialties } from '@/lib/admin-api'
import type { SpecialtyRow } from '@/lib/admin-api'

export default function AddDoctorPage() {
  const { theme: C }                          = useTheme()
  const { hospital, clinicId, reload, role }  = useAdmin()
  const router                                = useRouter()

  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  const [saving, setSaving]           = useState(false)
  const [error,  setError]            = useState('')

  const [form, setForm] = useState({
    full_name:        '',
    title:            '',
    specialty_id:     '',
    consultation_fee: '',
    virtual_fee:      '',
    years_experience: '',
    accepts_virtual:  false,
    bio:              '',
    qualification:    '',
    mdcn_number:      '',
    login_email:      '',
    login_password:   '',
  })

  useEffect(() => {
    if (role === 'front_desk' || role === 'doctor') { router.replace('/dashboard'); return }
    getAllSpecialties().then(setSpecialties)
  }, [role])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hospital) return
    if (!form.full_name.trim()) { setError('Full name is required'); return }
    setSaving(true); setError('')

    const res = await fetch('/api/doctors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalId:       hospital.id,
        clinicId:         clinicId ?? null,
        full_name:        form.full_name.trim(),
        title:            form.title.trim() || null,
        specialty_id:     form.specialty_id || null,
        consultation_fee: form.consultation_fee  ? Number(form.consultation_fee)  : null,
        virtual_fee:      form.virtual_fee       ? Number(form.virtual_fee)       : null,
        years_experience: form.years_experience  ? Number(form.years_experience)  : null,
        accepts_virtual:  form.accepts_virtual,
        bio:              form.bio.trim()           || null,
        qualification:    form.qualification.trim() || null,
        mdcn_number:      form.mdcn_number.trim()   || null,
        login_email:      form.login_email.trim()   || null,
        login_password:   form.login_password       || null,
      }),
    })
    const result = await res.json()

    setSaving(false)
    if (result.error) { setError(result.error); return }
    await reload()
    router.push('/dashboard/doctors')
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.bgAlt,
    color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700,
    color: C.textMuted, marginBottom: 6, letterSpacing: '.03em', textTransform: 'uppercase',
  }
  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: C.textSub, fontSize: 13,
            cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          ← Back to Doctors
        </button>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Add Doctor</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>Register a new practitioner at {hospital?.name}</div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, marginBottom: 16 }}>Basic information</div>

          <div style={{ ...row, marginBottom: 16 }}>
            <div>
              <label style={label}>Title</label>
              <select value={form.title} onChange={set('title')} style={input}>
                <option value="">None</option>
                {['Dr.', 'Prof.', 'Assoc. Prof.', 'Mr.', 'Mrs.', 'Ms.'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Full Name *</label>
              <input required value={form.full_name} onChange={set('full_name')}
                placeholder="e.g. Amina Okonkwo" style={input} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>Specialty</label>
            <select value={form.specialty_id} onChange={set('specialty_id')} style={input}>
              <option value="">Select specialty…</option>
              {specialties.map(s => (
                <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>Bio / Qualifications</label>
            <textarea value={form.bio} onChange={set('bio') as any}
              placeholder="Brief bio, qualifications, areas of expertise…"
              rows={3} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, marginBottom: 16 }}>Fees & Experience</div>

          <div style={{ ...row, marginBottom: 16 }}>
            <div>
              <label style={label}>Consultation Fee (₦)</label>
              <input type="number" value={form.consultation_fee} onChange={set('consultation_fee')}
                placeholder="e.g. 5000" min={0} style={input} />
            </div>
            <div>
              <label style={label}>Years of Experience</label>
              <input type="number" value={form.years_experience} onChange={set('years_experience')}
                placeholder="e.g. 8" min={0} max={60} style={input} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            background: C.bgAlt, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <input type="checkbox" id="accepts_virtual" checked={form.accepts_virtual}
              onChange={e => setForm(f => ({ ...f, accepts_virtual: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: C.accent }} />
            <div>
              <label htmlFor="accepts_virtual" style={{ fontSize: 13, fontWeight: 700, color: C.text, cursor: 'pointer' }}>
                Accepts virtual consultations
              </label>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                Patient can book a video/phone call instead of an in-person visit
              </div>
            </div>
          </div>

          {form.accepts_virtual && (
            <div>
              <label style={label}>Virtual Consultation Fee (₦)</label>
              <input type="number" value={form.virtual_fee} onChange={set('virtual_fee')}
                placeholder="Leave blank to use consultation fee" min={0} style={input} />
            </div>
          )}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, marginBottom: 16 }}>Credentials (optional)</div>
          <div style={row}>
            <div>
              <label style={label}>Qualifications</label>
              <input value={form.qualification} onChange={set('qualification')}
                placeholder="e.g. MBBS, FWACP" style={input} />
            </div>
            <div>
              <label style={label}>MDCN Number</label>
              <input value={form.mdcn_number} onChange={set('mdcn_number')}
                placeholder="Medical licence number" style={input} />
            </div>
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, marginBottom: 4 }}>Dashboard login access (optional)</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
            Give the doctor login credentials so they can view their appointments and schedule.
          </div>
          <div style={{ ...row, marginBottom: 0 }}>
            <div>
              <label style={label}>Login Email</label>
              <input type="email" value={form.login_email} onChange={set('login_email')}
                placeholder="doctor@hospital.ng" style={input} />
            </div>
            <div>
              <label style={label}>Temporary Password</label>
              <input type="password" value={form.login_password} onChange={set('login_password')}
                placeholder="Min. 8 characters" minLength={8} style={input} />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 10,
            padding: '10px 14px', marginBottom: 16, color: C.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => router.back()}
            style={{ padding: '11px 22px', borderRadius: 10, border: `1px solid ${C.border}`,
              background: C.card, color: C.textSub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            style={{ padding: '11px 28px', borderRadius: 10, border: 'none',
              background: saving ? C.border : C.accent,
              color: C.id === 'forest' ? '#061208' : '#fff',
              fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Add Doctor'}
          </button>
        </div>
      </form>
    </div>
  )
}
