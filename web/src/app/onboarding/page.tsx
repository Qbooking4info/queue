'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Specialty, SubscriptionPlan } from '@/types/database'
import {
  Building2, Stethoscope, Microscope, ScanLine, Clock, Building, X, Check,
  Video, AlertTriangle, ArrowRight, MapPin,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type HospitalType = 'hospital' | 'clinic' | 'specialist_center' | 'diagnostic' | 'teaching' | 'maternity'
type Ownership    = 'private' | 'federal' | 'state' | 'mission' | 'ngo'
type ClinicModel  = 'single' | 'multi'

interface ClinicEntry { id: string; name: string; description: string }

interface FormData {
  // Step 1 — Basics
  name: string; type: HospitalType; ownership: Ownership | null; description: string
  // Step 2 — Verification
  registrationNumber: string; mdcnNumber: string
  // Step 3 — Location
  address: string; city: string; state: string; latitude: number | null; longitude: number | null
  phone: string; email: string; whatsapp: string
  // Step 4 — Clinic Structure
  clinicModel: ClinicModel
  clinics: ClinicEntry[]
  // Step 5 — Specialties
  specialtyIds: string[]
  // Step 6 — Features
  accepts_virtual: boolean; emergency_hours: boolean; is_24_hours: boolean
  approvalMode: 'auto' | 'manual'
  // Step 7 — Hours
  hours: { day: number; open: string; close: string; closed: boolean }[]
  // Step 8 — Plan
  planId: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const HOSPITAL_TYPES: { value: HospitalType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'hospital',          label: 'General Hospital',    icon: <Building2 size={20} />,   desc: 'Full-service multi-specialty care' },
  { value: 'clinic',            label: 'Clinic',              icon: <Stethoscope size={20} />, desc: 'Outpatient consultations & GP care' },
  { value: 'specialist_center', label: 'Specialist Centre',   icon: <Microscope size={20} />,  desc: 'Focused specialty practice' },
  { value: 'diagnostic',        label: 'Diagnostic Centre',   icon: <ScanLine size={20} />,    desc: 'Lab, imaging & diagnostics' },
  { value: 'teaching',          label: 'Teaching Hospital',   icon: <Building size={20} />,    desc: 'Training facility attached to a medical school' },
  { value: 'maternity',         label: 'Maternity Centre',    icon: <Building2 size={20} />,   desc: 'Antenatal, delivery & postnatal care' },
]

const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'federal', label: 'Federal' },
  { value: 'state',   label: 'State' },
  { value: 'mission', label: 'Mission' },
  { value: 'ngo',     label: 'NGO' },
]

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun',
  'Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

const STEP_LABELS = ['Basics', 'Verification', 'Location', 'Clinics', 'Specialties', 'Features', 'Hours', 'Plan']

// ── Step Progress Bar ────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ width: '100%', marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, transition: 'background .3s',
            background: i < current ? '#1A7FC1' : i === current ? 'rgba(26,127,193,0.35)' : '#DDE8F5' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#6A8FAA' }}>Step {current + 1} of {total}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1A7FC1' }}>{STEP_LABELS[current]}</span>
      </div>
    </div>
  )
}

// ── Step 1: Hospital Basics ───────────────────────────────────────────────────

const lightInput: React.CSSProperties = {
  width: '100%', background: '#FFFFFF', border: '1.5px solid #DDE8F5',
  borderRadius: 10, padding: '11px 14px', fontSize: 14, color: '#0C2A4A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
const lightLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#2A5070',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em',
}

