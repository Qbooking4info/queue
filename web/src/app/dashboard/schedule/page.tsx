'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { getWeekAppointments, getHospitalHours, getClinicHours } from '@/lib/admin-api'
import type { ScheduleSlot, DayHours } from '@/lib/admin-api'
import { Badge } from '@/components/dashboard/Badge'
import { DateFilter, getDateBounds } from '@/components/dashboard/DateFilter'
import type { DateRangeKey, DateBounds } from '@/components/dashboard/DateFilter'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Display order Mon→Sun
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const DOC_PALETTE = [
  { dark: '#1A4A32', light: '#E6F4EC', accent: 'rgba(0,232,122,0.15)'   },
  { dark: '#1A2A4A', light: '#E6ECF4', accent: 'rgba(55,138,221,0.15)'  },
  { dark: '#3A1A4A', light: '#EEE6F4', accent: 'rgba(140,100,240,0.15)' },
  { dark: '#4A2A1A', light: '#F4ECE6', accent: 'rgba(239,159,39,0.15)'  },
  { dark: '#2A1A4A', light: '#EBE6F4', accent: 'rgba(90,60,200,0.15)'   },
]
const docPalMap: Record<string, typeof DOC_PALETTE[0]> = {}
function docPal(name: string) {
  if (!docPalMap[name]) docPalMap[name] = DOC_PALETTE[Object.keys(docPalMap).length % DOC_PALETTE.length]
  return docPalMap[name]
}

function mondayOf(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay() || 7
  d.setDate(d.getDate() - dow + 1)
  return d
}

// Local calendar date, not UTC — Date#toISOString() shifts to UTC first, which
// silently rolls back to the previous day in positive-offset timezones (e.g. WAT, UTC+1).
function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
function fmtHour(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return `${String(h).padStart(2, '0')}:00`
}

interface ClinicOption { id: string; name: string }

type SelectedCell =
  | { kind: 'day'; label: string; items: ScheduleSlot[] }
  | { kind: 'time'; label: string; items: ScheduleSlot[] }
  | { kind: 'cell'; label: string; items: ScheduleSlot[] }

