'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import type { ClinicWithAdmin } from '@/lib/admin-api'
import { toggleClinicActive, deleteClinic } from '@/lib/admin-api'
import { ServiceTagPicker } from '@/components/dashboard/ServiceTagPicker'

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLINIC_PALETTE = [
  { bg: 'rgba(0,232,122,0.14)',   text: '#00E87A' },
  { bg: 'rgba(85,167,235,0.14)',  text: '#55A7EB' },
  { bg: 'rgba(180,156,240,0.14)', text: '#B49CF0' },
  { bg: 'rgba(239,159,39,0.14)',  text: '#EF9F27' },
  { bg: 'rgba(240,112,112,0.14)', text: '#F07070' },
  { bg: 'rgba(86,220,180,0.14)',  text: '#56DCB4' },
]

function clinicColor(idx: number) { return CLINIC_PALETTE[idx % CLINIC_PALETTE.length] }

function clinicInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let p = 'Queue@'
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p + '!'
}

// ── Clinic Card ───────────────────────────────────────────────────────────────

function ClinicCard({ clinic, idx, onManage, onToggleActive, onDelete }: {
  clinic: ClinicWithAdmin; idx: number
  onManage: () => void
  onToggleActive: (id: string, active: boolean) => void
  onDelete: (id: string, name: string) => void
}) {
  const { theme: C } = useTheme()
  const col = clinicColor(idx)
  const initials = clinicInitials(clinic.name)
  const createdDate = clinic.created_at
    ? new Date(clinic.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div style={{ background: C.card, border: `1px solid ${clinic.is_active ? C.border : 'rgba(220,60,60,0.2)'}`, borderRadius: 16,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 16, transition: 'border-color .2s',
      opacity: clinic.is_active ? 1 : 0.75 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: col.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: col.text, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {clinic.name}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: clinic.is_active ? 'rgba(0,232,122,0.12)' : C.borderMed,
              color: clinic.is_active ? '#00E87A' : C.textMuted,
              border: `1px solid ${clinic.is_active ? 'rgba(0,232,122,0.25)' : C.border}` }}>
              {clinic.is_active ? 'Active' : 'Inactive'}
            </span>
            {clinic.is_emergency && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: 'rgba(220,60,60,0.12)', color: '#f07070',
                border: '1px solid rgba(220,60,60,0.3)' }}>
                🚨 Emergency Dept
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>Created {createdDate}</div>
        </div>
      </div>

      {/* Sub-admin */}
      <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted,
          textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Sub-Admin</div>
        {clinic.subAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: col.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: col.text, flexShrink: 0 }}>
              {clinic.subAdmin.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {clinic.subAdmin.full_name}
              </div>
              <div style={{ fontSize: 11, color: C.textSub,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {clinic.subAdmin.email}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8,
              border: `1.5px dashed ${C.borderMed}`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 14 }}>
              +
            </div>
            <span style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>No admin assigned yet</span>
          </div>
        )}
      </div>

      {/* Service tags */}
      {clinic.service_tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {clinic.service_tags.slice(0, 5).map(tag => (
            <span key={tag} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: C.accentLight, color: C.accent, border: `1px solid ${C.accentBorder}`,
            }}>
              {tag}
            </span>
          ))}
          {clinic.service_tags.length > 5 && (
            <span style={{ fontSize: 10, color: C.textMuted, padding: '2px 4px' }}>
              +{clinic.service_tags.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: C.bgAlt, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: col.text }}>{clinic.doctorCount}</div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>Doctors</div>
        </div>
      </div>

      {/* Actions */}
      <button onClick={onManage}
        style={{ width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
          background: col.bg, color: col.text,
          border: `1px solid ${col.bg.replace('0.14', '0.3')}`,
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          transition: 'opacity .15s' }}>
        Manage Clinic →
      </button>

      {/* Admin controls — hospital super admin only */}
      <div style={{ display: 'flex', gap: 8, marginTop: -8 }}>
        <button onClick={() => onToggleActive(clinic.id, !clinic.is_active)}
          style={{ flex: 1, padding: '7px', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            background: 'transparent',
            border: `1px solid ${clinic.is_active ? C.border : 'rgba(0,232,122,0.3)'}`,
            color: clinic.is_active ? C.textMuted : '#00E87A',
            transition: 'all .15s' }}>
          {clinic.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
        <button onClick={() => onDelete(clinic.id, clinic.name)}
          style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            background: 'transparent', border: '1px solid rgba(220,60,60,0.25)',
            color: '#f07070', transition: 'all .15s' }}>
          Delete
        </button>
      </div>
    </div>
  )
}

// ── Create Clinic Modal ───────────────────────────────────────────────────────