function StepBasics({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>Tell us about your hospital</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>This is how patients will find and recognise you</p>
      </div>
      <div>
        <label style={lightLabel}>Hospital / Clinic Name</label>
        <input value={data.name} onChange={e => onChange({ name: e.target.value })}
          placeholder="e.g. Lagos Island General Hospital" required style={lightInput} />
      </div>
      <div>
        <label style={lightLabel}>Facility Type</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {HOSPITAL_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => onChange({ type: t.value })}
              style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: `1.5px solid ${data.type === t.value ? '#1A7FC1' : '#DDE8F5'}`,
                background: data.type === t.value ? '#EAF4FC' : '#FAFCFF', cursor: 'pointer', transition: 'all .15s' }}>
              <span style={{ display: 'block', marginBottom: 4, color: data.type === t.value ? '#1A7FC1' : '#6A8FAA' }}>{t.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, display: 'block', color: data.type === t.value ? '#1A7FC1' : '#0C2A4A' }}>{t.label}</span>
              <span style={{ fontSize: 11, color: '#6A8FAA' }}>{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={lightLabel}>Ownership <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {OWNERSHIP_OPTIONS.map(o => {
            const active = data.ownership === o.value
            return (
              <button key={o.value} type="button"
                onClick={() => onChange({ ownership: active ? null : o.value })}
                style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all .15s',
                  border: `1.5px solid ${active ? '#1A7FC1' : '#DDE8F5'}`,
                  background: active ? '#EAF4FC' : '#FAFCFF',
                  color: active ? '#1A7FC1' : '#6A8FAA' }}>
                {o.label}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: '#6A8FAA', marginTop: 6 }}>Separate from the facility type above — a federal teaching hospital is both.</p>
      </div>

      <div>
        <label style={lightLabel}>Description <span style={{ fontWeight: 400, textTransform: 'none', color: '#6A8FAA' }}>(optional)</span></label>
        <textarea value={data.description} onChange={e => onChange({ description: e.target.value })}
          placeholder="Briefly describe your facility, key strengths, and what patients can expect…"
          rows={3} style={{ ...lightInput, resize: 'none' } as React.CSSProperties} />
      </div>
    </div>
  )
}

// ── Step 2: Verification ──────────────────────────────────────────────────────

