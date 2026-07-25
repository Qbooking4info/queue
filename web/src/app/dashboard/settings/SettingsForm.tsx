'use client'
import { useState, useTransition } from 'react'
import { Video, AlertTriangle, Check } from 'lucide-react'
import { updateHospitalProfile, upsertOperatingHours } from './actions'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

interface Hour { day_of_week: number; open_time: string; close_time: string }
interface Hospital {
  id: string; phone: string | null; email: string | null; whatsapp: string | null
  description: string | null; address: string; accepts_virtual: boolean | null
  emergency_hours: boolean | null
}

export function SettingsForm({ hospital, hours }: { hospital: Hospital; hours: Hour[] }) {
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

  return (
    <div className="flex flex-col gap-4">
      {/* Contact & Profile Edit */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5">
        <h2 className="font-bold mb-4">Edit Profile</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {[
            { name: 'phone',       label: 'Phone',       placeholder: '+234...' },
            { name: 'email',       label: 'Email',       placeholder: 'hospital@example.com' },
            { name: 'whatsapp',    label: 'WhatsApp',    placeholder: '+234...' },
            { name: 'address',     label: 'Address',     placeholder: '123 Hospital Rd' },
          ].map(f => (
            <div key={f.name}>
              <label className="text-xs text-[#7A9089] mb-1 block">{f.label}</label>
              <input
                name={f.name}
                defaultValue={(hospital as unknown as Record<string, string | null>)[f.name] ?? ''}
                placeholder={f.placeholder}
                className="w-full bg-[#0A0F0D] border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500/50"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-[#7A9089] mb-1 block">Description</label>
            <textarea
              name="description"
              defaultValue={hospital.description ?? ''}
              rows={3}
              placeholder="Brief description of your hospital..."
              className="w-full bg-[#0A0F0D] border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500/50 resize-none"
            />
          </div>
          <div className="flex gap-4">
            {[
              { name: 'accepts_virtual', icon: <Video size={14} />,         label: 'Virtual Consultations', value: hospital.accepts_virtual },
              { name: 'emergency_hours', icon: <AlertTriangle size={14} />, label: '24/7 Emergency',        value: hospital.emergency_hours },
            ].map(f => (
              <label key={f.name} className="flex items-center gap-2 cursor-pointer">
                <input type="hidden" name={f.name} value="false" />
                <input type="checkbox" name={f.name} value="true" defaultChecked={!!f.value}
                  className="accent-green-500 w-4 h-4" />
                <span className="inline-flex items-center gap-1.5 text-sm">{f.icon} {f.label}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button type="submit" disabled={pending}
              className="px-5 py-2 bg-green-500 hover:bg-green-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
              {pending ? 'Saving…' : 'Save Changes'}
            </button>
            {saved && <span className="inline-flex items-center gap-1 text-sm text-green-400"><Check size={14} /> Saved</span>}
            {saveErr && <span className="text-sm text-red-400">{saveErr}</span>}
          </div>
        </form>
      </section>

      {/* Operating Hours Edit */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5">
        <h2 className="font-bold mb-4">Operating Hours</h2>
        <div className="flex flex-col gap-2">
          {DAYS.map((day, i) => {
            const s = hourState[i]
            return (
              <div key={day} className="flex items-center gap-3 py-2 border-b border-white/5 flex-wrap">
                <span className="text-sm text-[#7A9089] w-24 shrink-0">{day}</span>
                <label className="flex items-center gap-1.5 text-xs text-[#4A6058]">
                  <input type="checkbox" checked={s.closed}
                    onChange={e => setHourState(prev => ({ ...prev, [i]: { ...prev[i], closed: e.target.checked } }))}
                    className="accent-green-500" />
                  Closed
                </label>
                {!s.closed && (
                  <>
                    <input type="time" value={s.open}
                      onChange={e => setHourState(prev => ({ ...prev, [i]: { ...prev[i], open: e.target.value } }))}
                      className="bg-[#0A0F0D] border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-500/50" />
                    <span className="text-[#4A6058] text-xs">–</span>
                    <input type="time" value={s.close}
                      onChange={e => setHourState(prev => ({ ...prev, [i]: { ...prev[i], close: e.target.value } }))}
                      className="bg-[#0A0F0D] border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-green-500/50" />
                  </>
                )}
                <button disabled={hoursPending} onClick={() => handleHourSave(i)}
                  className="ml-auto text-xs text-green-400 border border-green-500/30 px-3 py-1 rounded-lg hover:bg-green-500/10 transition-all disabled:opacity-50">
                  Save
                </button>
              </div>
            )
          })}
        </div>
        {hourErr && <p className="text-sm text-red-400 mt-2">{hourErr}</p>}
      </section>
    </div>
  )
}
