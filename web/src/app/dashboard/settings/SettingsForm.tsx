'use client'
import { useState, useTransition } from 'react'
import { Video, AlertTriangle, Check } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { updateHospitalProfile, upsertOperatingHours } from './actions'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

interface Hour { day_of_week: number; open_time: string; close_time: string }
interface Hospital {
  id: string; phone: string | null; email: string | null; whatsapp: string | null
  description: string | null; address: string; accepts_virtual: boolean | null
  emergency_hours: boolean | null
}

// Never called useTheme() -- every color was either a static Tailwind class or a
// literal hex that happened to equal forest's values exactly (#111915/#7A9089/
// #0A0F0D/#4A6058 are forest.card/textSub/bg/textMuted verbatim), so this always
// rendered dark regardless of the clinical/forest toggle. Input focus rings are left
// as the static Tailwind green -- a transient, interaction-only accent, not an
// always-visible mismatch, and not worth per-input focus-state tracking to theme.
export function SettingsForm({ hospital, hours }: { hospital: Hospital; hours: Hour[] }) {
  const { theme: C } = useTheme()
  const [saved, setSaved]       = useState(false)
  const [saveErr, setSaveErr]   = useState<string | null>(null)
  const [hourErr, setHourErr]   = useState<string | null>(null)
  const [pending, start]        = useTransition()
  const [hoursPending, startHours] = useTransition()
  const [hourState, setHourState] = useState<Record<number, { open: string; close: string; closed: boolean }>>(
    Object.fromEntries(DAYS.map((_, i) => {
      const h = hours.find(oh => oh.day_of_week === i)
      return [i, { open: h?.open_time?.slice(0,5) ?? '08:00', close: h?.close_time?.slice(0,5) ?? '17:00', closed: !h }]
    }))
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaveErr(null)
    start(async () => {
      try {
        await updateHospitalProfile(new FormData(e.currentTarget))
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (err) {
        setSaveErr(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  function handleHourSave(day: number) {
    const s = hourState[day]
    setHourErr(null)
    startHours(async () => {
      try {
        await upsertOperatingHours(hospital.id, day, s.open, s.close, s.closed)
      } catch (err) {
        setHourErr(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  const inputClass = "w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500/50"
  const inputStyle = { background: C.bg, border: `1px solid ${C.borderMed}`, color: C.text }

  return (
    <div className="flex flex-col gap-4">
      {/* Contact & Profile Edit */}
      <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <h2 className="font-bold mb-4" style={{ color: C.text }}>Edit Profile</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {[
            { name: 'phone',       label: 'Phone',       placeholder: '+234...' },
            { name: 'email',       label: 'Email',       placeholder: 'hospital@example.com' },
            { name: 'whatsapp',    label: 'WhatsApp',    placeholder: '+234...' },
            { name: 'address',     label: 'Address',     placeholder: '123 Hospital Rd' },
          ].map(f => (
            <div key={f.name}>
              <label className="text-xs mb-1 block" style={{ color: C.textSub }}>{f.label}</label>
              <input
                name={f.name}
                defaultValue={(hospital as unknown as Record<string, string | null>)[f.name] ?? ''}
                placeholder={f.placeholder}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          ))}
          <div>
            <label className="text-xs mb-1 block" style={{ color: C.textSub }}>Description</label>
            <textarea
              name="description"
              defaultValue={hospital.description ?? ''}
              rows={3}
              placeholder="Brief description of your hospital..."
              className={`${inputClass} resize-none`}
              style={inputStyle}
            />
          </div>
          <div className="flex gap-4">
            {[
              { name: 'accepts_virtual', icon: <Video size={14} />,         label: 'Virtual Consultations', value: hospital.accepts_virtual },
              { name: 'emergency_hours', icon: <AlertTriangle size={14} />, label: '24/7 Emergency',        value: hospital.emergency_hours },
            ].map(f => (
              <label key={f.name} className="flex items-center gap-2 cursor-pointer" style={{ color: C.text }}>
                <input type="hidden" name={f.name} value="false" />
                <input type="checkbox" name={f.name} value="true" defaultChecked={!!f.value}
                  className="accent-green-500 w-4 h-4" />
                <span className="inline-flex items-center gap-1.5 text-sm">{f.icon} {f.label}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <Button type="submit" loading={pending} size="sm">Save Changes</Button>
            {saved && <span className="inline-flex items-center gap-1 text-sm" style={{ color: C.accent }}><Check size={14} /> Saved</span>}
            {saveErr && <span className="text-sm" style={{ color: C.red }}>{saveErr}</span>}
          </div>
        </form>
      </section>

      {/* Operating Hours Edit */}
      <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <h2 className="font-bold mb-4" style={{ color: C.text }}>Operating Hours</h2>
        <div className="flex flex-col gap-2">
          {DAYS.map((day, i) => {
            const s = hourState[i]
            return (
              <div key={day} className="flex items-center gap-3 py-2 flex-wrap" style={{ borderBottom: `1px solid ${C.border}` }}>
                <span className="text-sm w-24 shrink-0" style={{ color: C.textSub }}>{day}</span>
                <label className="flex items-center gap-1.5 text-xs" style={{ color: C.textMuted }}>
                  <input type="checkbox" checked={s.closed}
                    onChange={e => setHourState(prev => ({ ...prev, [i]: { ...prev[i], closed: e.target.checked } }))}
                    className="accent-green-500" />
                  Closed
                </label>
                {!s.closed && (
                  <>
                    <input type="time" value={s.open}
                      onChange={e => setHourState(prev => ({ ...prev, [i]: { ...prev[i], open: e.target.value } }))}
                      className="rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-500/50"
                      style={inputStyle} />
                    <span className="text-xs" style={{ color: C.textMuted }}>–</span>
                    <input type="time" value={s.close}
                      onChange={e => setHourState(prev => ({ ...prev, [i]: { ...prev[i], close: e.target.value } }))}
                      className="rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-500/50"
                      style={inputStyle} />
                  </>
                )}
                <Button
                  disabled={hoursPending} onClick={() => handleHourSave(i)}
                  variant="success" size="sm" className="ml-auto"
                >
                  Save
                </Button>
              </div>
            )
          })}
        </div>
        {hourErr && <p className="text-sm mt-2" style={{ color: C.red }}>{hourErr}</p>}
      </section>
    </div>
  )
}
