'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Specialty, SubscriptionPlan } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Types ───────────────────────────────────────────────────────────────────

type HospitalType = 'hospital' | 'clinic' | 'specialist_center' | 'diagnostic'

interface FormData {
  // Step 1 — Basics
  name: string; type: HospitalType; description: string
  // Step 2 — Contact & Location
  address: string; city: string; state: string
  phone: string; email: string; whatsapp: string
  // Step 3 — Specialties
  specialtyIds: string[]
  // Step 4 — Services & Features
  accepts_virtual: boolean; emergency_hours: boolean
  // Step 5 — Operating Hours
  hours: { day: number; open: string; close: string; closed: boolean }[]
  // Step 6 — Plan
  planId: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const HOSPITAL_TYPES: { value: HospitalType; label: string; icon: string; desc: string }[] = [
  { value: 'hospital',          label: 'General Hospital',     icon: '🏥', desc: 'Full-service multi-specialty care' },
  { value: 'clinic',            label: 'Clinic',               icon: '🩺', desc: 'Outpatient consultations & GP care' },
  { value: 'specialist_center', label: 'Specialist Centre',    icon: '🔬', desc: 'Focused specialty practice' },
  { value: 'diagnostic',        label: 'Diagnostic Centre',    icon: '📡', desc: 'Lab, imaging & diagnostics' },
]

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun',
  'Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

// ── Step Progress Bar ────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  const steps = ['Basics', 'Location', 'Specialties', 'Features', 'Hours', 'Plan']
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
        <span className="text-xs font-medium text-green-400">{steps[current]}</span>
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
        <label className="text-sm font-medium text-gray-300 block mb-1.5">Description <span className="text-[#4A6058] font-normal">(optional)</span></label>
        <textarea value={data.description} onChange={e => onChange({ description: e.target.value })}
          placeholder="Briefly describe your facility, key strengths, and what patients can expect…"
          rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all" />
      </div>
    </div>
  )
}

// ── Step 2: Contact & Location ────────────────────────────────────────────────

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
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all">
            <option value="">Select state</option>
            {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
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

// ── Step 3: Specialties ───────────────────────────────────────────────────────

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
        <p className="text-sm text-green-400">{data.specialtyIds.length} {data.specialtyIds.length !== 1 ? 'specialties' : 'specialty'} selected</p>
      )}
    </div>
  )
}

// ── Step 4: Features ──────────────────────────────────────────────────────────

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

// ── Step 5: Operating Hours ───────────────────────────────────────────────────

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

// ── Step 6: Subscription Plan ─────────────────────────────────────────────────

function StepPlan({ data, onChange, plans }: { data: FormData; onChange: (d: Partial<FormData>) => void; plans: SubscriptionPlan[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">Choose your plan</h2>
        <p className="text-sm text-[#7A9089]">Start free for 3 months — upgrade or cancel anytime</p>
      </div>
      <div className="flex flex-col gap-3">
        {plans.map(plan => {
          const features = plan.features as string[]
          const selected = data.planId === plan.id
          const isGrowth = plan.name === 'growth'
          return (
            <button key={plan.id} type="button" onClick={() => onChange({ planId: plan.id })}
              className="text-left p-4 rounded-xl border transition-all relative"
              style={{
                borderColor: selected ? 'rgba(0,232,122,0.5)' : isGrowth ? 'rgba(0,232,122,0.2)' : 'rgba(255,255,255,0.07)',
                background:  selected ? 'rgba(0,232,122,0.1)' : isGrowth ? 'rgba(0,232,122,0.04)' : 'rgba(255,255,255,0.02)',
              }}>
              {isGrowth && !selected && (
                <span className="absolute top-3 right-3 text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">Popular</span>
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
  const router = useRouter()
  const supabase = createClient()
  const TOTAL_STEPS = 6

  const [step, setStep]           = useState(0)
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [plans, setPlans]         = useState<SubscriptionPlan[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [data, setData]           = useState<FormData>({
    name: '', type: 'hospital', description: '',
    address: '', city: '', state: '', phone: '', email: '', whatsapp: '',
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
    if (step === 1) return data.address.trim() && data.city.trim() && data.state && data.phone.trim()
    if (step === 2) return data.specialtyIds.length > 0
    if (step === 5) return !!data.planId
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
          address: data.address, city: data.city, state: data.state,
          phone: data.phone, email: data.email, whatsapp: data.whatsapp,
          accepts_virtual: data.accepts_virtual, emergency_hours: data.emergency_hours,
          specialtyIds: data.specialtyIds,
          hours: data.hours,
          planId: data.planId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Server error')

      router.push('/dashboard?welcome=true')
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (e as { message?: string })?.message
          ?? (e as { details?: string })?.details
          ?? JSON.stringify(e)
      setError(msg)
      setLoading(false)
    }
  }

  const steps = [
    <StepBasics key="basics" data={data} onChange={update} />,
    <StepLocation key="location" data={data} onChange={update} />,
    <StepSpecialties key="specialties" data={data} onChange={update} specialties={specialties} />,
    <StepFeatures key="features" data={data} onChange={update} />,
    <StepHours key="hours" data={data} onChange={update} />,
    <StepPlan key="plan" data={data} onChange={update} plans={plans} />,
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
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-4">{error}</p>}
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