interface CreateModalProps {
  hospitalId: string
  onClose: () => void
  onCreated: () => void
}

function CreateClinicModal({ hospitalId, onClose, onCreated }: CreateModalProps) {
  const { theme: C } = useTheme()
  const [clinicName,   setClinicName]   = useState('')
  const [serviceTags,  setServiceTags]  = useState<string[]>([])
  const [adminName,    setAdminName]    = useState('')
  const [adminEmail,   setAdminEmail]   = useState('')
  const [password,     setPassword]     = useState(generatePassword)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [showPass,     setShowPass]     = useState(true)
  const skipAdmin = !adminEmail.trim() && !adminName.trim()

  async function handleCreate() {
    if (!clinicName.trim()) return
    setLoading(true); setError('')
    const res = await fetch('/api/clinics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalId, clinicName, serviceTags,
        subAdminName: adminName || null,
        subAdminEmail: adminEmail || null,
        tempPassword: adminEmail ? password : null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to create clinic'); setLoading(false); return }
    setSuccess(true); setLoading(false)
  }

  function copyCredentials() {
    const text = `Clinic: ${clinicName}\nEmail: ${adminEmail}\nPassword: ${password}\nPortal: ${window.location.origin}/login`
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{ width: '100%', maxWidth: 480, background: C.card,
        border: `1px solid ${C.borderMed}`, borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

        {/* Modal header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>New Clinic</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
              Set up a clinic and assign a sub-admin
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 8, background: C.bgAlt,
              border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>
          {!success ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Clinic name */}
              <div>
                <label style={labelStyle}>Clinic / Department Name *</label>
                <input value={clinicName} onChange={e => setClinicName(e.target.value)}
                  placeholder="e.g. OPD Clinic, General Surgery, Cardiology…"
                  style={inputStyle} />
              </div>

              {/* Services */}
              <div>
                <label style={labelStyle}>Services Offered</label>
                <ServiceTagPicker selected={serviceTags} onChange={setServiceTags} />
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                  Helps patients find this clinic when searching by service type.
                </div>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>SUB-ADMIN ACCOUNT</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: -8 }}>
                Optional — the sub-admin uses these credentials to log in and manage this clinic
              </div>

              <div>
                <label style={labelStyle}>Sub-Admin Full Name</label>
                <input value={adminName} onChange={e => setAdminName(e.target.value)}
                  placeholder="e.g. Dr. Emeka Obi" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Sub-Admin Email</label>
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                  placeholder="subadmin@yourhospital.ng" style={inputStyle} />
              </div>

              {adminEmail.trim() && (
                <div>
                  <label style={labelStyle}>Temporary Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ ...inputStyle, paddingRight: 88 }}
                    />
                    <div style={{ position: 'absolute', right: 8, top: '50%',
                      transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                      <button type="button" onClick={() => setShowPass(v => !v)}
                        style={{ background: C.bgAlt, border: `1px solid ${C.border}`,
                          borderRadius: 6, padding: '3px 8px', fontSize: 11,
                          color: C.textSub, cursor: 'pointer' }}>
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" onClick={() => setPassword(generatePassword())}
                        style={{ background: C.bgAlt, border: `1px solid ${C.border}`,
                          borderRadius: 6, padding: '3px 8px', fontSize: 11,
                          color: C.textSub, cursor: 'pointer' }}>
                        ↻
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                    Share these credentials with the sub-admin. They can change their password after first login.
                  </div>
                </div>
              )}

              {error && (
                <div style={{ background: C.redLight, border: `1px solid ${C.red}33`,
                  borderRadius: 10, padding: '10px 14px', fontSize: 12, color: C.red }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={onClose}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                    background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                    color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={loading || !clinicName.trim()}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, cursor: loading || !clinicName.trim() ? 'not-allowed' : 'pointer',
                    background: clinicName.trim() ? C.accent : C.bgAlt,
                    color: clinicName.trim() ? (C.id === 'forest' ? '#061208' : '#fff') : C.textMuted,
                    border: 'none', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Creating…' : skipAdmin ? 'Create Clinic' : 'Create Clinic & Account'}
                </button>
              </div>
            </div>
          ) : (
            /* Success state */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.3,display:"block",margin:"0 auto 4px"}}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{clinicName} created!</div>
              <div style={{ fontSize: 13, color: C.textSub }}>
                {adminEmail ? 'The sub-admin account has been set up. Share these login credentials:' : 'The clinic has been created successfully.'}
              </div>

              {adminEmail && (
                <div style={{ background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                  borderRadius: 12, padding: 16, textAlign: 'left' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: 'Clinic', value: clinicName },
                      { label: 'Login Email', value: adminEmail },
                      { label: 'Password', value: password },
                      { label: 'Portal', value: `${typeof window !== 'undefined' ? window.location.origin : ''}/login` },
                    ].map(r => (
                      <div key={r.label} style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
                          width: 70, flexShrink: 0, paddingTop: 1 }}>{r.label}</span>
                        <span style={{ fontSize: 12, color: C.text, wordBreak: 'break-all' }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                {adminEmail && (
                  <button onClick={copyCredentials}
                    style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                      background: copied ? C.accentLight : C.bgAlt,
                      border: `1px solid ${copied ? C.accentBorder : C.borderMed}`,
                      color: copied ? C.accent : C.textSub,
                      fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    {copied ? '✓ Copied!' : 'Copy Credentials'}
                  </button>
                )}
                <button onClick={() => { onCreated(); onClose() }}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                    background: C.accent, border: 'none',
                    color: C.id === 'forest' ? '#061208' : '#fff',
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
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

export default function ClinicsPage() {
  const { theme: C } = useTheme()
  const { hospital, loading: adminLoading } = useAdmin()
  const router = useRouter()
  const [clinics,  setClinics]  = useState<ClinicWithAdmin[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Redirect single-clinic hospitals away from this page
  useEffect(() => {
    if (!adminLoading && hospital && hospital.clinic_model !== 'multi') {
      router.replace('/dashboard')
    }
  }, [adminLoading, hospital, router])

  const loadClinics = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    const res = await fetch(`/api/clinics?hospitalId=${hospital.id}`)
    if (res.ok) setClinics(await res.json())
    setLoading(false)
  }, [hospital?.id])

  useEffect(() => { loadClinics() }, [loadClinics])

  async function handleToggleActive(id: string, active: boolean) {
    await toggleClinicActive(id, active)
    setClinics(prev => prev.map(c => c.id === id ? { ...c, is_active: active } : c))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await deleteClinic(deleteTarget.id)
    setDeleting(false)
    if (error) {
      setDeleteError(error)
    } else {
      setClinics(prev => prev.filter(c => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
  }

  const totalWithAdmin = clinics.filter(c => c.subAdmin).length
  const activeCount    = clinics.filter(c => c.is_active).length

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>
            Clinics & Departments
          </div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
            {hospital?.name} · {clinics.length} clinic{clinics.length !== 1 ? 's' : ''} configured
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
            border: 'none', borderRadius: 10, padding: '10px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8 }}>
          + New Clinic
        </button>
      </div>

      {/* Summary stats */}
      {clinics.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Clinics', value: clinics.length, color: C.accent },
            { label: 'Admins Assigned', value: totalWithAdmin, color: C.blue },
            { label: 'Active Clinics', value: activeCount, color: C.purple },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Clinics grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>
          Loading clinics…
        </div>
      ) : clinics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 40px',
          border: `2px dashed ${C.borderMed}`, borderRadius: 20 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.3,display:"block",margin:"0 auto 16px"}}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.textSub, marginBottom: 8 }}>
            No clinics set up yet
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
            Create your first clinic or department. Each clinic gets its own sub-admin,
            doctors, and front desk staff.
          </div>
          <button onClick={() => setShowModal(true)}
            style={{ background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
              border: 'none', borderRadius: 10, padding: '11px 24px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Create First Clinic
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 16 }}>
          {clinics.map((clinic, idx) => (
            <ClinicCard
              key={clinic.id}
              clinic={clinic}
              idx={idx}
              onManage={() => router.push(`/dashboard/clinics/${clinic.id}`)}
              onToggleActive={handleToggleActive}
              onDelete={(id, name) => setDeleteTarget({ id, name })}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && hospital?.id && (
        <CreateClinicModal
          hospitalId={hospital.id}
          onClose={() => setShowModal(false)}
          onCreated={loadClinics}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setDeleteTarget(null); setDeleteError('') } }}>
          <div style={{ width: '100%', maxWidth: 420, background: C.card,
            border: '1px solid rgba(220,60,60,0.3)', borderRadius: 20,
            padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="1.5" style={{display:"block",margin:"0 auto 14px"}}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, textAlign: 'center', marginBottom: 8 }}>
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </div>
            <div style={{ fontSize: 13, color: C.textSub, textAlign: 'center', marginBottom: 6 }}>
              This will permanently remove the clinic and all its staff accounts.
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', marginBottom: 16 }}>
              Doctors assigned to this clinic will remain in the hospital pool. This action cannot be undone.
            </div>
            {deleteError && (
              <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
                borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f07070', marginBottom: 14, textAlign: 'center' }}>
                ⚠️ {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setDeleteTarget(null); setDeleteError('') }}
                style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                  background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                  color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: deleting ? 'not-allowed' : 'pointer',
                  background: 'rgba(220,60,60,0.85)', border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, Delete Clinic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
