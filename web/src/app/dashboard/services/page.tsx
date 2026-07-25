'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Check, Stethoscope } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import {
  getAllSpecialties, getRegisteredSpecialties, addHospitalSpecialty, removeHospitalSpecialty,
  getHospitalServices, createService, updateService, toggleServiceActive, deleteService,
} from '@/lib/admin-api'
import type { SpecialtyRow, HospitalService } from '@/lib/admin-api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number | null) {
  if (n == null) return '—'
  return `₦${n.toLocaleString()}`
}

// ── Add / Edit Service Modal ──────────────────────────────────────────────────

function ServiceModal({
  hospitalId, clinicId, allSpecialties, editing, onSave, onClose, C,
}: {
  hospitalId: string
  clinicId?: string | null
  allSpecialties: SpecialtyRow[]
  editing?: HospitalService | null
  onSave: () => void
  onClose: () => void
  C: any
}) {
  const [name,         setName]         = useState(editing?.name ?? '')
  const [description,  setDescription]  = useState(editing?.description ?? '')
  const [specialtyId,  setSpecialtyId]  = useState(editing?.specialty_id ?? '')
  const [basePrice,    setBasePrice]    = useState(editing?.base_price?.toString() ?? '')
  const [virtualPrice, setVirtualPrice] = useState(editing?.virtual_price?.toString() ?? '')
  const [durationMins, setDurationMins] = useState(editing?.duration_mins?.toString() ?? '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      name:          name.trim(),
      description:   description.trim() || undefined,
      specialty_id:  specialtyId || undefined,
      base_price:    basePrice    ? Number(basePrice)    : undefined,
      virtual_price: virtualPrice ? Number(virtualPrice) : undefined,
      duration_mins: durationMins ? Number(durationMins) : undefined,
    }
    const res = editing
      ? await updateService(editing.id, payload)
      : await createService(hospitalId, payload, clinicId ?? undefined)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    onSave()
  }

  const input: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 500, background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', padding: '28px 32px' }}>

        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 20 }}>
          {editing ? 'Edit Service' : 'Add Service'}
        </div>

        {error && (
          <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f07070', marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
              Service Name *
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. General Consultation, ECG, X-Ray…"
              style={input} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
              Specialty
            </label>
            <select value={specialtyId} onChange={e => setSpecialtyId(e.target.value)}
              style={{ ...input, appearance: 'none' as any }}>
              <option value="">— No specialty —</option>
              {allSpecialties.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
              Description
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the service…" rows={2}
              style={{ ...input, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
                textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
                In-person Price (₦)
              </label>
              <input type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)}
                placeholder="0" style={input} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
                textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
                Virtual Price (₦)
              </label>
              <input type="number" value={virtualPrice} onChange={e => setVirtualPrice(e.target.value)}
                placeholder="0" style={input} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
                textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
                Duration (mins)
              </label>
              <input type="number" value={durationMins} onChange={e => setDurationMins(e.target.value)}
                placeholder="30" style={input} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
              background: C.bgAlt, border: `1px solid ${C.borderMed}`,
              color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '11px', borderRadius: 10, cursor: 'pointer',
              background: C.accent, border: 'none', fontFamily: 'inherit',
              color: '#fff', fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Service'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Specialty Modal ───────────────────────────────────────────────────────

function AddSpecialtyModal({
  hospitalId, allSpecialties, registered, onSave, onClose, C,
}: {
  hospitalId: string
  allSpecialties: SpecialtyRow[]
  registered: Set<string>
  onSave: () => void
  onClose: () => void
  C: any
}) {
  const [search,     setSearch]     = useState('')
  const [saving,     setSaving]     = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const filtered = allSpecialties.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) && !registered.has(s.id)
  )

  async function add(s: SpecialtyRow) {
    setSaving(s.id)
    await addHospitalSpecialty(hospitalId, s.id)
    setSaving(null)
    onSave()
    setSuccessMsg(`${s.name} added successfully`)
    setTimeout(() => { onClose() }, 1200)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 440, background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', padding: '28px 28px 16px' }}>

        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 4 }}>
          Add Specialty
        </div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>
          Select specialties your hospital offers
        </div>

        {successMsg && (
          <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#4ade80', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={14} /> {successMsg}
          </div>
        )}

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search specialties…"
          style={{ width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
            borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
            marginBottom: 12 }} />

        <div style={{ maxHeight: 320, overflowY: 'auto', marginRight: -4 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: C.textMuted, fontSize: 13 }}>
              {search ? 'No matching specialties' : 'All specialties already added'}
            </div>
          ) : filtered.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 8px', borderRadius: 10, marginBottom: 2,
              border: `1px solid transparent` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Stethoscope size={20} color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</span>
              </div>
              <button onClick={() => add(s)} disabled={saving === s.id}
                style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  background: C.accentLight, border: `1px solid ${C.accentBorder}`,
                  color: C.accent, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  opacity: saving === s.id ? 0.6 : 1 }}>
                {saving === s.id ? '…' : '+ Add'}
              </button>
            </div>
          ))}
        </div>

        <button onClick={onClose}
          style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 10, cursor: 'pointer',
            background: C.bgAlt, border: `1px solid ${C.borderMed}`,
            color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
          Done
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'services' | 'specialties'

