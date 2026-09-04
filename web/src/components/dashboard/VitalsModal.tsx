'use client'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import type { AdminAppointment } from '@/lib/admin-api'

function bmiOf(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: '#55A7EB' }
  if (bmi < 25)   return { label: 'Normal', color: '#00E87A' }
  if (bmi < 30)   return { label: 'Overweight', color: '#EF9F27' }
  return { label: 'Obese', color: '#f07070' }
}

export function VitalsModal({ appointment, onClose, onSaved }: {
  appointment: AdminAppointment
  onClose: () => void
  onSaved: () => void
}) {
  const { theme: C } = useTheme()
  const [weight,   setWeight]   = useState(appointment.vitals_weight_kg?.toString() ?? '')
  const [height,   setHeight]   = useState(appointment.vitals_height_cm?.toString() ?? '')
  const [systolic, setSystolic] = useState(appointment.vitals_bp_systolic?.toString() ?? '')
  const [diastolic,setDiastolic]= useState(appointment.vitals_bp_diastolic?.toString() ?? '')
  const [sugar,    setSugar]    = useState(appointment.vitals_blood_sugar?.toString() ?? '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const bmi = bmiOf(weight ? Number(weight) : null, height ? Number(height) : null)
  const cat = bmi != null ? bmiCategory(bmi) : null

  async function handleSave() {
    setSaving(true); setError('')
    const res = await fetch(`/api/appointments/${appointment.id}/vitals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weight_kg:    weight ? Number(weight) : null,
        height_cm:    height ? Number(height) : null,
        bp_systolic:  systolic ? Number(systolic) : null,
        bp_diastolic: diastolic ? Number(diastolic) : null,
        blood_sugar:  sugar ? Number(sugar) : null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? 'Could not save vitals')
      return
    }
    onSaved()
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 420, background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: '28px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Record Vitals</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{appointment.patient_name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.textMuted,
            fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Weight (kg)</label>
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
                placeholder="e.g. 68" min={0} step={0.1} style={inp} />
            </div>
            <div>
              <label style={lbl}>Height (cm)</label>
              <input type="number" value={height} onChange={e => setHeight(e.target.value)}
                placeholder="e.g. 170" min={0} step={0.1} style={inp} />
            </div>
          </div>

          {/* Live BMI preview */}
          {bmi != null && cat && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                BMI (auto-calculated)
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: cat.color }}>
                {bmi} · {cat.label}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>BP Systolic</label>
              <input type="number" value={systolic} onChange={e => setSystolic(e.target.value)}
                placeholder="e.g. 120" min={0} style={inp} />
            </div>
            <div>
              <label style={lbl}>BP Diastolic</label>
              <input type="number" value={diastolic} onChange={e => setDiastolic(e.target.value)}
                placeholder="e.g. 80" min={0} style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Blood Sugar (mg/dL)</label>
            <input type="number" value={sugar} onChange={e => setSugar(e.target.value)}
              placeholder="e.g. 95" min={0} step={0.1} style={inp} />
          </div>

          {error && (
            <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070',
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={onClose} variant="outline" style={{ flex: 1 }}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} style={{ flex: 2 }}>Save Vitals</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
