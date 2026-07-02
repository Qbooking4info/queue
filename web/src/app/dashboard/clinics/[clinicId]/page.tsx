'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { Badge } from '@/components/dashboard/Badge'
import { DateFilter, getDateBounds } from '@/components/dashboard/DateFilter'
import type { DateRangeKey, DateBounds } from '@/components/dashboard/DateFilter'
import {
  getClinicDetail, getClinicStaff, getClinicDoctors, getClinicAppointments,
  getClinicRangeStats, getUnassignedDoctors, assignDoctorToClinic,
  removeDoctorFromClinic, createClinicDoctor, updateAppointmentStatus,
  toggleClinicActive, deleteClinic, updateClinic,
  approveAppointment, rejectAppointment,
} from '@/lib/admin-api'
import type {
  ClinicDetail, ClinicStaffMember, AdminDoctor, AdminAppointment,
} from '@/lib/admin-api'
import { adminDb } from '@/lib/supabase/admin-client'
import { ServiceTagPicker } from '@/components/dashboard/ServiceTagPicker'

// ── Constants ─────────────────────────────────────────────────────────────────

const CLINIC_PALETTE = [
  { bg: 'rgba(0,232,122,0.14)',   text: '#00E87A' },
  { bg: 'rgba(85,167,235,0.14)',  text: '#55A7EB' },
  { bg: 'rgba(180,156,240,0.14)', text: '#B49CF0' },
  { bg: 'rgba(239,159,39,0.14)',  text: '#EF9F27' },
  { bg: 'rgba(240,112,112,0.14)', text: '#F07070' },
  { bg: 'rgba(86,220,180,0.14)',  text: '#56DCB4' },
]

function clinicColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i)
  return CLINIC_PALETTE[Math.abs(h) % CLINIC_PALETTE.length]
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let p = 'Queue@'
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p + '!'
}

type Tab = 'overview' | 'doctors' | 'staff' | 'appointments' | 'analytics'

// ── Edit Clinic Modal ─────────────────────────────────────────────────────────