function StepVerification({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>Verify your facility</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>These credentials are used to verify your hospital before patients can book appointments</p>
      </div>

      <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(217,119,6,0.25)', background: '#FFFBEB',
        display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Clock size={16} style={{ marginTop: 2, color: '#D97706', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', marginBottom: 2 }}>Verification pending</div>
          <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
            Your hospital will be reviewed by the Queue team within 24–48 hours. You can use the dashboard while we verify your details.
          </div>
        </div>
      </div>

      <div>
        <label style={lightLabel}>Hospital / CAC Registration Number *</label>
        <input value={data.registrationNumber} onChange={e => onChange({ registrationNumber: e.target.value })}
          placeholder="e.g. RC-1234567 or MHN/123/2020" required style={lightInput} />
        <p style={{ fontSize: 11, color: '#6A8FAA', marginTop: 4 }}>Issued by CAC or your State Ministry of Health</p>
      </div>

      <div>
        <label style={lightLabel}>MDCN Accreditation Number <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
        <input value={data.mdcnNumber} onChange={e => onChange({ mdcnNumber: e.target.value })}
          placeholder="e.g. MDCN/A/12345" style={lightInput} />
        <p style={{ fontSize: 11, color: '#6A8FAA', marginTop: 4 }}>You can add this later from dashboard settings</p>
      </div>
    </div>
  )
}

// ── Step 3: Contact & Location ────────────────────────────────────────────────

function StepLocation({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  const [geoBusy, setGeoBusy]   = useState(false)
  const [geoError, setGeoError] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>Contact & Location</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>Patients will use this to find and reach you</p>
      </div>
      <div>
        <label style={lightLabel}>Street Address *</label>
        <input value={data.address} onChange={e => onChange({ address: e.target.value })}
          placeholder="3 Marina Street, Lagos Island" required style={lightInput} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lightLabel}>City *</label>
          <input value={data.city} onChange={e => onChange({ city: e.target.value })}
            placeholder="Lagos" required style={lightInput} />
        </div>
        <div>
          <label style={lightLabel}>State *</label>
          <select value={data.state} onChange={e => onChange({ state: e.target.value })}
            style={{ ...lightInput, color: data.state ? '#0C2A4A' : '#6A8FAA', appearance: 'auto' } as React.CSSProperties}>
            <option value="">Select state</option>
            {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={lightLabel}>Phone Number *</label>
        <input type="tel" value={data.phone} onChange={e => onChange({ phone: e.target.value })}
          placeholder="+234 802 000 0001" required style={lightInput} />
      </div>
      <div>
        <label style={lightLabel}>Hospital Email <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
        <input type="email" value={data.email} onChange={e => onChange({ email: e.target.value })}
          placeholder="info@hospital.com" style={lightInput} />
      </div>
      <div>
        <label style={lightLabel}>WhatsApp Number <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
        <input type="tel" value={data.whatsapp} onChange={e => onChange({ whatsapp: e.target.value })}
          placeholder="+234 802 000 0001" style={lightInput} />
        <p style={{ fontSize: 11, color: '#6A8FAA', marginTop: 4 }}>Patients may use this for quick queries</p>
      </div>

      {/* Coordinates. Ambulance dispatch ranks candidates by distance to the
          destination hospital and the patient directory sorts by proximity, so
          a hospital with no coordinates is invisible to both. This form declared
          latitude/longitude and sent them from day one, but nothing ever set
          them — every hospital onboarded so far stored null. */}
      <div>
        <label style={lightLabel}>Map Location</label>
        <button type="button"
          onClick={() => {
            if (!navigator.geolocation) { setGeoError('This browser cannot share a location.'); return }
            setGeoBusy(true); setGeoError('')
            navigator.geolocation.getCurrentPosition(
              pos => { onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setGeoBusy(false) },
              err => { setGeoError(err.code === err.PERMISSION_DENIED
                ? 'Location permission denied — you can set this later from the dashboard.'
                : 'Could not get your location. You can set this later from the dashboard.'); setGeoBusy(false) },
              { enableHighAccuracy: true, timeout: 10000 },
            )
          }}
          disabled={geoBusy}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 14px',
            borderRadius: 10, cursor: geoBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 14,
            border: `1.5px solid ${data.latitude != null ? '#1A7FC1' : '#DDE8F5'}`,
            background: data.latitude != null ? '#EAF4FC' : '#FAFCFF',
            color: data.latitude != null ? '#1A7FC1' : '#2A5070' }}>
          {data.latitude != null ? <Check size={16} /> : <MapPin size={16} />}
          {geoBusy ? 'Getting location…' : data.latitude != null ? 'Location captured' : 'Use my current location'}
        </button>
        {data.latitude != null && data.longitude != null && (
          <p style={{ fontSize: 11, color: '#6A8FAA', marginTop: 4 }}>
            {data.latitude.toFixed(5)}, {data.longitude.toFixed(5)} — set this from the hospital site for an accurate pin.
          </p>
        )}
        {geoError && <p style={{ fontSize: 11, color: '#E03E3E', marginTop: 4 }}>{geoError}</p>}
      </div>
    </div>
  )
}

// ── Step 4: Clinic Structure ──────────────────────────────────────────────────

function newClinic(): ClinicEntry {
  return { id: Math.random().toString(36).slice(2), name: '', description: '' }
}

