'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Specialty, SubscriptionPlan } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Types ────────────────────────────────────────────────────────────────────

type HospitalType = 'hospital' | 'clinic' | 'specialist_center' | 'diagnostic'
type ClinicModel  = 'single' | 'multi'

interface ClinicEntry { id: string; name: string; description: string }

interface FormData {
  // Step 1 — Basics
  name: string; type: HospitalType; description: string
  // Step 2 — Verification
  registrationNumber: string; mdcnNumber: string
  // Step 3 — Location
  address: string; city: string; state: string
  phone: string; email: string; whatsapp: string
  // Step 4 — Clinic Structure
  clinicModel: ClinicModel
  clinics: ClinicEntry[]
  // Step 5 — Specialties
  specialtyIds: string[]
  // Step 6 — Features
  accepts_virtual: boolean; emergency_hours: boolean
  // Step 7 — Hours
  hours: { day: number; open: string; close: string; closed: boolean }[]
  // Step 8 — Plan
  planId: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const HOSPITAL_TYPES: { value: HospitalType; label: string; icon: string; desc: string }[] = [
  { value: 'hospital',          label: 'General Hospital',    icon: '🏥', desc: 'Full-service multi-specialty care' },
  { value: 'clinic',            label: 'Clinic',              icon: '🩺', desc: 'Outpatient consultations & GP care' },
  { value: 'specialist_center', label: 'Specialist Centre',   icon: '🔬', desc: 'Focused specialty practice' },
  { value: 'diagnostic',        label: 'Diagnostic Centre',   icon: '📡', desc: 'Lab, imaging & diagnostics' },
]

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun',
  'Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

const STEP_LABELS = ['Basics', 'Verification', 'Location', 'Clinics', 'Specialties', 'Features', 'Hours', 'Plan']

// ── Step Progress Bar ────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full mb-10">
      <div className="flex gap-1 mb-3">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{ background: i < current ? '#00E87A' : i === current ? 'rgba(0,232,122,0.4)' : 'rgba(255,255,255,0.07)' }} />
        ))}
      </div>
      <div className="flex justify-between">
        <span className="text-xs text-[#7A9089]">Step {current + 1} of {total}</span>
        <span className="text-xs font-medium text-green-400">{STEP_LABELS[current]}</span>
      </div>
    </div>
  )
}

// ── Step 1: Hospital Basics ───────────────────────────────────────────────────

function StepBasics({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Tell us about your hospital</h2>
        <p className="text-sm text-[#7A9089]">This is how patients will find and recognise you</p>
      </div>
      <Input label="Hospital / Clinic Name" value={data.name} onChange={e => onChange({ name: e.target.value })}
        placeholder="e.g. Lagos Island General Hospital" required />
      <div>
        <label className="text-sm font-medium text-gray-300 block mb-2">Facility Type</label>
        <div className="grid grid-cols-2 gap-2">
          {HOSPITAL_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => onChange({ type: t.value })}
              className="text-left p-3 rounded-xl border transition-all"
              style={{
                borderColor: data.type === t.value ? 'rgba(0,232,122,0.4)' : 'rgba(255,255,255,0.07)',
                background:  data.type === t.value ? 'rgba(0,232,122,0.08)' : 'rgba(255,255,255,0.02)',
              }}>
              <span className="text-lg block mb-1">{t.icon}</span>
              <span className="text-sm font-semibold block" style={{ color: data.type === t.value ? '#00E87A' : '#F0F5F2' }}>{t.label}</span>
              <span className="text-xs text-[#4A6058]">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-300 block mb-1.5">
          Description <span className="text-[#4A6058] font-normal">(optional)</span>
        </label>
        <textarea value={data.description} onChange={e => onChange({ description: e.target.value })}
          placeholder="Briefly describe your facility, key strengths, and what patients can expect…"
          rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all" />
      </div>
    </div>
  )
}

// ── Step 2: Verification ──────────────────────────────────────────────────────

