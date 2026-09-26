'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const SYMPTOMS = [
  'Chest pain / difficulty breathing', 'Severe bleeding', 'High fever (39°C+)',
  'Severe abdominal pain', 'Head injury / loss of consciousness',
  'Allergic reaction', 'Stroke symptoms', 'Severe burns',
]

// Mirrors packages/shared/lib/ambulance-api.ts's SYMPTOM_TRIAGE_MAP -- this
// modal has no access to that shared package (web has its own dependency
// tree), so the same small mapping is kept here. Keep in sync if either changes.
const TRIAGE_MAP: Record<string, { level: number; tier: string }> = {
  'Chest pain / difficulty breathing':   { level: 1, tier: 'ALS' },
  'Stroke symptoms':                     { level: 1, tier: 'ALS' },
  'Head injury / loss of consciousness': { level: 1, tier: 'ALS' },
  'Severe bleeding':                     { level: 2, tier: 'ALS' },
  'Severe burns':                        { level: 2, tier: 'ALS' },
  'Allergic reaction':                   { level: 2, tier: 'BLS' },
  'Severe abdominal pain':               { level: 3, tier: 'BLS' },
  'High fever (39°C+)':                  { level: 3, tier: 'BLS' },
}

interface FoundPatient { id: string; full_name: string; phone: string; patient_number: string }

/** "+ Request Ambulance" from the dashboard -- front desk/admin arranging
 *  transport for a caller or a walk-in, using the same staff-initiated path
 *  the hospital and doctor apps use (POST /api/transport/request). */
export function RequestAmbulanceModal({ C, hospitalId, onClose }: { C: any; hospitalId: string; onClose: (bookingRef?: string) => void }) {
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [foundPatient, setFoundPatient] = useState<FoundPatient | null>(null)
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')

  const [symptom, setSymptom] = useState('')
  const [customSymptom, setCustomSymptom] = useState('')
  const [address, setAddress] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function lookUp() {
    if (!lookupQuery.trim()) return
    setLookupBusy(true); setError('')
    const isPhone = /\d/.test(lookupQuery)
    const param = isPhone ? `phone=${encodeURIComponent(lookupQuery.trim())}` : `patientNumber=${encodeURIComponent(lookupQuery.trim())}`
    const res = await fetch(`/api/appointments/walkin?${param}`)
    const body = await res.json().catch(() => null)
    setLookupBusy(false)
    if (body?.found && body.patient) {
      setFoundPatient(body.patient)
      setPatientName(body.patient.full_name)
      setPatientPhone(body.patient.phone)
    } else {
      setFoundPatient(null)
      setError('No registered patient matched that. Enter their details below as a walk-in.')
    }
  }

  async function geocode() {
    if (!address.trim()) return
    setGeocoding(true); setError('')
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
      const data = await res.json() as { lat: string; lon: string } | null
      if (!data) { setError('Address not found — try a more specific query'); return }
      setCoords({ lat: parseFloat(data.lat), lng: parseFloat(data.lon) })
    } finally {
      setGeocoding(false)
    }
  }

  async function submit() {
    setError('')
    if (!foundPatient && !patientName.trim()) { setError('Enter the patient\'s name.'); return }
    if (!symptom && !customSymptom.trim()) { setError('Select or describe the condition.'); return }
    if (!coords) { setError('Look up a pickup address first.'); return }

    const triage = TRIAGE_MAP[symptom] ?? { level: 3, tier: 'BLS' }
    setSubmitting(true)
    try {
      const res = await fetch('/api/transport/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'emergency',
          triageLevel: triage.level,
          requiredTier: triage.tier,
          lat: coords.lat,
          lng: coords.lng,
          pickupAddress: address.trim() || undefined,
          // Requesting from this hospital's own console defaults to bringing the
          // patient here -- dispatch still picks whichever unit is actually
          // nearest, this only sets where they're brought.
          destinationHospitalId: hospitalId,
          contactPhone: patientPhone.trim() || undefined,
          symptomDescription: symptom || customSymptom,
          patientId: foundPatient?.id,
          walkinPatientName: foundPatient ? undefined : patientName.trim(),
          walkinPatientPhone: foundPatient ? undefined : (patientPhone.trim() || undefined),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? 'Could not request an ambulance'); return }
      onClose(body.request?.booking_ref)
    } finally {
      setSubmitting(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.bgAlt,
    color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: C.textMuted,
    marginBottom: 6, marginTop: 14, letterSpacing: '.04em', textTransform: 'uppercase',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Request Ambulance</div>
          <button onClick={() => onClose()} aria-label="Close" style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: C.textSub, marginBottom: 4 }}>Dispatch matches the nearest available unit, same as a patient&apos;s own request.</div>

        <label style={lbl}>Patient</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={lookupQuery} onChange={e => setLookupQuery(e.target.value)} placeholder="Phone or patient ID" style={inp} />
          <button onClick={lookUp} disabled={lookupBusy || !lookupQuery.trim()}
            style={{ padding: '0 16px', borderRadius: 10, border: `1px solid ${C.borderMed}`, background: C.bgAlt, fontSize: 13, color: C.textSub, cursor: 'pointer', fontFamily: 'inherit' }}>
            {lookupBusy ? '…' : 'Find'}
          </button>
        </div>
        {foundPatient && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.accent }}>Found: {foundPatient.full_name} · {foundPatient.patient_number}</div>
        )}
        <input value={patientName} onChange={e => { setPatientName(e.target.value); setFoundPatient(null) }} placeholder="Patient full name" style={{ ...inp, marginTop: 10 }} />
        <input value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="Contact phone" style={{ ...inp, marginTop: 10 }} />

        <label style={lbl}>Condition</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {SYMPTOMS.map(sym => {
            const active = symptom === sym
            return (
              <button key={sym} type="button" onClick={() => setSymptom(active ? '' : sym)}
                style={{ fontSize: 11.5, padding: '6px 11px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active ? C.red + '55' : C.border}`, background: active ? C.redLight : C.bgAlt, color: active ? C.red : C.textSub }}>
                {sym}
              </button>
            )
          })}
        </div>
        <textarea value={customSymptom} onChange={e => setCustomSymptom(e.target.value)} placeholder="Or describe the condition…" rows={2}
          style={{ ...inp, resize: 'vertical' }} />

        <label style={lbl}>Pickup location</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address" style={{ ...inp, flex: 1 }} />
          <button onClick={geocode} disabled={geocoding}
            style={{ padding: '0 16px', borderRadius: 10, border: `1px solid ${C.borderMed}`, background: C.bgAlt, fontSize: 13, color: C.textSub, cursor: 'pointer', fontFamily: 'inherit' }}>
            {geocoding ? '…' : 'Find'}
          </button>
        </div>
        {coords && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Location found: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</div>}

        {error && (
          <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 8, background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)', color: '#f07070', fontSize: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <Button onClick={() => onClose()} variant="outline" size="sm">Cancel</Button>
          <Button onClick={submit} loading={submitting} size="sm">Request Ambulance</Button>
        </div>
      </div>
    </div>
  )
}