export default function ServicesPage() {
  const { theme: C }                        = useTheme()
  const { hospital, role, clinicId: userClinicId } = useAdmin()

  const isScopedToClinic = (role === 'clinic_admin' || role === 'front_desk') && !!userClinicId

  const [tab,             setTab]             = useState<Tab>('services')
  const [services,        setServices]        = useState<HospitalService[]>([])
  const [specialties,     setSpecialties]     = useState<SpecialtyRow[]>([])
  const [allSpecialties,  setAllSpecialties]  = useState<SpecialtyRow[]>([])
  const [loading,         setLoading]         = useState(true)

  const [showAddService,  setShowAddService]  = useState(false)
  const [editService,     setEditService]     = useState<HospitalService | null>(null)
  const [deleteConfirm,   setDeleteConfirm]   = useState<HospitalService | null>(null)
  const [showAddSpecialty,setShowAddSpecialty]= useState(false)
  const [deletingSpec,    setDeletingSpec]    = useState<string | null>(null)
  const [removeSpecConfirm, setRemoveSpecConfirm] = useState<SpecialtyRow | null>(null)

  const load = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    if (isScopedToClinic) {
      const [svc, all] = await Promise.all([
        getHospitalServices(hospital.id, userClinicId!),
        getAllSpecialties(),
      ])
      setServices(svc)
      setAllSpecialties(all)
    } else {
      const [svc, spec, all] = await Promise.all([
        getHospitalServices(hospital.id),
        getRegisteredSpecialties(hospital.id),
        getAllSpecialties(),
      ])
      setServices(svc)
      setSpecialties(spec)
      setAllSpecialties(all)
    }
    setLoading(false)
  }, [hospital?.id, isScopedToClinic, userClinicId])

  useEffect(() => { load() }, [load])

  async function handleToggleService(s: HospitalService) {
    await toggleServiceActive(s.id, !s.is_active)
    setServices(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x))
  }

  async function handleDeleteService(s: HospitalService) {
    await deleteService(s.id)
    setServices(prev => prev.filter(x => x.id !== s.id))
    setDeleteConfirm(null)
  }

  async function handleRemoveSpecialty(spec: SpecialtyRow) {
    setDeletingSpec(spec.id)
    setRemoveSpecConfirm(null)
    await removeHospitalSpecialty(hospital!.id, spec.id)
    setSpecialties(prev => prev.filter(x => x.id !== spec.id))
    setDeletingSpec(null)
  }

  const registeredIds = new Set(specialties.map(s => s.id))

  return (
    <div>
      {/* Header */}
      <style>{`
        .services-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
        @media (max-width: 1023px) { .services-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 480px)  { .services-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>
            {isScopedToClinic ? 'Clinic Services' : 'Services & Specialties'}
          </div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
            {isScopedToClinic ? 'Manage services for your clinic' : 'Manage what your hospital offers on Queue'}
          </div>
        </div>
        <button
          onClick={() => tab === 'services' ? setShowAddService(true) : setShowAddSpecialty(true)}
          style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {tab === 'services' ? '+ Add Service' : '+ Add Specialty'}
        </button>
      </div>

      {/* Tabs — hide Specialties for clinic-scoped users */}
      {!isScopedToClinic && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {(['services', 'specialties'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 20px', borderRadius: 99, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', border: '1px solid', fontFamily: 'inherit',
                background: tab === t ? C.accentLight : C.bgAlt,
                color:      tab === t ? C.accent : C.textSub,
                borderColor: tab === t ? C.accentBorder : C.border }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600,
                background: tab === t ? C.accentBorder : C.border,
                color: tab === t ? C.accent : C.textMuted,
                borderRadius: 99, padding: '1px 7px' }}>
                {t === 'services' ? services.length : specialties.length}
              </span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>
          Loading…
        </div>
      ) : tab === 'services' ? (

        /* ── Services tab ──────────────────────────────────────────────────── */
        <div>
          {services.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px',
              border: `2px dashed ${C.border}`, borderRadius: 16, color: C.textMuted }}>
              <Stethoscope size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub, marginBottom: 6 }}>
                No services yet
              </div>
              <div style={{ fontSize: 12 }}>Click "+ Add Service" to create your first hospital service</div>
            </div>
          ) : (
            <div className="services-grid">
              {services.map(s => {
                const canEdit = true
                return (
                <div key={s.id} style={{ background: C.card,
                  border: `1px solid ${s.is_active ? C.accentBorder : C.border}`,
                  borderRadius: 16, padding: 18, transition: 'border-color .2s',
                  opacity: s.is_active ? 1 : 0.65 }}>

                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{s.name}</div>
                      {s.specialty_name && (
                        <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, marginTop: 2 }}>
                          {s.specialty_name}
                        </div>
                      )}
                    </div>
                    {/* Active toggle — only if user can edit */}
                    {canEdit && (
                      <div onClick={() => handleToggleService(s)}
                        style={{ width: 38, height: 21, borderRadius: 99,
                          background: s.is_active ? C.accent : C.borderMed,
                          position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .2s' }}>
                        <div style={{ position: 'absolute', top: 3, left: s.is_active ? 19 : 3,
                          width: 15, height: 15, borderRadius: '50%', background: '#fff',
                          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                      </div>
                    )}
                  </div>

                  {s.description && (
                    <div style={{ fontSize: 12, color: C.textSub, marginBottom: 10,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as any }}>
                      {s.description}
                    </div>
                  )}

                  {/* Pricing / duration */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {s.base_price != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px',
                        borderRadius: 99, background: C.accentLight, color: C.accent }}>
                        {fmtPrice(s.base_price)}
                      </span>
                    )}
                    {s.virtual_price != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px',
                        borderRadius: 99, background: 'rgba(91,158,255,0.12)', color: '#5B9EFF' }}>
                        {fmtPrice(s.virtual_price)}
                      </span>
                    )}
                    {s.duration_mins != null && (
                      <span style={{ fontSize: 11, padding: '3px 9px',
                        borderRadius: 99, background: C.bgAlt, color: C.textSub }}>
                        {s.duration_mins} min
                      </span>
                    )}
                  </div>

                  {/* Actions — locked for hospital-wide services viewed by clinic_admin */}
                  {canEdit ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setEditService(s)}
                        style={{ flex: 1, padding: '7px', borderRadius: 8,
                          border: `1px solid ${C.border}`, background: C.card,
                          color: C.textSub, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Edit
                      </button>
                      <button onClick={() => setDeleteConfirm(s)}
                        style={{ padding: '7px 12px', borderRadius: 8,
                          border: '1px solid rgba(220,60,60,0.25)', background: 'rgba(220,60,60,0.06)',
                          color: '#f07070', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>
                      Managed by hospital admin
                    </div>
                  )}
                </div>
              )})}

            </div>
          )}
        </div>

      ) : (

        /* ── Specialties tab ───────────────────────────────────────────────── */
        <div>
          {specialties.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px',
              border: `2px dashed ${C.border}`, borderRadius: 16, color: C.textMuted }}>
              <Stethoscope size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub, marginBottom: 6 }}>
                No specialties registered
              </div>
              <div style={{ fontSize: 12 }}>
                Click "+ Add Specialty" to register what specialties your hospital offers
              </div>
            </div>
          ) : (
            <div className="services-grid">
              {specialties.map(s => (
                <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 18, display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Stethoscope size={28} color={C.accent} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{s.slug}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRemoveSpecConfirm(s)}
                    disabled={deletingSpec === s.id}
                    style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid rgba(220,60,60,0.25)', background: 'rgba(220,60,60,0.06)',
                      color: '#f07070', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                      opacity: deletingSpec === s.id ? 0.5 : 1 }}>
                    {deletingSpec === s.id ? '…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Service Modal */}
      {(showAddService || editService) && hospital && (
        <ServiceModal
          hospitalId={hospital.id}
          clinicId={isScopedToClinic ? userClinicId : null}
          allSpecialties={allSpecialties}
          editing={editService}
          C={C}
          onClose={() => { setShowAddService(false); setEditService(null) }}
          onSave={() => { setShowAddService(false); setEditService(null); load() }}
        />
      )}

      {/* Remove Specialty Confirmation */}
      {removeSpecConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setRemoveSpecConfirm(null) }}>
          <div style={{ width: '100%', maxWidth: 380, background: C.card,
            border: '1px solid rgba(220,60,60,0.25)', borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)', padding: '28px 28px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>
              Remove Specialty
            </div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
              Remove <strong style={{ color: C.text }}>{removeSpecConfirm.name}</strong> from your hospital?
              Existing appointments using this specialty will not be affected.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRemoveSpecConfirm(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                  background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                  color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={() => handleRemoveSpecialty(removeSpecConfirm)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(220,60,60,0.12)', border: '1px solid rgba(220,60,60,0.3)',
                  color: '#f07070', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Specialty Modal */}
      {showAddSpecialty && hospital && (
        <AddSpecialtyModal
          hospitalId={hospital.id}
          allSpecialties={allSpecialties}
          registered={registeredIds}
          C={C}
          onClose={() => setShowAddSpecialty(false)}
          onSave={() => { load(); /* modal closes itself after 1.2s via setTimeout */ }}
        />
      )}

      {/* Delete Service Confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div style={{ width: '100%', maxWidth: 380, background: C.card,
            border: '1px solid rgba(220,60,60,0.25)', borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)', padding: '28px 28px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>
              Delete Service
            </div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
              Are you sure you want to delete <strong style={{ color: C.text }}>{deleteConfirm.name}</strong>?
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                  background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                  color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={() => handleDeleteService(deleteConfirm)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(220,60,60,0.12)', border: '1px solid rgba(220,60,60,0.3)',
                  color: '#f07070', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