function StepClinicStructure({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  function addClinic() { onChange({ clinics: [...data.clinics, newClinic()] }) }
  function removeClinic(id: string) { onChange({ clinics: data.clinics.filter(c => c.id !== id) }) }
  function updateClinic(id: string, field: keyof ClinicEntry, value: string) {
    onChange({ clinics: data.clinics.map(c => c.id === id ? { ...c, [field]: value } : c) })
  }
  const EXAMPLE_CLINICS = ['OPD Clinic', 'General Surgery Clinic', 'Orthopaedic Clinic', 'Cardiology Clinic', 'Paediatrics Clinic', 'Gynaecology Clinic']

  const modelBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16, borderRadius: 12, textAlign: 'left',
    border: `1.5px solid ${active ? '#1A7FC1' : '#DDE8F5'}`, background: active ? '#EAF4FC' : '#FAFCFF',
    cursor: 'pointer', width: '100%', transition: 'all .15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>How is your facility organised?</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>This determines how you manage bookings, doctors, and front desk</p>
      </div>

      <button type="button" onClick={() => onChange({ clinicModel: 'single' })} style={modelBtn(data.clinicModel === 'single')}>
        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: data.clinicModel === 'single' ? 'rgba(26,127,193,0.12)' : '#F0F5FF', color: data.clinicModel === 'single' ? '#1A7FC1' : '#6A8FAA' }}>
          <Building2 size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: data.clinicModel === 'single' ? '#1A7FC1' : '#0C2A4A', marginBottom: 3 }}>Single Clinic</div>
          <div style={{ fontSize: 12, color: '#6A8FAA', lineHeight: 1.6 }}>One operation — manage all doctors, queues, and appointments from one dashboard. Best for standalone clinics.</div>
        </div>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${data.clinicModel === 'single' ? '#1A7FC1' : '#DDE8F5'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
          {data.clinicModel === 'single' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1A7FC1' }} />}
        </div>
      </button>

      <button type="button" onClick={() => onChange({ clinicModel: 'multi', clinics: data.clinics.length > 0 ? data.clinics : [newClinic()] })}
        style={modelBtn(data.clinicModel === 'multi')}>
        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: data.clinicModel === 'multi' ? 'rgba(26,127,193,0.12)' : '#F0F5FF', color: data.clinicModel === 'multi' ? '#1A7FC1' : '#6A8FAA' }}>
          <Building size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: data.clinicModel === 'multi' ? '#1A7FC1' : '#0C2A4A' }}>Multiple Clinics / Departments</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(26,127,193,0.1)', color: '#1A7FC1', border: '1px solid rgba(26,127,193,0.2)' }}>Growth+</span>
          </div>
          <div style={{ fontSize: 12, color: '#6A8FAA', lineHeight: 1.6 }}>Several departments (OPD, Surgery, Cardiology…) each with their own sub-admin and queue.</div>
        </div>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${data.clinicModel === 'multi' ? '#1A7FC1' : '#DDE8F5'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
          {data.clinicModel === 'multi' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1A7FC1' }} />}
        </div>
      </button>

      {data.clinicModel === 'multi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0C2A4A' }}>Define your clinics / departments</div>
              <div style={{ fontSize: 11, color: '#6A8FAA' }}>You can rename these later from your dashboard</div>
            </div>
            <button type="button" onClick={addClinic}
              style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
                background: '#EAF4FC', color: '#1A7FC1', border: '1px solid rgba(26,127,193,0.25)', cursor: 'pointer' }}>
              + Add
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLE_CLINICS.filter(ex => !data.clinics.some(c => c.name === ex)).map(ex => (
              <button key={ex} type="button"
                onClick={() => onChange({ clinics: [...data.clinics, { id: Math.random().toString(36).slice(2), name: ex, description: '' }] })}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid #DDE8F5',
                  color: '#6A8FAA', background: '#FAFCFF', cursor: 'pointer' }}>
                + {ex}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {data.clinics.map((clinic, idx) => (
              <div key={clinic.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                borderRadius: 10, border: `1.5px solid ${clinic.name ? 'rgba(26,127,193,0.25)' : '#DDE8F5'}`, background: '#FAFCFF' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EAF4FC', color: '#1A7FC1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <input value={clinic.name} onChange={e => updateClinic(clinic.id, 'name', e.target.value)}
                  placeholder="e.g. OPD Clinic…"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#0C2A4A' }} />
                <button type="button" onClick={() => removeClinic(clinic.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6A8FAA', display: 'flex', padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          {data.clinics.filter(c => c.name.trim()).length === 0 && (
            <p style={{ fontSize: 12, color: '#D97706' }}>Add at least one clinic name to continue</p>
          )}
          {data.clinics.filter(c => c.name.trim()).length > 0 && (
            <p style={{ fontSize: 12, color: '#1A7FC1' }}>{data.clinics.filter(c => c.name.trim()).length} clinic(s) defined</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 5: Specialties ───────────────────────────────────────────────────────

function StepSpecialties({ data, onChange, specialties }: { data: FormData; onChange: (d: Partial<FormData>) => void; specialties: Specialty[] }) {
  const toggle = (id: string) => {
    const ids = data.specialtyIds.includes(id) ? data.specialtyIds.filter(s => s !== id) : [...data.specialtyIds, id]
    onChange({ specialtyIds: ids })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>What do you specialise in?</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>Select all that apply — patients filter by specialty</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {specialties.map(s => {
          const selected = data.specialtyIds.includes(s.id)
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                border: `1.5px solid ${selected ? '#1A7FC1' : '#DDE8F5'}`,
                background: selected ? '#EAF4FC' : '#FAFCFF', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: selected ? '#1A7FC1' : '#0C2A4A' }}>{s.name}</span>
              {selected && <Check size={13} style={{ color: '#1A7FC1', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>
      {data.specialtyIds.length > 0 && (
        <p style={{ fontSize: 13, color: '#1A7FC1', fontWeight: 600 }}>{data.specialtyIds.length} specialty selected</p>
      )}
    </div>
  )
}

// ── Step 6: Features ──────────────────────────────────────────────────────────

function StepFeatures({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  const features = [
    { key: 'accepts_virtual',  icon: <Video size={22} />,         label: 'Virtual Consultations',  desc: 'Patients can book and attend appointments via video call' },
    { key: 'emergency_hours',  icon: <AlertTriangle size={22} />, label: '24/7 Emergency Services', desc: 'You provide round-the-clock emergency care' },
    { key: 'is_24_hours',      icon: <Clock size={22} />,         label: 'Open 24 Hours',           desc: 'The facility itself is open around the clock, not just emergency care' },
  ] as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>Additional Features</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>Let patients know what you offer beyond in-person visits</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {features.map(f => {
          const enabled = data[f.key]
          return (
            <button key={f.key} type="button" onClick={() => onChange({ [f.key]: !enabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, textAlign: 'left',
                border: `1.5px solid ${enabled ? '#1A7FC1' : '#DDE8F5'}`, background: enabled ? '#EAF4FC' : '#FAFCFF',
                cursor: 'pointer', transition: 'all .15s', width: '100%' }}>
              <span style={{ color: enabled ? '#1A7FC1' : '#6A8FAA' }}>{f.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: enabled ? '#1A7FC1' : '#0C2A4A', marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 12, color: '#6A8FAA' }}>{f.desc}</div>
              </div>
              <div style={{ width: 40, height: 22, borderRadius: 11, position: 'relative', flexShrink: 0,
                background: enabled ? '#1A7FC1' : '#DDE8F5', transition: 'background .2s' }}>
                <div style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                  background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .2s',
                  left: enabled ? 21 : 3 }} />
              </div>
            </button>
          )
        })}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#2A5070', marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Booking Approval
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            { value: 'auto',   label: 'Automatic',      desc: 'Bookings are confirmed instantly when a slot is free' },
            { value: 'manual', label: 'Manual review',  desc: 'Your staff confirm each booking before it is final' },
          ] as const).map(m => {
            const active = data.approvalMode === m.value
            return (
              <button key={m.value} type="button" onClick={() => onChange({ approvalMode: m.value })}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, textAlign: 'left',
                  border: `1.5px solid ${active ? '#1A7FC1' : '#DDE8F5'}`, background: active ? '#EAF4FC' : '#FAFCFF',
                  cursor: 'pointer', transition: 'all .15s', width: '100%' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${active ? '#1A7FC1' : '#DDE8F5'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1A7FC1' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: active ? '#1A7FC1' : '#0C2A4A', marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: '#6A8FAA' }}>{m.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #DDE8F5', background: '#F4F8FC' }}>
        <p style={{ fontSize: 12, color: '#6A8FAA', lineHeight: 1.6 }}>
          <strong style={{ color: '#2A5070' }}>EMR Integration</strong> is available on the Growth and Enterprise plans.
          Connect your existing system (OpenMRS, Epic, Meditech) after setup.
        </p>
      </div>
    </div>
  )
}

// ── Step 7: Operating Hours ───────────────────────────────────────────────────

function StepHours({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  const updateHour = (day: number, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    onChange({ hours: data.hours.map(h => h.day === day ? { ...h, [field]: value } : h) })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>Operating Hours</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>Set when patients can book appointments</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.hours.map(h => (
          <div key={h.day} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 10, border: '1.5px solid #DDE8F5', background: h.closed ? '#F8FAFC' : '#FFFFFF' }}>
            <span style={{ fontSize: 13, fontWeight: 600, width: 36, flexShrink: 0, color: h.closed ? '#6A8FAA' : '#0C2A4A' }}>
              {DAYS[h.day].slice(0, 3)}
            </span>
            {h.closed ? (
              <span style={{ fontSize: 12, color: '#6A8FAA', flex: 1 }}>Closed</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <input type="time" value={h.open} onChange={e => updateHour(h.day, 'open', e.target.value)}
                  style={{ background: '#F4F8FC', border: '1px solid #DDE8F5', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: '#0C2A4A', outline: 'none' }} />
                <span style={{ fontSize: 12, color: '#6A8FAA' }}>to</span>
                <input type="time" value={h.close} onChange={e => updateHour(h.day, 'close', e.target.value)}
                  style={{ background: '#F4F8FC', border: '1px solid #DDE8F5', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: '#0C2A4A', outline: 'none' }} />
              </div>
            )}
            <button type="button" onClick={() => updateHour(h.day, 'closed', !h.closed)}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, flexShrink: 0,
                border: `1px solid ${h.closed ? 'rgba(26,127,193,0.3)' : '#DDE8F5'}`,
                color: h.closed ? '#1A7FC1' : '#6A8FAA', background: h.closed ? '#EAF4FC' : '#F4F8FC', cursor: 'pointer' }}>
              {h.closed ? 'Open' : 'Close'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 8: Subscription Plan ─────────────────────────────────────────────────

function StepPlan({ data, onChange, plans, clinicModel }: { data: FormData; onChange: (d: Partial<FormData>) => void; plans: SubscriptionPlan[]; clinicModel: ClinicModel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0C2A4A', marginBottom: 4 }}>Choose your plan</h2>
        <p style={{ fontSize: 13, color: '#6A8FAA' }}>Start free for 3 months — upgrade or cancel anytime</p>
      </div>

      {clinicModel === 'multi' && (
        <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(217,119,6,0.25)', background: '#FFFBEB',
          display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <AlertTriangle size={13} style={{ marginTop: 1, color: '#D97706', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#92400E' }}>
            You selected <strong>Multiple Clinics</strong>. This requires the <strong>Growth plan or higher</strong>.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plans.map(plan => {
          const features = plan.features as string[]
          const selected = data.planId === plan.id
          const isGrowth = plan.name === 'growth'
          const isStarter = plan.name === 'starter'
          const lockedForMulti = clinicModel === 'multi' && isStarter

          return (
            <button key={plan.id} type="button"
              onClick={() => !lockedForMulti && onChange({ planId: plan.id })}
              disabled={lockedForMulti}
              style={{ textAlign: 'left', padding: 16, borderRadius: 12, position: 'relative',
                border: `1.5px solid ${selected ? '#1A7FC1' : isGrowth ? 'rgba(26,127,193,0.25)' : '#DDE8F5'}`,
                background: selected ? '#EAF4FC' : isGrowth ? '#F0F7FD' : '#FAFCFF',
                opacity: lockedForMulti ? 0.45 : 1, cursor: lockedForMulti ? 'not-allowed' : 'pointer', transition: 'all .15s' }}>
              {isGrowth && !selected && (
                <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: 700,
                  color: '#1A7FC1', background: '#EAF4FC', border: '1px solid rgba(26,127,193,0.25)', padding: '2px 8px', borderRadius: 20 }}>Popular</span>
              )}
              {lockedForMulti && (
                <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: 700,
                  color: '#D97706', background: '#FFFBEB', border: '1px solid rgba(217,119,6,0.25)', padding: '2px 8px', borderRadius: 20 }}>Upgrade needed</span>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: selected ? '#1A7FC1' : '#0C2A4A', marginBottom: 2 }}>{plan.display_name}</div>
                  <div style={{ fontSize: 11, color: '#6A8FAA' }}>
                    {plan.max_doctors ? `Up to ${plan.max_doctors} doctors` : 'Unlimited doctors'} · {plan.max_monthly_bookings ? `${plan.max_monthly_bookings.toLocaleString()} bookings/mo` : 'Unlimited bookings'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: selected ? '#1A7FC1' : '#0C2A4A' }}>
                    ₦{plan.price_monthly.toLocaleString()}<span style={{ fontWeight: 400, color: '#6A8FAA', fontSize: 12 }}>/mo</span>
                  </div>
                  {plan.price_annual && (
                    <div style={{ fontSize: 11, color: '#1A7FC1' }}>₦{plan.price_annual.toLocaleString()} annually</div>
                  )}
                </div>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6A8FAA' }}>
                    <Check size={11} style={{ color: '#1A7FC1', flexShrink: 0 }} /> {f}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Onboarding Page ──────────────────────────────────────────────────────

const defaultHours = DAYS.map((_, i) => ({
  day: i, open: '08:00', close: '18:00', closed: i === 0,
}))

export default function OnboardingPage() {
  const router   = useRouter()
  const supabase = createClient()
  const TOTAL_STEPS = 8

  const [step, setStep]           = useState(0)
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [plans, setPlans]         = useState<SubscriptionPlan[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [data, setData]           = useState<FormData>({
    name: '', type: 'hospital', ownership: null, description: '',
    registrationNumber: '', mdcnNumber: '',
    address: '', city: '', state: '', latitude: null, longitude: null, phone: '', email: '', whatsapp: '',
    clinicModel: 'single', clinics: [],
    specialtyIds: [],
    accepts_virtual: false, emergency_hours: false, is_24_hours: false,
    approvalMode: 'auto',
    hours: defaultHours,
    planId: '',
  })

  useEffect(() => {
    supabase.from('specialties').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => setSpecialties(data ?? []))
    supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order')
      .then(({ data: plans }) => {
        setPlans(plans ?? [])
        const growth = plans?.find(p => p.name === 'growth')
        if (growth) setData(d => ({ ...d, planId: growth.id }))
      })
  }, [])

  const update = (partial: Partial<FormData>) => setData(d => ({ ...d, ...partial }))

  const canProceed = () => {
    if (step === 0) return data.name.trim() && data.type
    if (step === 1) return data.registrationNumber.trim()
    if (step === 2) return data.address.trim() && data.city.trim() && data.state && data.phone.trim()
    if (step === 3) {
      if (data.clinicModel === 'multi') return data.clinics.some(c => c.name.trim())
      return true
    }
    if (step === 4) return data.specialtyIds.length > 0
    if (step === 7) return !!data.planId
    return true
  }

  async function handleSubmit() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name, type: data.type, ownership: data.ownership, description: data.description,
          registrationNumber: data.registrationNumber, mdcnNumber: data.mdcnNumber,
          address: data.address, city: data.city, state: data.state,
          latitude: data.latitude, longitude: data.longitude,
          phone: data.phone, email: data.email, whatsapp: data.whatsapp,
          clinicModel: data.clinicModel,
          clinics: data.clinics.filter(c => c.name.trim()),
          accepts_virtual: data.accepts_virtual, emergency_hours: data.emergency_hours,
          is_24_hours: data.is_24_hours, approvalMode: data.approvalMode,
          specialtyIds: data.specialtyIds,
          hours: data.hours,
          planId: data.planId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Server error')

      // Sign out so the admin logs in explicitly — hospital is pending verification
      const supabaseClient = createClient()
      await supabaseClient.auth.signOut()
      router.push('/login?registered=true')
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (e as { message?: string })?.message ?? JSON.stringify(e)
      setError(msg)
      setLoading(false)
    }
  }

  const steps = [
    <StepBasics           key="basics"      data={data} onChange={update} />,
    <StepVerification     key="verify"      data={data} onChange={update} />,
    <StepLocation         key="location"    data={data} onChange={update} />,
    <StepClinicStructure  key="clinics"     data={data} onChange={update} />,
    <StepSpecialties      key="specialties" data={data} onChange={update} specialties={specialties} />,
    <StepFeatures         key="features"    data={data} onChange={update} />,
    <StepHours            key="hours"       data={data} onChange={update} />,
    <StepPlan             key="plan"        data={data} onChange={update} plans={plans} clinicModel={data.clinicModel} />,
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Left panel — branding */}
      <div style={{ width: 300, flexShrink: 0, background: '#061208', display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between', padding: '48px 36px',
        position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, left: -80, width: 320, height: 320,
          borderRadius: '50%', background: 'rgba(0,232,122,0.04)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,232,122,0.1)',
              border: '1px solid rgba(0,232,122,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <rect x="6" y="8" width="28" height="24" rx="6" stroke="#00E87A" strokeWidth="2.5"/>
                <line x1="13" y1="16" x2="27" y2="16" stroke="#00E87A" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="13" y1="20" x2="22" y2="20" stroke="#00E87A" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="30" cy="30" r="8" fill="#061208" stroke="#00E87A" strokeWidth="2.5"/>
                <line x1="30" y1="26.5" x2="30" y2="30" stroke="#00E87A" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="30" cy="31.5" r="1" fill="#00E87A"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-.03em' }}>Queue</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Hospital Portal</div>
            </div>
          </div>

          <div style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-.04em', lineHeight: 1.3, marginBottom: 12 }}>
            Set up your<br />hospital profile
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, marginBottom: 40 }}>
            Complete each step to configure your facility and go live on the Queue platform.
          </div>

          {/* Step indicator list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STEP_LABELS.map((label, i) => {
              const done    = i < step
              const current = i === step
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: done || current ? 1 : 0.3 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: done ? '#00E87A' : current ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.06)',
                    border: `1.5px solid ${done ? '#00E87A' : current ? 'rgba(0,232,122,0.5)' : 'rgba(255,255,255,0.12)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {done
                      ? <Check size={12} color="#061208" strokeWidth={3} />
                      : <span style={{ fontSize: 10, fontWeight: 700, color: current ? '#00E87A' : 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
                    }
                  </div>
                  <span style={{ fontSize: 12, fontWeight: current ? 700 : 500,
                    color: done ? '#00E87A' : current ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
          © {new Date().getFullYear()} Queue Health Technologies
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ flex: 1, background: '#F4F8FC', display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '48px 24px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 520 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #DDE8F5',
            padding: '32px', boxShadow: '0 2px 12px rgba(12,42,74,0.06)' }}>
            <StepBar current={step} total={TOTAL_STEPS} />
            {steps[step]}
            {error && (
              <div style={{ background: '#FEF0F0', border: '1px solid #F5C6C6', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: '#E03E3E',
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              {step > 0 && (
                <button type="button" onClick={() => setStep(s => s - 1)}
                  style={{ flex: 1, background: '#FFFFFF', color: '#2A5070', border: '1.5px solid #DDE8F5',
                    borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                  Back
                </button>
              )}
              {step < TOTAL_STEPS - 1 ? (
                <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}
                  style={{ flex: 1, background: canProceed() ? '#1A7FC1' : '#A0BDD4', color: '#FFFFFF', border: 'none',
                    borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700,
                    cursor: canProceed() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={loading || !canProceed()}
                  style={{ flex: 1, background: canProceed() && !loading ? '#1A7FC1' : '#A0BDD4', color: '#FFFFFF', border: 'none',
                    borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700,
                    cursor: canProceed() && !loading ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {loading ? 'Completing setup…' : <><Check size={15} /> Complete Setup</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