function StepVerification({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Verify your facility</h2>
        <p className="text-sm text-[#7A9089]">
          These credentials are used to verify your hospital before patients can book appointments
        </p>
      </div>

      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">⏳</span>
          <div>
            <div className="text-sm font-semibold text-amber-400 mb-0.5">Verification pending</div>
            <div className="text-xs text-[#7A9089] leading-relaxed">
              Your hospital will be reviewed by the Queue team within 24–48 hours after submission.
              You can complete your setup and use the dashboard while verification is in progress.
            </div>
          </div>
        </div>
      </div>

      <Input
        label="Hospital / CAC Registration Number"
        value={data.registrationNumber}
        onChange={e => onChange({ registrationNumber: e.target.value })}
        placeholder="e.g. RC-1234567 or MHN/123/2020"
        hint="Issued by CAC or your State Ministry of Health"
        required
      />

      <Input
        label="MDCN Accreditation Number"
        value={data.mdcnNumber}
        onChange={e => onChange({ mdcnNumber: e.target.value })}
        placeholder="e.g. MDCN/A/12345"
        hint="Medical and Dental Council of Nigeria accreditation reference"
      />

      <div className="p-4 rounded-xl border border-white/7 bg-white/2">
        <p className="text-xs text-[#7A9089] leading-relaxed">
          <span className="font-semibold text-[#F0F5F2]">Don&apos;t have your MDCN number yet?</span>{' '}
          You can skip it now and add it from your dashboard settings. The registration number is required to begin verification.
        </p>
      </div>
    </div>
  )
}

// ── Step 3: Contact & Location ────────────────────────────────────────────────