export default function SchedulePage() {
  const { theme: C } = useTheme()
  const { hospital, role, doctorId } = useAdmin()
  const searchParams = useSearchParams()
  const urlDoctorId  = searchParams.get('doctorId')
  const [schedule, setSchedule] = useState<Record<string, ScheduleSlot[]>>({})
  const [hours, setHours] = useState<DayHours[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange]   = useState<DateRangeKey>('this_week')
  const [bounds, setBounds] = useState<DateBounds>(getDateBounds('this_week'))
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const isDark = C.id === 'forest'
  const isMulti = hospital?.clinic_model === 'multi'

  const today = new Date()
  const todayStr = fmtLocalDate(today)
  const monday = mondayOf(bounds.from)

  // Fetch clinic list for the selector (multi-clinic hospitals only)
  useEffect(() => {
    if (!hospital?.id || !isMulti) { setClinics([]); return }
    fetch(`/api/clinics?hospitalId=${hospital.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(list => setClinics((list ?? []).map((c: any) => ({ id: c.id, name: c.name }))))
  }, [hospital?.id, isMulti])

  const load = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    // Doctors always see only their own schedule; admins can be scoped via ?doctorId= URL param
    const scopedDoctorId = role === 'doctor' && doctorId ? doctorId : (urlDoctorId ?? undefined)
    const weekStartISO = fmtLocalDate(monday)

    const [sched, resolvedHours] = await Promise.all([
      getWeekAppointments(hospital.id, weekStartISO, { doctorId: scopedDoctorId, clinicId: clinicId ?? undefined }),
      clinicId
        ? getClinicHours(clinicId).then(async ({ hours: h, isCustom }) =>
            isCustom ? h : getHospitalHours(hospital.id))
        : getHospitalHours(hospital.id),
    ])
    setSchedule(sched)
    setHours(resolvedHours)
    setLoading(false)
  }, [hospital?.id, role, doctorId, urlDoctorId, bounds.from, clinicId])

  useEffect(() => { load() }, [load])

  const weekDateObjs = DISPLAY_ORDER.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
  const weekDateISO = weekDateObjs.map(fmtLocalDate)

  const hoursByDay: Record<number, DayHours> = Object.fromEntries(hours.map(h => [h.day, h]))
  const openDayIdxs = DISPLAY_ORDER
    .map((dow, i) => ({ dow, i }))
    .filter(({ dow }) => !hoursByDay[dow]?.closed)

  const dayTotals: Record<string, number> = Object.fromEntries(
    weekDateISO.map(iso => [iso, (schedule[iso] ?? []).length])
  )

  // Build hourly row range spanning all open days
  let rangeStart = Infinity, rangeEnd = -Infinity
  openDayIdxs.forEach(({ dow }) => {
    const h = hoursByDay[dow]
    if (!h) return
    rangeStart = Math.min(rangeStart, toMinutes(h.open))
    rangeEnd = Math.max(rangeEnd, toMinutes(h.close))
  })
  const hasOpenDays = openDayIdxs.length > 0 && rangeStart < rangeEnd
  const startHour = hasOpenDays ? Math.floor(rangeStart / 60) : 8
  const endHour   = hasOpenDays ? Math.ceil(rangeEnd / 60) : 17
  const TIMES = Array.from({ length: Math.max(endHour - startHour, 0) }, (_, i) => fmtHour((startHour + i) * 60))

  function isDayOpenAt(dow: number, time: string): boolean {
    const h = hoursByDay[dow]
    if (!h || h.closed) return false
    const mins = toMinutes(time)
    return mins >= toMinutes(h.open) && mins < toMinutes(h.close)
  }

  function openDay(iso: string, dateObj: Date) {
    const items = schedule[iso] ?? []
    if (items.length === 0) return
    setSelected({
      kind: 'day', items,
      label: dateObj.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }),
    })
  }

  function openTime(time: string) {
    const items = weekDateISO.flatMap(iso => (schedule[iso] ?? []).filter(s => s.time === time))
    if (items.length === 0) return
    setSelected({ kind: 'time', items, label: `${time} across the week` })
  }

  function openCell(iso: string, time: string, dateObj: Date) {
    const items = (schedule[iso] ?? []).filter(s => s.time === time)
    if (items.length === 0) return
    setSelected({
      kind: 'cell', items,
      label: `${dateObj.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })} · ${time}`,
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Schedule</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
            Week of {monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isMulti && clinics.length > 0 && (
            <select value={clinicId ?? ''} onChange={e => setClinicId(e.target.value || null)}
              style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '8px 12px', fontSize: 13, color: C.text, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="">All Clinics</option>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <DateFilter value={range} onChange={(key, b) => { setRange(key); setBounds(b) }} />
          <button onClick={load} style={{ background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
            border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>Loading schedule…</div>
      ) : !hasOpenDays ? (
        <div style={{ textAlign: 'center', padding: '60px', border: `2px dashed ${C.borderMed}`, borderRadius: 20, color: C.textMuted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚪</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textSub, marginBottom: 6 }}>No open days configured</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            Set operating hours to see the schedule grid.
          </div>
          <a href="/dashboard/clinics"
            style={{ fontSize: 13, fontWeight: 700, color: C.accent, textDecoration: 'none',
              background: C.accentLight, border: `1px solid ${C.accentBorder}`,
              borderRadius: 10, padding: '9px 18px', display: 'inline-block' }}>
            Set up clinic hours in Clinics → Manage Hours
          </a>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${openDayIdxs.length}, 1fr)`,
            borderBottom: `1px solid ${C.border}` }}>
            <div style={{ padding: '12px', background: C.bgAlt }} />
            {openDayIdxs.map(({ dow, i }) => {
              const iso = weekDateISO[i]
              const total = dayTotals[iso]
              const isToday = iso === todayStr
              return (
                <button key={iso} onClick={() => openDay(iso, weekDateObjs[i])}
                  disabled={total === 0}
                  style={{ padding: '12px', textAlign: 'center', border: 'none',
                    borderLeft: `1px solid ${C.border}`, fontFamily: 'inherit',
                    background: isToday ? C.accentLight : C.bgAlt,
                    cursor: total > 0 ? 'pointer' : 'default' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
                    color: isToday ? C.accent : C.textMuted }}>
                    {DAY_LABELS[dow].toUpperCase()}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2,
                    color: isToday ? C.accent : C.text }}>
                    {weekDateObjs[i].getDate()}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3,
                    color: total > 0 ? C.textSub : C.textMuted }}>
                    {total} appt{total !== 1 ? 's' : ''}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Time rows */}
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {TIMES.map(time => (
              <div key={time} style={{ display: 'grid', gridTemplateColumns: `64px repeat(${openDayIdxs.length}, 1fr)`,
                borderBottom: `1px solid ${C.border}`, minHeight: 56 }}>
                <button onClick={() => openTime(time)}
                  style={{ padding: '8px 10px 0', fontSize: 11, color: C.textMuted, fontWeight: 600,
                    background: C.bgAlt, borderRight: `1px solid ${C.border}`, border: 'none',
                    borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
                    fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  {time}
                </button>
                {openDayIdxs.map(({ dow, i }) => {
                  const iso = weekDateISO[i]
                  const isToday = iso === todayStr
                  const dayOpenNow = isDayOpenAt(dow, time)
                  const slots = dayOpenNow ? (schedule[iso] ?? []).filter(s => s.time === time) : []
                  const count = slots.length
                  return (
                    <div key={iso} onClick={() => dayOpenNow && openCell(iso, time, weekDateObjs[i])}
                      style={{ borderLeft: `1px solid ${C.border}`, padding: 6, minHeight: 56,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: count > 0 ? 'pointer' : 'default',
                        background: !dayOpenNow
                          ? (isDark ? 'rgba(255,255,255,0.02)' : 'repeating-linear-gradient(45deg, #f4f4f4, #f4f4f4 6px, #ececec 6px, #ececec 12px)')
                          : isToday ? (isDark ? 'rgba(0,232,122,0.03)' : '#F9FDF9') : 'transparent' }}>
                      {count > 0 && (() => {
                        const pal = docPal(slots[0].doc)
                        const bg = isDark ? pal.accent : pal.light
                        return (
                          <div style={{ background: bg, borderLeft: `3px solid ${pal.dark}`,
                            borderRadius: 8, padding: '6px 12px', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: isDark ? C.text : pal.dark }}>
                              {count}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: C.textSub }}>
                              appt{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && hasOpenDays && Object.values(schedule).every(d => d.length === 0) && (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>
          No appointments scheduled this week.
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{selected.label}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
                  {selected.items.length} appointment{selected.items.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" style={{ background: 'none', border: 'none',
                color: C.textMuted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selected.items.map((s, i) => {
                const pal = docPal(s.doc)
                return (
                  <div key={s.id ?? i} style={{ background: C.bgAlt, border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${pal.dark}`, borderRadius: 10, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.patient}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                        {s.doc} {selected.kind !== 'cell' && `· ${selected.kind === 'day' ? s.time : s.date}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <Badge status={s.status} />
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 8px', borderRadius: 99,
                        background: s.type === 'virtual' ? C.blueLight : C.accentLight,
                        color: s.type === 'virtual' ? C.blue : C.accent }}>
                        {s.type === 'virtual' ? 'Virtual' : 'In-person'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