function EditClinicModal({
  clinic, col, onClose, onSave,
}: { clinic: ClinicDetail; col: typeof CLINIC_PALETTE[0]; onClose: () => void; onSave: (name: string, description: string | undefined, serviceTags: string[]) => void }) {
  const { theme: C } = useTheme()
  const [name,        setName]        = useState(clinic.name)
  const [desc,        setDesc]        = useState(clinic.description ?? '')
  const [serviceTags, setServiceTags] = useState<string[]>(clinic.service_tags ?? [])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true); setError('')
    const { error: err } = await updateClinic(clinic.id, {
      name: name.trim(),
      description: desc.trim() || null,
      service_tags: serviceTags,
    })
    setSaving(false)
    if (err) { setError(err.message ?? 'Failed to save'); return }
    onSave(name.trim(), desc.trim() || undefined, serviceTags)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{ width: '100%', maxWidth: 440, background: C.card,
        border: `1px solid ${C.borderMed}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Edit Clinic</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
              Update the clinic name and description
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: C.bgAlt,
              border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block',
              marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Clinic Name *
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Cardiology Unit" style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block',
              marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Description <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="e.g. Handles cardiac patients and ECG services"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block',
              marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Services Offered
            </label>
            <ServiceTagPicker selected={serviceTags} onChange={setServiceTags} />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              Helps patients find this clinic when searching by service type.
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !name.trim()}
              style={{ flex: 2, padding: '11px', borderRadius: 10, fontFamily: 'inherit',
                background: name.trim() ? col.text : C.bgAlt,
                color: name.trim() ? '#061208' : C.textMuted,
                border: 'none', fontSize: 13, fontWeight: 700,
                cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Assign Doctor Modal ───────────────────────────────────────────────────────

function AssignDoctorModal({
  clinicId, hospitalId, col,
  onClose, onDone,
}: { clinicId: string; hospitalId: string; col: typeof CLINIC_PALETTE[0]; onClose: () => void; onDone: () => void }) {
  const { theme: C } = useTheme()
  const [tab, setTab]         = useState<'assign' | 'new'>('assign')
  const [pool, setPool]       = useState<AdminDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)

  // New doctor form state
  const [name, setName]       = useState('')
  const [title, setTitle]     = useState('Dr.')
  const [spec, setSpec]       = useState('')
  const [specId, setSpecId]   = useState('')
  const [fee, setFee]         = useState('')
  const [virtual, setVirtual] = useState(false)
  const [specialties, setSpecialties] = useState<{id: string; name: string}[]>([])
  const [creating, setCreating] = useState(false)
  const [newError, setNewError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [docs, { data: specs }] = await Promise.all([
        getUnassignedDoctors(hospitalId),
        adminDb.from('specialties').select('id, name').eq('is_active', true).order('name'),
      ])
      setPool(docs)
      setSpecialties((specs ?? []) as {id: string; name: string}[])
      setLoading(false)
    }
    load()
  }, [hospitalId])

  async function handleAssign(doctorId: string) {
    setWorking(doctorId)
    await assignDoctorToClinic(doctorId, clinicId)
    setPool(prev => prev.filter(d => d.id !== doctorId))
    setWorking(null)
    onDone()
  }

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true); setNewError('')
    const result = await createClinicDoctor(hospitalId, clinicId, {
      full_name: name.trim(),
      title,
      specialty_id: specId || null,
      consultation_fee: fee ? Number(fee) : null,
      accepts_virtual: virtual,
    })
    setCreating(false)
    if (!result) { setNewError('Failed to create doctor. Please try again.'); return }
    onDone()
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{ width: '100%', maxWidth: 520, background: C.card,
        border: `1px solid ${C.borderMed}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Add Doctor</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
              Assign existing or create a new doctor for this clinic
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: C.bgAlt,
              border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
          {(['assign', 'new'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '12px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: tab === t ? C.card : C.bgAlt,
                color: tab === t ? col.text : C.textMuted,
                borderBottom: tab === t ? `2px solid ${col.text}` : '2px solid transparent' }}>
              {t === 'assign' ? 'Assign Existing' : 'Add New Doctor'}
            </button>
          ))}
        </div>

        <div style={{ padding: 20, maxHeight: '55vh', overflowY: 'auto' }}>
          {tab === 'assign' ? (
            loading ? (
              <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>
                Loading available doctors…
              </div>
            ) : pool.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>
                No unassigned doctors in this hospital.<br />
                <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Use "Add New Doctor" to create one, or add doctors via the Doctors page.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pool.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                    background: C.bgAlt, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: doc.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                      {doc.avatar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {doc.title ? `${doc.title} ` : ''}{doc.full_name}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSub }}>
                        {doc.specialty_name ?? 'General'}
                        {doc.consultation_fee ? ` · ₦${doc.consultation_fee.toLocaleString()}` : ''}
                      </div>
                    </div>
                    <button onClick={() => handleAssign(doc.id)}
                      disabled={working === doc.id}
                      style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                        background: col.bg, color: col.text,
                        opacity: working === doc.id ? 0.6 : 1 }}>
                      {working === doc.id ? '…' : 'Assign'}
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 80 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Title</label>
                  <select value={title} onChange={e => setTitle(e.target.value)} style={{ ...inputStyle, padding: '10px 8px' }}>
                    {['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Pharm.', 'Nurse'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Full Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Emeka Okonkwo" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Specialty</label>
                <select value={specId} onChange={e => { setSpecId(e.target.value); setSpec(e.target.options[e.target.selectedIndex].text) }}
                  style={inputStyle}>
                  <option value="">— Select specialty —</option>
                  {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Consultation Fee (₦)</label>
                <input type="number" value={fee} onChange={e => setFee(e.target.value)}
                  placeholder="e.g. 5000" style={inputStyle} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: C.textSub }}>
                <input type="checkbox" checked={virtual} onChange={e => setVirtual(e.target.checked)} />
                Accepts virtual consultations
              </label>
              {newError && (
                <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
                  borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070' }}>
                  ⚠️ {newError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                    background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                    color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={creating || !name.trim()}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, fontFamily: 'inherit',
                    background: name.trim() ? col.text : C.bgAlt,
                    color: name.trim() ? '#061208' : C.textMuted,
                    border: 'none', fontSize: 13, fontWeight: 700,
                    cursor: creating || !name.trim() ? 'not-allowed' : 'pointer',
                    opacity: creating ? 0.7 : 1 }}>
                  {creating ? 'Adding…' : 'Add Doctor'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Staff Modal ───────────────────────────────────────────────────────────

function AddStaffModal({
  clinicId, hospitalId, col, existingSubAdmin,
  onClose, onDone,
}: { clinicId: string; hospitalId: string; col: typeof CLINIC_PALETTE[0]; existingSubAdmin: boolean; onClose: () => void; onDone: () => void }) {
  const { theme: C } = useTheme()
  const [role, setRole]       = useState<'desk_officer' | 'clinic_admin'>('desk_officer')
  const [staffName, setName]  = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState(generatePassword)
  const [showPass, setShowPass] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [copied, setCopied]   = useState(false)

  async function handleCreate() {
    if (!staffName.trim() || !email.trim()) return
    setLoading(true); setError('')
    const res = await fetch('/api/clinic-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId, hospitalId, staffName, staffEmail: email, tempPassword: password, role }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to create account'); setLoading(false); return }
    setSuccess(true); setLoading(false); onDone()
  }

  function copyCredentials() {
    const text = `Name: ${staffName}\nRole: ${role === 'desk_officer' ? 'Front Desk Officer' : 'Sub-Admin'}\nEmail: ${email}\nPassword: ${password}\nPortal: ${window.location.origin}/login`
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  const ROLES: { key: 'desk_officer' | 'clinic_admin'; label: string; desc: string; disabled: boolean }[] = [
    { key: 'desk_officer',  label: 'Front Desk Officer', desc: 'Manages check-ins & queue',          disabled: false             },
    { key: 'clinic_admin',  label: 'Sub-Admin',          desc: 'Full clinic management access',      disabled: existingSubAdmin  },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{ width: '100%', maxWidth: 480, background: C.card,
        border: `1px solid ${C.borderMed}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Add Staff Member</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
              Create a login account for this clinic&apos;s staff
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: C.bgAlt,
              border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>
          {!success ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Role selector */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
                  textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Role</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ROLES.map(r => (
                    <button key={r.key} onClick={() => !r.disabled && setRole(r.key)}
                      disabled={r.disabled}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 10, cursor: r.disabled ? 'not-allowed' : 'pointer',
                        border: `1px solid ${role === r.key ? col.text : C.border}`,
                        background: role === r.key ? col.bg : C.bgAlt,
                        textAlign: 'left', fontFamily: 'inherit',
                        opacity: r.disabled ? 0.45 : 1, transition: 'all .15s' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: role === r.key ? col.text : C.text }}>
                        {r.label}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{r.desc}</div>
                      {r.disabled && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>(Already assigned)</div>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Full Name *</label>
                <input value={staffName} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Chioma Eze" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="staff@yourhospital.ng" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Temporary Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 88 }} />
                  <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: C.textSub, cursor: 'pointer' }}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" onClick={() => setPassword(generatePassword())}
                      style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: C.textSub, cursor: 'pointer' }}>
                      ↻
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
                  borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070' }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                    background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                    color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={handleCreate}
                  disabled={loading || !staffName.trim() || !email.trim()}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, fontFamily: 'inherit',
                    background: staffName.trim() && email.trim() ? col.text : C.bgAlt,
                    color: staffName.trim() && email.trim() ? '#061208' : C.textMuted,
                    border: 'none', fontSize: 13, fontWeight: 700,
                    cursor: loading || !staffName.trim() || !email.trim() ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 44 }}>{role === 'desk_officer' ? '🖥️' : '👤'}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Account created!</div>
              <div style={{ background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                borderRadius: 12, padding: 16, textAlign: 'left' }}>
                {[
                  { label: 'Name', value: staffName },
                  { label: 'Role', value: role === 'desk_officer' ? 'Front Desk Officer' : 'Sub-Admin' },
                  { label: 'Email', value: email },
                  { label: 'Password', value: password },
                  { label: 'Portal', value: `${typeof window !== 'undefined' ? window.location.origin : ''}/login` },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, width: 64, flexShrink: 0 }}>{r.label}</span>
                    <span style={{ fontSize: 12, color: C.text, wordBreak: 'break-all' }}>{r.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={copyCredentials}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                    background: copied ? col.bg : C.bgAlt,
                    border: `1px solid ${copied ? col.text : C.borderMed}`,
                    color: copied ? col.text : C.textSub,
                    fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  {copied ? '✓ Copied!' : 'Copy Credentials'}
                </button>
                <button onClick={onClose}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                    background: col.text, border: 'none',
                    color: '#061208', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClinicDetailPage() {
  const { clinicId } = useParams() as { clinicId: string }
  const { theme: C } = useTheme()
  const { hospital } = useAdmin()
  const router = useRouter()

  const col = clinicColor(clinicId)

  const [clinic,   setClinic]   = useState<ClinicDetail | null>(null)
  const [doctors,  setDoctors]  = useState<AdminDoctor[]>([])
  const [staff,    setStaff]    = useState<ClinicStaffMember[]>([])
  const [appts,    setAppts]    = useState<AdminAppointment[]>([])
  const [stats,    setStats]    = useState({ total: 0, completed: 0, cancelled: 0, pending: 0 })
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<Tab>('overview')

  const [range,  setRange]  = useState<DateRangeKey>('this_week')
  const [bounds, setBounds] = useState<DateBounds>(getDateBounds('this_week'))

  const [showAssign,      setShowAssign]      = useState(false)
  const [showAddStaff,    setShowAddStaff]    = useState(false)
  const [showEdit,        setShowEdit]        = useState(false)
  const [confirmDelete,   setConfirmDelete]   = useState(false)
  const [deleting,        setDeleting]        = useState(false)
  const [rejectClinicAppt, setRejectClinicAppt] = useState<AdminAppointment | null>(null)
  const [rejectNote,       setRejectNote]       = useState('')
  const [rejectSaving,     setRejectSaving]     = useState(false)

  // analytics range — separate from appointments range
  const [aRange,  setARange]  = useState<DateRangeKey>('this_month')
  const [aBounds, setABounds] = useState<DateBounds>(getDateBounds('this_month'))
  const [aStats,  setAStats]  = useState({ total: 0, completed: 0, cancelled: 0, pending: 0 })
  const [aAppts,  setAAppts]  = useState<AdminAppointment[]>([])

  const load = useCallback(async () => {
    if (!clinicId || !hospital?.id) return
    setLoading(true)
    const [c, d, s, a, st] = await Promise.all([
      getClinicDetail(clinicId),
      getClinicDoctors(clinicId),
      getClinicStaff(clinicId),
      getClinicAppointments(hospital.id, clinicId, bounds.from, bounds.to),
      getClinicRangeStats(hospital.id, clinicId, bounds.from, bounds.to),
    ])
    setClinic(c)
    setDoctors(d)
    setStaff(s)
    setAppts(a)
    setStats(st)
    setLoading(false)
  }, [clinicId, hospital?.id, bounds])

  useEffect(() => { load() }, [load])

  // load analytics data whenever analytics bounds change
  useEffect(() => {
    if (!clinicId || !hospital?.id || tab !== 'analytics') return
    async function loadAnalytics() {
      const [s, a] = await Promise.all([
        getClinicRangeStats(hospital!.id, clinicId, aBounds.from, aBounds.to),
        getClinicAppointments(hospital!.id, clinicId, aBounds.from, aBounds.to),
      ])
      setAStats(s); setAAppts(a)
    }
    loadAnalytics()
  }, [clinicId, hospital?.id, tab, aBounds])

  async function handleToggleActive() {
    if (!clinic) return
    const next = !clinic.is_active
    await toggleClinicActive(clinicId, next)
    setClinic(prev => prev ? { ...prev, is_active: next } : prev)
  }

  async function handleDelete() {
    setDeleting(true)
    const { error } = await deleteClinic(clinicId)
    setDeleting(false)
    if (!error) router.push('/dashboard/clinics')
  }

  const subAdmin     = staff.find(s => s.role === 'clinic_admin')
  const deskOfficers = staff.filter(s => s.role === 'desk_officer' || s.role === 'front_desk')
  const todayAppts   = appts.filter(a => a.appointment_date === new Date().toISOString().split('T')[0])

  // analytics — specialty breakdown from aAppts
  const specCounts: Record<string, number> = {}
  aAppts.forEach(a => { const n = a.specialty_name ?? 'General'; specCounts[n] = (specCounts[n] ?? 0) + 1 })
  const specBreakdown = Object.entries(specCounts)
    .sort((x, y) => y[1] - x[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count, pct: aAppts.length > 0 ? Math.round(count / aAppts.length * 100) : 0 }))

  const showupRate = aStats.total > 0 ? Math.round(aStats.completed / aStats.total * 100) : 0

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview',     label: 'Overview'                           },
    { key: 'doctors',      label: 'Doctors',     count: doctors.length },
    { key: 'staff',        label: 'Staff',        count: staff.length  },
    { key: 'appointments', label: 'Appointments', count: appts.length  },
    { key: 'analytics',   label: 'Analytics'                          },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Back + breadcrumb */}
      <button onClick={() => router.push('/dashboard/clinics')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18,
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.textMuted, fontSize: 13, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
        ← Clinics
      </button>

      {/* Clinic header */}
      <div style={{ background: C.card, border: `1px solid ${clinic && !clinic.is_active ? 'rgba(220,60,60,0.25)' : C.border}`,
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: col.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 800, color: col.text, flexShrink: 0 }}>
          {clinic ? initials(clinic.name) : '…'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>
              {loading ? 'Loading…' : clinic?.name ?? 'Clinic'}
            </div>
            {clinic && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 99,
                background: clinic.is_active ? 'rgba(0,232,122,0.12)' : 'rgba(220,60,60,0.1)',
                color: clinic.is_active ? '#00E87A' : '#f07070',
                border: `1px solid ${clinic.is_active ? 'rgba(0,232,122,0.25)' : 'rgba(220,60,60,0.3)'}` }}>
                {clinic.is_active ? 'Active' : 'Inactive'}
              </span>
            )}
            {clinic && (
              <button onClick={() => setShowEdit(true)}
                title="Edit clinic name & description"
                style={{ width: 26, height: 26, borderRadius: 7, background: C.bgAlt,
                  border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer',
                  fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0 }}>
                ✏️
              </button>
            )}
          </div>
          {clinic?.description && (
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>{clinic.description}</div>
          )}
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            {hospital?.name} · {clinic?.created_at
              ? `Created ${new Date(clinic.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : ''}
          </div>
        </div>
        {/* Stat pills + admin actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { icon: '👨‍⚕️', value: doctors.length, label: 'Doctors' },
              { icon: '👥', value: staff.length,   label: 'Staff'   },
              { icon: '📅', value: appts.length,   label: range === 'today' ? 'Today' : 'Period' },
            ].map(s => (
              <div key={s.label} style={{ background: C.bgAlt, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '8px 14px', textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: col.text }}>{loading ? '…' : s.value}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
          {clinic && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleToggleActive}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: clinic.is_active ? 'rgba(239,159,39,0.12)' : 'rgba(0,232,122,0.12)',
                  border: `1px solid ${clinic.is_active ? 'rgba(239,159,39,0.3)' : 'rgba(0,232,122,0.3)'}`,
                  color: clinic.is_active ? '#EF9F27' : '#00E87A' }}>
                {clinic.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
              <button onClick={() => setConfirmDelete(true)}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.25)',
                  color: '#f07070' }}>
                Delete Clinic
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.bgAlt,
        border: `1px solid ${C.border}`, borderRadius: 12, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 9, fontSize: 13,
              fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: tab === t.key ? C.card : 'transparent',
              color: tab === t.key ? col.text : C.textSub,
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
              transition: 'all .15s' }}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: col.bg,
                color: col.text, padding: '1px 7px', borderRadius: 99 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { icon: '📅', label: "Today's Appts",  value: loading ? '…' : todayAppts.length.toString(), sub: `${todayAppts.filter(a => a.status === 'completed').length} completed` },
              { icon: '✔',  label: 'Completed',       value: loading ? '…' : stats.completed.toString(),   sub: 'Total period' },
              { icon: '👨‍⚕️', label: 'Doctors',         value: loading ? '…' : doctors.length.toString(),   sub: 'Assigned to clinic' },
              { icon: '👥', label: 'Staff',            value: loading ? '…' : staff.length.toString(),     sub: `${deskOfficers.length} desk · ${subAdmin ? '1' : '0'} admin` },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: col.text }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            {/* Today's queue */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Today&apos;s Queue</div>
                <button onClick={() => setTab('appointments')}
                  style={{ fontSize: 12, color: col.text, background: 'none', border: 'none',
                    cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                  View all →
                </button>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
                ) : todayAppts.length === 0 ? (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                    No appointments today
                  </div>
                ) : todayAppts.slice(0, 8).map((a, i) => (
                  <div key={a.id} style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: i % 2 === 1 ? C.rowAlt : C.card }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, width: 40, flexShrink: 0 }}>
                      {a.start_time}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.patient_name}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSub }}>{a.doctor_name}</div>
                    </div>
                    <Badge status={a.status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Staff sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Sub-admin */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sub-Admin</div>
                  {!subAdmin && (
                    <button onClick={() => setShowAddStaff(true)}
                      style={{ fontSize: 11, color: col.text, background: 'none', border: 'none',
                        cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                      + Assign
                    </button>
                  )}
                </div>
                <div style={{ padding: '12px 16px' }}>
                  {subAdmin ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: col.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: col.text, flexShrink: 0 }}>
                        {initials(subAdmin.full_name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {subAdmin.full_name}
                        </div>
                        <div style={{ fontSize: 11, color: C.textSub,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {subAdmin.email}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
                      No sub-admin assigned
                    </div>
                  )}
                </div>
              </div>

              {/* Front desk */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Front Desk</div>
                  <button onClick={() => setShowAddStaff(true)}
                    style={{ fontSize: 11, color: col.text, background: 'none', border: 'none',
                      cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                    + Add
                  </button>
                </div>
                {deskOfficers.length === 0 ? (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
                    No front desk officers yet
                  </div>
                ) : deskOfficers.slice(0, 3).map(s => (
                  <div key={s.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: col.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: col.text, flexShrink: 0 }}>
                      {initials(s.full_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.full_name}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>Front Desk</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Services offered */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Services Offered</div>
                  <button onClick={() => setShowEdit(true)}
                    style={{ fontSize: 11, color: col.text, background: 'none', border: 'none',
                      cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                    Edit
                  </button>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  {(clinic?.service_tags ?? []).length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
                      No services configured — click Edit to add.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(clinic?.service_tags ?? []).map(tag => (
                        <span key={tag} style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                          background: C.accentLight, color: C.accent, border: `1px solid ${C.accentBorder}`,
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Doctors Tab ──────────────────────────────────────────────────── */}
      {tab === 'doctors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              {doctors.length} Doctor{doctors.length !== 1 ? 's' : ''} · {clinic?.name}
            </div>
            <button onClick={() => setShowAssign(true)}
              style={{ background: col.text, color: '#061208', border: 'none',
                borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
              + Add Doctor
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 13 }}>Loading…</div>
          ) : doctors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 40px',
              border: `2px dashed ${C.borderMed}`, borderRadius: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍⚕️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.textSub, marginBottom: 8 }}>
                No doctors yet
              </div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
                Assign existing hospital doctors or add new ones directly to this clinic.
              </div>
              <button onClick={() => setShowAssign(true)}
                style={{ background: col.text, color: '#061208', border: 'none',
                  borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add Doctor
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
              {doctors.map(doc => (
                <div key={doc.id} style={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: doc.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                      {doc.avatar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title ? `${doc.title} ` : ''}{doc.full_name}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSub }}>{doc.specialty_name ?? 'General'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {doc.avg_rating && (
                      <span style={{ fontSize: 11, background: C.bgAlt, border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '3px 10px', color: C.textSub }}>
                        ★ {doc.avg_rating.toFixed(1)}
                      </span>
                    )}
                    {doc.consultation_fee && (
                      <span style={{ fontSize: 11, background: C.bgAlt, border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '3px 10px', color: C.textSub }}>
                        ₦{doc.consultation_fee.toLocaleString()}
                      </span>
                    )}
                    {doc.accepts_virtual && (
                      <span style={{ fontSize: 11, background: C.blueLight, border: 'none',
                        borderRadius: 8, padding: '3px 10px', color: C.blue }}>
                        💻 Virtual
                      </span>
                    )}
                  </div>
                  <button onClick={async () => {
                    await removeDoctorFromClinic(doc.id)
                    setDoctors(prev => prev.filter(d => d.id !== doc.id))
                  }}
                    style={{ width: '100%', padding: '7px', borderRadius: 8, cursor: 'pointer',
                      background: 'transparent', border: `1px solid ${C.border}`,
                      color: C.textMuted, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                      transition: 'all .15s' }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,60,60,0.3)'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#f07070'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = C.border
                      ;(e.currentTarget as HTMLButtonElement).style.color = C.textMuted
                    }}>
                    Remove from Clinic
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Staff Tab ────────────────────────────────────────────────────── */}
      {tab === 'staff' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              {staff.length} Staff Member{staff.length !== 1 ? 's' : ''} · {clinic?.name}
            </div>
            <button onClick={() => setShowAddStaff(true)}
              style={{ background: col.text, color: '#061208', border: 'none',
                borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add Staff Member
            </button>
          </div>

          {/* Sub-admin section */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Sub-Admin · Clinic Management Access
            </div>
            {subAdmin ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: col.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: col.text, flexShrink: 0 }}>
                  {initials(subAdmin.full_name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{subAdmin.full_name}</div>
                  <div style={{ fontSize: 12, color: C.textSub }}>{subAdmin.email}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                    Added {subAdmin.created_at
                      ? new Date(subAdmin.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                  background: col.bg, color: col.text }}>Sub-Admin</span>
              </div>
            ) : (
              <div style={{ background: C.card, border: `2px dashed ${C.borderMed}`,
                borderRadius: 14, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
                  No sub-admin assigned to this clinic yet
                </div>
                <button onClick={() => setShowAddStaff(true)}
                  style={{ background: col.bg, color: col.text, border: 'none',
                    borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                  Assign Sub-Admin
                </button>
              </div>
            )}
          </div>

          {/* Front desk officers */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Front Desk Officers · Queue & Check-in Management
            </div>
            {deskOfficers.length === 0 ? (
              <div style={{ background: C.card, border: `2px dashed ${C.borderMed}`,
                borderRadius: 14, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
                  No front desk officers yet
                </div>
                <button onClick={() => setShowAddStaff(true)}
                  style={{ background: col.bg, color: col.text, border: 'none',
                    borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                  Add Front Desk Officer
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
                {deskOfficers.map(s => (
                  <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: '16px 18px',
                    display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: col.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: col.text, flexShrink: 0 }}>
                      {initials(s.full_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.full_name}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSub,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.email}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                        Since {s.created_at
                          ? new Date(s.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
                          : '—'}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: C.bgAlt, color: C.textMuted, border: `1px solid ${C.border}`,
                      flexShrink: 0 }}>Desk</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Appointments Tab ──────────────────────────────────────────── */}
      {tab === 'appointments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              {appts.length} Appointment{appts.length !== 1 ? 's' : ''} · {clinic?.name}
            </div>
            <button onClick={load}
              style={{ background: col.bg, color: col.text, border: `1px solid ${col.bg.replace('0.14','0.3')}`,
                borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit' }}>
              ↻ Refresh
            </button>
          </div>

          {/* Date filter */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
            <DateFilter value={range} onChange={(key, b) => { setRange(key); setBounds(b) }} label="Period" />
          </div>

          {/* Pending approvals banner */}
          {(() => {
            const pending = appts.filter(a => a.approval_status === 'pending_approval')
            return pending.length > 0 ? (
              <div style={{ background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)',
                borderRadius: 12, padding: '10px 16px', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>⏳</span>
                <span style={{ fontSize: 13, color: '#EF9F27', fontWeight: 700 }}>
                  {pending.length} booking{pending.length !== 1 ? 's' : ''} awaiting your review
                </span>
              </div>
            ) : null
          })()}

          {/* Table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.bgAlt }}>
                  {['Date','ID','Patient','Reason / Note','Doctor','Status','Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: C.textMuted, letterSpacing: '.06em',
                      textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                    Loading appointments…
                  </td></tr>
                ) : appts.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                    No appointments for this period.
                  </td></tr>
                ) : appts.map((a, i) => {
                  const needsApproval = a.approval_status === 'pending_approval'
                  return (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}`,
                      background: needsApproval
                        ? 'rgba(239,159,39,0.04)'
                        : i % 2 === 0 ? C.card : C.rowAlt,
                      outline: needsApproval ? '1px solid rgba(239,159,39,0.15)' : 'none' }}>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: C.textSub, whiteSpace: 'nowrap' }}>
                        <div>{new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</div>
                        <div style={{ fontSize: 10, color: C.textMuted }}>{a.start_time}</div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>
                        {a.booking_ref}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.patient_name}</div>
                        <div style={{ fontSize: 11, color: C.textSub }}>
                          {a.patient_age ? `${a.patient_age}y` : ''}{a.patient_gender ? ` · ${a.patient_gender}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', maxWidth: 200 }}>
                        <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.reason ?? '—'}
                        </div>
                        {a.symptom_description && (
                          <div style={{ fontSize: 11, color: '#EF9F27', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={a.symptom_description}>
                            📋 {a.symptom_description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                          {a.assigned_doctor_name ?? a.doctor_name}
                        </div>
                        <div style={{ fontSize: 11, color: C.textSub }}>{a.specialty_name ?? 'General'}</div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <Badge status={a.status} />
                        {needsApproval && (
                          <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700,
                            color: '#EF9F27', background: 'rgba(239,159,39,0.1)',
                            borderRadius: 6, padding: '2px 6px', display: 'inline-block' }}>
                            AWAITING REVIEW
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {/* Approve */}
                          {needsApproval && (
                            <button onClick={async () => {
                              await approveAppointment(a.id)
                              setAppts(prev => prev.map(x => x.id === a.id
                                ? { ...x, approval_status: 'auto_approved', status: 'confirmed' } : x))
                            }}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                                border: '1px solid rgba(0,232,122,0.3)', background: 'rgba(0,232,122,0.1)',
                                color: '#00E87A', fontWeight: 700 }}>
                              Approve
                            </button>
                          )}
                          {/* Reject */}
                          {needsApproval && (
                            <button onClick={() => { setRejectClinicAppt(a); setRejectNote('') }}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                                border: '1px solid rgba(220,60,60,0.3)', background: 'rgba(220,60,60,0.08)',
                                color: '#f07070', fontWeight: 700 }}>
                              Reject
                            </button>
                          )}
                          {/* Check In */}
                          {!needsApproval && !['cancelled','completed','no_show'].includes(a.status) && (
                            <button onClick={async () => {
                              await updateAppointmentStatus(a.id, 'checked_in')
                              setAppts(prev => prev.map(x => x.id === a.id ? { ...x, status: 'checked_in' } : x))
                            }}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7,
                                border: `1px solid ${col.bg.replace('0.14','0.3')}`,
                                background: col.bg, color: col.text, cursor: 'pointer', fontWeight: 600 }}>
                              Check In
                            </button>
                          )}
                          {/* Complete */}
                          {['checked_in','in_progress'].includes(a.status) && (
                            <button onClick={async () => {
                              await updateAppointmentStatus(a.id, 'completed')
                              setAppts(prev => prev.map(x => x.id === a.id ? { ...x, status: 'completed' } : x))
                            }}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7,
                                border: `1px solid ${C.border}`, background: C.card,
                                color: C.textSub, cursor: 'pointer', fontWeight: 600 }}>
                              Complete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Reject modal for clinic sub-admin */}
          {rejectClinicAppt && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
              onClick={e => { if (e.target === e.currentTarget) setRejectClinicAppt(null) }}>
              <div style={{ width: '100%', maxWidth: 420, background: C.card,
                border: '1px solid rgba(220,60,60,0.25)', borderRadius: 20,
                boxShadow: '0 24px 64px rgba(0,0,0,0.4)', padding: '24px 28px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>
                  Reject Booking
                </div>
                <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>
                  Patient <strong style={{ color: C.text }}>{rejectClinicAppt.patient_name}</strong> will be notified with a full refund.
                </div>
                <textarea
                  value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                  placeholder="Reason for rejection (required)…" rows={3}
                  style={{ width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text,
                    outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' as const }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button onClick={() => setRejectClinicAppt(null)}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                      background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                      color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!rejectNote.trim()) return
                      setRejectSaving(true)
                      await rejectAppointment(rejectClinicAppt.id, rejectNote.trim())
                      setAppts(prev => prev.map(x => x.id === rejectClinicAppt.id
                        ? { ...x, approval_status: 'rejected', status: 'cancelled' } : x))
                      setRejectSaving(false)
                      setRejectClinicAppt(null)
                    }}
                    disabled={rejectSaving || !rejectNote.trim()}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, fontFamily: 'inherit',
                      background: rejectNote.trim() ? 'rgba(220,60,60,0.15)' : C.bgAlt,
                      border: rejectNote.trim() ? '1px solid rgba(220,60,60,0.3)' : `1px solid ${C.border}`,
                      color: rejectNote.trim() ? '#f07070' : C.textMuted,
                      fontSize: 13, fontWeight: 700,
                      cursor: !rejectNote.trim() || rejectSaving ? 'not-allowed' : 'pointer',
                      opacity: rejectSaving ? 0.7 : 1 }}>
                    {rejectSaving ? 'Rejecting…' : 'Reject & Refund'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Analytics Tab ────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div>
          {/* Date filter */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <DateFilter value={aRange} onChange={(key, b) => { setARange(key); setABounds(b) }} label="Period" />
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { icon: '📅', label: 'Total',        value: aStats.total,                       sub: 'appointments' },
              { icon: '✔',  label: 'Completed',    value: aStats.completed,                   sub: `${showupRate}% show-up rate` },
              { icon: '✕',  label: 'Cancelled',    value: aStats.cancelled,                   sub: 'this period' },
              { icon: '⏳', label: 'Pending',      value: aStats.pending,                     sub: 'upcoming' },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: col.text }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
            {/* Top Specialties */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Top Specialties</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Appointment volume by specialty</div>
              </div>
              <div style={{ padding: 20 }}>
                {specBreakdown.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: C.textMuted, fontSize: 13 }}>
                    No data for this period
                  </div>
                ) : specBreakdown.map((s, i) => (
                  <div key={s.name} style={{ marginBottom: i < specBreakdown.length - 1 ? 16 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</span>
                      <span style={{ fontSize: 12, color: C.textSub }}>{s.count} · {s.pct}%</span>
                    </div>
                    <div style={{ height: 6, background: C.bgAlt, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s.pct}%`, background: col.text,
                        borderRadius: 99, transition: 'width .4s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visit Type Split */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Visit Type</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>In-person vs Virtual</div>
              </div>
              <div style={{ padding: 20 }}>
                {(() => {
                  const virtual  = aAppts.filter(a => a.type === 'virtual').length
                  const inPerson = aAppts.filter(a => a.type !== 'virtual').length
                  const total    = aAppts.length
                  const virtPct  = total > 0 ? Math.round(virtual / total * 100) : 0
                  const inPct    = total > 0 ? Math.round(inPerson / total * 100) : 0
                  return total === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: C.textMuted, fontSize: 13 }}>
                      No data for this period
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {[
                        { label: 'In-person', icon: '🏥', count: inPerson,  pct: inPct,  color: col.text,  bg: col.bg },
                        { label: 'Virtual',   icon: '💻', count: virtual,   pct: virtPct, color: '#55A7EB', bg: 'rgba(85,167,235,0.12)' },
                      ].map(t => (
                        <div key={t.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                              {t.icon} {t.label}
                            </span>
                            <span style={{ fontSize: 12, color: C.textSub }}>{t.count} · {t.pct}%</span>
                          </div>
                          <div style={{ height: 8, background: C.bgAlt, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${t.pct}%`, background: t.color,
                              borderRadius: 99, transition: 'width .4s ease' }} />
                          </div>
                        </div>
                      ))}
                      <div style={{ paddingTop: 12, borderTop: `1px solid ${C.border}`,
                        display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: C.textMuted }}>Total appointments</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{total}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showAssign && hospital?.id && (
        <AssignDoctorModal
          clinicId={clinicId}
          hospitalId={hospital.id}
          col={col}
          onClose={() => setShowAssign(false)}
          onDone={() => { load(); setShowAssign(false) }}
        />
      )}
      {showAddStaff && hospital?.id && (
        <AddStaffModal
          clinicId={clinicId}
          hospitalId={hospital.id}
          col={col}
          existingSubAdmin={!!subAdmin}
          onClose={() => setShowAddStaff(false)}
          onDone={() => load()}
        />
      )}

      {/* Edit clinic modal */}
      {showEdit && clinic && (
        <EditClinicModal
          clinic={clinic}
          col={col}
          onClose={() => setShowEdit(false)}
          onSave={(name, description, serviceTags) => {
            setClinic(prev => prev ? { ...prev, name, description: description ?? null, service_tags: serviceTags } : prev)
            setShowEdit(false)
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && clinic && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: C.card,
            border: '1px solid rgba(220,60,60,0.3)', borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: '28px 28px 24px' }}>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, textAlign: 'center', marginBottom: 10 }}>
              Delete &quot;{clinic.name}&quot;?
            </div>
            <div style={{ fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 1.6, marginBottom: 8 }}>
              This will permanently delete this clinic and remove all associated staff assignments.
              Doctors will be unlinked but their records will remain.
            </div>
            <div style={{ fontSize: 12, color: '#f07070', textAlign: 'center',
              background: 'rgba(220,60,60,0.08)', borderRadius: 10, padding: '10px 14px',
              marginBottom: 22, border: '1px solid rgba(220,60,60,0.2)' }}>
              This action cannot be undone. Only hospital super admins can perform this action.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                  background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                  color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  opacity: deleting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: deleting ? 'not-allowed' : 'pointer',
                  background: 'rgba(220,60,60,0.15)', border: '1px solid rgba(220,60,60,0.3)',
                  color: '#f07070', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete Clinic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