function StepLocation({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">Contact & Location</h2>
        <p className="text-sm text-[#7A9089]">Patients will use this to find and reach you</p>
      </div>
      <Input label="Street Address" value={data.address} onChange={e => onChange({ address: e.target.value })}
        placeholder="3 Marina Street, Lagos Island" required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="City" value={data.city} onChange={e => onChange({ city: e.target.value })}
          placeholder="Lagos" required />
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-1.5">State</label>
          <select value={data.state} onChange={e => onChange({ state: e.target.value })}
            style={{
              width: '100%', background: '#0E1A12', color: data.state ? '#F0F5F2' : '#4A6058',
              border: '1px solid rgba(255,255,255,0.10)', borderRadius: '12px',
              padding: '12px 16px', fontSize: '14px', fontFamily: 'inherit',
              outline: 'none', cursor: 'pointer', appearance: 'auto',
            }}>
            <option value="" style={{ background: '#0E1A12', color: '#4A6058' }}>Select state</option>
            {NIGERIAN_STATES.map(s => (
              <option key={s} value={s} style={{ background: '#0E1A12', color: '#F0F5F2' }}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <Input label="Phone Number" type="tel" value={data.phone} onChange={e => onChange({ phone: e.target.value })}
        placeholder="+234 802 000 0001" required />
      <Input label="Hospital Email" type="email" value={data.email} onChange={e => onChange({ email: e.target.value })}
        placeholder="info@hospital.com" />
      <Input label="WhatsApp Number" type="tel" value={data.whatsapp} onChange={e => onChange({ whatsapp: e.target.value })}
        placeholder="+234 802 000 0001" hint="Patients may use this for quick queries" />
    </div>
  )
}

// ── Step 4: Clinic Structure ──────────────────────────────────────────────────

function newClinic(): ClinicEntry {
  return { id: Math.random().toString(36).slice(2), name: '', description: '' }
}

function StepClinicStructure({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  function addClinic() {
    onChange({ clinics: [...data.clinics, newClinic()] })
  }
  function removeClinic(id: string) {
    onChange({ clinics: data.clinics.filter(c => c.id !== id) })
  }
  function updateClinic(id: string, field: keyof ClinicEntry, value: string) {
    onChange({ clinics: data.clinics.map(c => c.id === id ? { ...c, [field]: value } : c) })
  }

  const EXAMPLE_CLINICS = ['OPD Clinic', 'General Surgery Clinic', 'Orthopaedic Clinic',
    'Cardiology Clinic', 'Paediatrics Clinic', 'Gynaecology Clinic']

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">How is your facility organised?</h2>
        <p className="text-sm text-[#7A9089]">
          This determines how you manage bookings, doctors, and front desk across your facility
        </p>
      </div>

      {/* Single clinic option */}
      <button type="button" onClick={() => onChange({ clinicModel: 'single' })}
        className="flex items-start gap-4 p-4 rounded-xl border text-left transition-all"
        style={{
          borderColor: data.clinicModel === 'single' ? 'rgba(0,232,122,0.4)' : 'rgba(255,255,255,0.07)',
          background:  data.clinicModel === 'single' ? 'rgba(0,232,122,0.08)' : 'rgba(255,255,255,0.02)',
        }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: data.clinicModel === 'single' ? 'rgba(0,232,122,0.12)' : 'rgba(255,255,255,0.05)' }}>
          🏥
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold" style={{ color: data.clinicModel === 'single' ? '#00E87A' : '#F0F5F2' }}>
              Single Clinic
            </span>
          </div>
          <div className="text-xs text-[#7A9089] leading-relaxed">
            One central operation — you manage all doctors, queues, and appointments from a single dashboard.
            Best for standalone clinics and specialist centres.
          </div>
        </div>
        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
          style={{ borderColor: data.clinicModel === 'single' ? '#00E87A' : 'rgba(255,255,255,0.2)' }}>
          {data.clinicModel === 'single' && <div className="w-2.5 h-2.5 rounded-full bg-green-400" />}
        </div>
      </button>

      {/* Multi-clinic option */}
      <button type="button" onClick={() => {
        onChange({ clinicModel: 'multi', clinics: data.clinics.length > 0 ? data.clinics : [newClinic()] })
      }}
        className="flex items-start gap-4 p-4 rounded-xl border text-left transition-all"
        style={{
          borderColor: data.clinicModel === 'multi' ? 'rgba(0,232,122,0.4)' : 'rgba(255,255,255,0.07)',
          background:  data.clinicModel === 'multi' ? 'rgba(0,232,122,0.08)' : 'rgba(255,255,255,0.02)',
        }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: data.clinicModel === 'multi' ? 'rgba(0,232,122,0.12)' : 'rgba(255,255,255,0.05)' }}>
          🏗️
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold" style={{ color: data.clinicModel === 'multi' ? '#00E87A' : '#F0F5F2' }}>
              Multiple Clinics / Departments
            </span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(0,232,122,0.12)', color: '#00E87A', border: '1px solid rgba(0,232,122,0.25)' }}>
              Growth+
            </span>
          </div>
          <div className="text-xs text-[#7A9089] leading-relaxed">
            Your facility runs several departments (OPD, Surgery, Cardiology, etc.), each with their own
            sub-admin, doctors, and patient queue. Best for large hospitals and multi-specialty centres.
          </div>
        </div>
        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
          style={{ borderColor: data.clinicModel === 'multi' ? '#00E87A' : 'rgba(255,255,255,0.2)' }}>
          {data.clinicModel === 'multi' && <div className="w-2.5 h-2.5 rounded-full bg-green-400" />}
        </div>
      </button>

      {/* Clinic list (only when multi selected) */}
      {data.clinicModel === 'multi' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[#F0F5F2]">Define your clinics / departments</div>
              <div className="text-xs text-[#7A9089] mt-0.5">You can add or rename these later from your dashboard</div>
            </div>
            <button type="button" onClick={addClinic}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(0,232,122,0.1)', color: '#00E87A', border: '1px solid rgba(0,232,122,0.25)' }}>
              + Add Clinic
            </button>
          </div>

          {/* Suggestion chips */}
          <div>
            <div className="text-xs text-[#4A6058] mb-2">Quick add:</div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_CLINICS.filter(ex => !data.clinics.some(c => c.name === ex)).map(ex => (
                <button key={ex} type="button"
                  onClick={() => onChange({ clinics: [...data.clinics, { id: Math.random().toString(36).slice(2), name: ex, description: '' }] })}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#7A9089', background: 'rgba(255,255,255,0.03)' }}>
                  + {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
            {data.clinics.map((clinic, idx) => (
              <div key={clinic.id} className="flex items-center gap-2 p-3 rounded-xl border"
                style={{ borderColor: clinic.name ? 'rgba(0,232,122,0.2)' : 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'rgba(0,232,122,0.12)', color: '#00E87A' }}>
                  {idx + 1}
                </div>
                <input
                  value={clinic.name}
                  onChange={e => updateClinic(clinic.id, 'name', e.target.value)}
                  placeholder="e.g. OPD Clinic, General Surgery Clinic…"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-[#4A6058] outline-none"
                />
                <button type="button" onClick={() => removeClinic(clinic.id)}
                  className="text-[#4A6058] hover:text-red-400 transition-colors text-sm shrink-0">
                  ✕
                </button>
              </div>
            ))}
          </div>

          {data.clinics.filter(c => c.name.trim()).length === 0 && (
            <p className="text-xs text-amber-400">Add at least one clinic name to continue</p>
          )}
          {data.clinics.filter(c => c.name.trim()).length > 0 && (
            <p className="text-xs text-green-400">
              {data.clinics.filter(c => c.name.trim()).length} clinic{data.clinics.filter(c => c.name.trim()).length !== 1 ? 's' : ''} defined
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 5: Specialties ───────────────────────────────────────────────────────

function StepSpecialties({ data, onChange, specialties }: { data: FormData; onChange: (d: Partial<FormData>) => void; specialties: Specialty[] }) {
  const toggle = (id: string) => {
    const ids = data.specialtyIds.includes(id)
      ? data.specialtyIds.filter(s => s !== id)
      : [...data.specialtyIds, id]
    onChange({ specialtyIds: ids })
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">What do you specialise in?</h2>
        <p className="text-sm text-[#7A9089]">Select all that apply — patients filter by specialty</p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
        {specialties.map(s => {
          const selected = data.specialtyIds.includes(s.id)
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)}
              className="flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all"
              style={{
                borderColor: selected ? 'rgba(0,232,122,0.4)' : 'rgba(255,255,255,0.07)',
                background:  selected ? 'rgba(0,232,122,0.08)' : 'rgba(255,255,255,0.02)',
              }}>
              <span className="text-xl">{s.icon}</span>
              <span className="text-sm font-medium" style={{ color: selected ? '#00E87A' : '#F0F5F2' }}>{s.name}</span>
              {selected && <span className="ml-auto text-green-400 text-xs">✓</span>}
            </button>
          )
        })}
      </div>
      {data.specialtyIds.length > 0 && (
        <p className="text-sm text-green-400">{data.specialtyIds.length} specialty{data.specialtyIds.length !== 1 ? 'ies' : 'y'} selected</p>
      )}
    </div>
  )
}

// ── Step 6: Features ──────────────────────────────────────────────────────────

function StepFeatures({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  const features = [
    { key: 'accepts_virtual',  icon: '💻', label: 'Virtual Consultations',  desc: 'Patients can book and attend appointments via video call' },
    { key: 'emergency_hours',  icon: '🚨', label: '24/7 Emergency Services', desc: 'You provide round-the-clock emergency care' },
  ] as const
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Additional Features</h2>
        <p className="text-sm text-[#7A9089]">Let patients know what you offer beyond in-person visits</p>
      </div>
      <div className="flex flex-col gap-3">
        {features.map(f => {
          const enabled = data[f.key]
          return (
            <button key={f.key} type="button" onClick={() => onChange({ [f.key]: !enabled })}
              className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
              style={{
                borderColor: enabled ? 'rgba(0,232,122,0.4)' : 'rgba(255,255,255,0.07)',
                background:  enabled ? 'rgba(0,232,122,0.08)' : 'rgba(255,255,255,0.02)',
              }}>
              <span className="text-3xl">{f.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: enabled ? '#00E87A' : '#F0F5F2' }}>{f.label}</div>
                <div className="text-xs text-[#4A6058] mt-0.5">{f.desc}</div>
              </div>
              <div className="w-10 h-6 rounded-full relative transition-all" style={{ background: enabled ? '#00E87A' : 'rgba(255,255,255,0.1)' }}>
                <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
                  style={{ left: enabled ? 22 : 4 }} />
              </div>
            </button>
          )
        })}
      </div>
      <div className="p-4 rounded-xl border border-white/7 bg-white/2">
        <p className="text-xs text-[#7A9089] leading-relaxed">
          <span className="font-semibold text-[#F0F5F2]">EMR Integration</span> is available on the Growth and Enterprise plans.
          You can connect your existing system (OpenMRS, Epic, Meditech) after completing setup.
        </p>
      </div>
    </div>
  )
}

// ── Step 7: Operating Hours ───────────────────────────────────────────────────

function StepHours({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  const updateHour = (day: number, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    const hours = data.hours.map(h => h.day === day ? { ...h, [field]: value } : h)
    onChange({ hours })
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">Operating Hours</h2>
        <p className="text-sm text-[#7A9089]">Set when patients can book appointments</p>
      </div>
      <div className="flex flex-col gap-2">
        {data.hours.map(h => (
          <div key={h.day} className="flex items-center gap-3 p-3 rounded-xl border border-white/7 bg-white/2">
            <span className="text-sm font-medium w-24 shrink-0" style={{ color: h.closed ? '#4A6058' : '#F0F5F2' }}>
              {DAYS[h.day].slice(0, 3)}
            </span>
            {h.closed ? (
              <span className="text-xs text-[#4A6058] flex-1">Closed</span>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <input type="time" value={h.open} onChange={e => updateHour(h.day, 'open', e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-green-500/50" />
                <span className="text-[#4A6058] text-xs">to</span>
                <input type="time" value={h.close} onChange={e => updateHour(h.day, 'close', e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-green-500/50" />
              </div>
            )}
            <button type="button" onClick={() => updateHour(h.day, 'closed', !h.closed)}
              className="text-xs shrink-0 px-2 py-1 rounded-lg border transition-all"
              style={{
                borderColor: h.closed ? 'rgba(0,232,122,0.3)' : 'rgba(255,255,255,0.1)',
                color: h.closed ? '#00E87A' : '#4A6058',
              }}>
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
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">Choose your plan</h2>
        <p className="text-sm text-[#7A9089]">Start free for 3 months — upgrade or cancel anytime</p>
      </div>

      {clinicModel === 'multi' && (
        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-2">
          <span className="text-sm mt-0.5">⚠️</span>
          <p className="text-xs text-amber-400">
            You selected <strong>Multiple Clinics</strong>. This feature requires the <strong>Growth plan or higher</strong>.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
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
              className="text-left p-4 rounded-xl border transition-all relative"
              style={{
                borderColor: selected ? 'rgba(0,232,122,0.5)' : isGrowth ? 'rgba(0,232,122,0.2)' : 'rgba(255,255,255,0.07)',
                background:  selected ? 'rgba(0,232,122,0.1)' : isGrowth ? 'rgba(0,232,122,0.04)' : 'rgba(255,255,255,0.02)',
                opacity: lockedForMulti ? 0.45 : 1,
                cursor: lockedForMulti ? 'not-allowed' : 'pointer',
              }}>
              {isGrowth && !selected && (
                <span className="absolute top-3 right-3 text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">Popular</span>
              )}
              {lockedForMulti && (
                <span className="absolute top-3 right-3 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Upgrade needed</span>
              )}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-bold" style={{ color: selected ? '#00E87A' : '#F0F5F2' }}>{plan.display_name}</div>
                  <div className="text-xs text-[#4A6058] mt-0.5">
                    {plan.max_doctors ? `Up to ${plan.max_doctors} doctors` : 'Unlimited doctors'} · {plan.max_monthly_bookings ? `${plan.max_monthly_bookings?.toLocaleString()} bookings/mo` : 'Unlimited bookings'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm" style={{ color: selected ? '#00E87A' : '#F0F5F2' }}>
                    ₦{plan.price_monthly.toLocaleString()}<span className="font-normal text-[#4A6058]">/mo</span>
                  </div>
                  {plan.price_annual && (
                    <div className="text-xs text-green-400">₦{plan.price_annual.toLocaleString()} annually</div>
                  )}
                </div>
              </div>
              <ul className="flex flex-col gap-1 mt-3">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-[#7A9089]">
                    <span className="text-green-500">✓</span> {f}
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
    name: '', type: 'hospital', description: '',
    registrationNumber: '', mdcnNumber: '',
    address: '', city: '', state: '', phone: '', email: '', whatsapp: '',
    clinicModel: 'single', clinics: [],
    specialtyIds: [],
    accepts_virtual: false, emergency_hours: false,
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
          name: data.name, type: data.type, description: data.description,
          registrationNumber: data.registrationNumber, mdcnNumber: data.mdcnNumber,
          address: data.address, city: data.city, state: data.state,
          phone: data.phone, email: data.email, whatsapp: data.whatsapp,
          clinicModel: data.clinicModel,
          clinics: data.clinics.filter(c => c.name.trim()),
          accepts_virtual: data.accepts_virtual, emergency_hours: data.emergency_hours,
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
    <div className="min-h-screen bg-[#060A07] flex items-start justify-center p-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-2xl font-bold tracking-tight mb-0.5">Queue</div>
          <div className="text-xs text-[#4A6058] tracking-widest uppercase">Hospital Registration</div>
        </div>

        <div className="bg-[#111915] border border-white/7 rounded-2xl p-6">
          <StepBar current={step} total={TOTAL_STEPS} />
          {steps[step]}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-4">
              {error}
            </p>
          )}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">Back</Button>
            )}
            {step < TOTAL_STEPS - 1 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="flex-1">
                Continue
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={loading} disabled={!canProceed()} className="flex-1">
                Complete Setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
