'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Calendar, Monitor } from 'lucide-react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DURATIONS = [15, 20, 30, 45, 60]
const HORIZONS  = [14, 30, 60, 90]

interface Slot {
  id: string; slot_date: string; start_time: string; end_time: string
  is_virtual: boolean; booked_count: number; is_available: boolean
}

interface GroupedDay { date: string; inPerson: Slot[]; virtual: Slot[] }

function groupByDate(slots: Slot[]): GroupedDay[] {
  const map = new Map<string, GroupedDay>()
  for (const s of slots) {
    if (!map.has(s.slot_date))
      map.set(s.slot_date, { date: s.slot_date, inPerson: [], virtual: [] })
    if (s.is_virtual) map.get(s.slot_date)!.virtual.push(s)
    else              map.get(s.slot_date)!.inPerson.push(s)
  }
  return Array.from(map.values())
}

export default function DoctorSchedulePage() {
  const { id: doctorId } = useParams<{ id: string }>()

  const [workingDays, setWorkingDays]   = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime]       = useState('08:00')
  const [endTime, setEndTime]           = useState('17:00')
  const [slotDuration, setDuration]     = useState(30)
  const [daysAhead, setDaysAhead]       = useState(30)
  const [acceptsVirtual, setVirtual]    = useState(false)
  const [clearExisting, setClear]       = useState(false)

  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<{ inserted?: number; error?: string } | null>(null)
  const [slots, setSlots]       = useState<Slot[]>([])
  const [loadingSlots, setLS]   = useState(true)
  const [doctorName, setName]   = useState('')

  const fetchSlots = useCallback(async () => {
    setLS(true)
    const res = await fetch(`/api/doctors/schedule?doctor_id=${doctorId}`)
    const json = await res.json()
    setSlots(json.slots ?? [])
    setLS(false)
  }, [doctorId])

  useEffect(() => {
    fetchSlots()
    // Get doctor name from the page context via API
    fetch(`/api/doctors/schedule?doctor_id=${doctorId}`)
      .then(r => r.json())
  }, [doctorId, fetchSlots])

  function toggleDay(d: number) {
    setWorkingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  async function handleGenerate() {
    if (!workingDays.length) { setResult({ error: 'Select at least one working day.' }); return }
    if (startTime >= endTime) { setResult({ error: 'Start time must be before end time.' }); return }

    setLoading(true); setResult(null)
    const res = await fetch('/api/doctors/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctor_id: doctorId,
        working_days: workingDays,
        start_time: startTime,
        end_time: endTime,
        slot_duration: slotDuration,
        days_ahead: daysAhead,
        accepts_virtual: acceptsVirtual,
        clear_existing: clearExisting,
      }),
    })
    const json = await res.json()
    setResult(json)
    setLoading(false)
    if (json.success) fetchSlots()
  }

  const grouped = groupByDate(slots)
  const bookedCount = slots.filter(s => s.booked_count > 0).length

  return (
    <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/doctors" className="text-[#4A6058] hover:text-white text-sm transition-colors inline-flex items-center gap-1"><ArrowLeft size={14} /> Doctors</Link>
        <span className="text-[#4A6058]">/</span>
        <span className="text-sm text-[#7A9089]">Manage Schedule</span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Generator */}
        <div className="bg-[#111915] border border-white/7 rounded-2xl p-6 flex flex-col gap-5">
          <div>
            <h2 className="font-bold text-lg">Generate Time Slots</h2>
            <p className="text-sm text-[#7A9089] mt-0.5">Set the doctor's weekly schedule and generate bookable slots</p>
          </div>

          {/* Working days */}
          <div>
            <label className="text-xs font-semibold text-[#7A9089] uppercase tracking-wider block mb-2">Working Days</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((day, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                  style={{
                    borderColor: workingDays.includes(i) ? 'rgba(0,232,122,0.5)' : 'rgba(255,255,255,0.1)',
                    background:  workingDays.includes(i) ? 'rgba(0,232,122,0.1)' : 'rgba(255,255,255,0.03)',
                    color:       workingDays.includes(i) ? '#00E87A' : '#7A9089',
                  }}>
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#7A9089] uppercase tracking-wider block mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#7A9089] uppercase tracking-wider block mb-1.5">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50" />
            </div>
          </div>

          {/* Slot duration */}
          <div>
            <label className="text-xs font-semibold text-[#7A9089] uppercase tracking-wider block mb-2">Slot Duration</label>
            <div className="flex gap-2">
              {DURATIONS.map(d => (
                <button key={d} type="button" onClick={() => setDuration(d)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold border transition-all"
                  style={{
                    borderColor: slotDuration === d ? 'rgba(0,232,122,0.5)' : 'rgba(255,255,255,0.1)',
                    background:  slotDuration === d ? 'rgba(0,232,122,0.1)' : 'rgba(255,255,255,0.03)',
                    color:       slotDuration === d ? '#00E87A' : '#7A9089',
                  }}>
                  {d}m
                </button>
              ))}
            </div>
          </div>

          {/* Days ahead */}
          <div>
            <label className="text-xs font-semibold text-[#7A9089] uppercase tracking-wider block mb-2">Generate For</label>
            <div className="flex gap-2">
              {HORIZONS.map(d => (
                <button key={d} type="button" onClick={() => setDaysAhead(d)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold border transition-all"
                  style={{
                    borderColor: daysAhead === d ? 'rgba(0,232,122,0.5)' : 'rgba(255,255,255,0.1)',
                    background:  daysAhead === d ? 'rgba(0,232,122,0.1)' : 'rgba(255,255,255,0.03)',
                    color:       daysAhead === d ? '#00E87A' : '#7A9089',
                  }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2">
            {[
              { key: 'virtual', label: 'Also generate virtual slots', value: acceptsVirtual, set: setVirtual },
              { key: 'clear',   label: 'Clear existing unbooked slots first', value: clearExisting, set: setClear },
            ].map(({ key, label, value, set }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => set(!value)}
                  className="w-9 h-5 rounded-full relative transition-colors shrink-0"
                  style={{ background: value ? '#00E87A' : 'rgba(255,255,255,0.1)' }}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    style={{ left: value ? 20 : 2 }} />
                </div>
                <span className="text-sm text-[#7A9089]">{label}</span>
              </label>
            ))}
          </div>

          {/* Preview */}
          <div className="bg-white/3 rounded-xl p-3 text-xs text-[#7A9089]">
            <span className="text-white font-semibold">Preview: </span>
            {workingDays.length} day{workingDays.length !== 1 ? 's' : ''}/week ·{' '}
            {Math.floor((
              (parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])) -
              (parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]))
            ) / slotDuration)} slots/day ·{' '}
            ~{Math.round(
              workingDays.length * (daysAhead / 7) *
              Math.floor((
                (parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])) -
                (parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]))
              ) / slotDuration) * (acceptsVirtual ? 2 : 1)
            )} total slots
          </div>

          {result && (
            result.error
              ? <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{result.error}</p>
              : <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 size={14} /> Generated {result.inserted} slots successfully
                </p>
          )}

          <button onClick={handleGenerate} disabled={loading}
            className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold text-sm transition-all">
            {loading ? 'Generating…' : 'Generate Schedule'}
          </button>
        </div>

        {/* Existing slots preview */}
        <div className="bg-[#111915] border border-white/7 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-lg">Upcoming Slots</h2>
              <p className="text-xs text-[#4A6058] mt-0.5">{slots.length} total · {bookedCount} booked</p>
            </div>
          </div>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-12 text-[#4A6058] text-sm">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar size={36} className="mb-3 text-[#4A6058]" />
              <div className="text-sm text-[#7A9089] font-medium">No slots generated yet</div>
              <div className="text-xs text-[#4A6058] mt-1">Use the form to create a schedule</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
              {grouped.map(({ date, inPerson, virtual }) => {
                const d = new Date(date + 'T00:00:00')
                const label = d.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })
                const bookedDay = [...inPerson, ...virtual].filter(s => s.booked_count > 0).length
                return (
                  <div key={date} className="border border-white/7 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">{label}</span>
                      {bookedDay > 0 && (
                        <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">{bookedDay} booked</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {inPerson.map(s => (
                        <span key={s.id}
                          className={`text-xs px-2 py-0.5 rounded-lg border ${s.booked_count > 0 ? 'text-amber-400 border-amber-500/30 bg-amber-500/8' : 'text-[#4A6058] border-white/7 bg-white/3'}`}>
                          {s.start_time.slice(0, 5)}
                        </span>
                      ))}
                      {virtual.length > 0 && (
                        <>
                          <span className="text-xs text-[#4A6058] px-1">·</span>
                          {virtual.map(s => (
                            <span key={s.id}
                              className={`text-xs px-2 py-0.5 rounded-lg border inline-flex items-center gap-1 ${s.booked_count > 0 ? 'text-amber-400 border-amber-500/30 bg-amber-500/8' : 'text-blue-400 border-blue-500/20 bg-blue-500/5'}`}>
                              <Monitor size={11} /> {s.start_time.slice(0, 5)}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
