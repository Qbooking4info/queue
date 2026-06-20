'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { getWeekAppointments } from '@/lib/admin-api'

const DAYS = ['Mon','Tue','Wed','Thu','Fri']
const TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00']

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

export default function SchedulePage() {
  const { theme: C } = useTheme()
  const { hospital } = useAdmin()
  const [schedule, setSchedule] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const isDark = C.id === 'forest'

  const today = new Date()
  const currentDay = DAYS[today.getDay() - 1] ?? ''
  const monday = new Date(today)
  monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1))

  const load = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    setSchedule(await getWeekAppointments(hospital.id))
    setLoading(false)
  }, [hospital?.id])

  useEffect(() => { load() }, [load])

  const weekDates = DAYS.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.getDate()
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Schedule</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
            Week of {monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <button onClick={load} style={{ background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
          border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>Loading schedule…</div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, 1fr)',
            borderBottom: `1px solid ${C.border}` }}>
            <div style={{ padding: '12px', background: C.bgAlt }} />
            {DAYS.map((d, i) => (
              <div key={d} style={{ padding: '12px', textAlign: 'center',
                borderLeft: `1px solid ${C.border}`,
                background: d === currentDay ? C.accentLight : C.bgAlt }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
                  color: d === currentDay ? C.accent : C.textMuted }}>
                  {d.toUpperCase()}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2,
                  color: d === currentDay ? C.accent : C.text }}>
                  {weekDates[i]}
                </div>
              </div>
            ))}
          </div>

          {/* Time rows */}
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {TIMES.map(time => (
              <div key={time} style={{ display: 'grid', gridTemplateColumns: '64px repeat(5,1fr)',
                borderBottom: `1px solid ${C.border}`, minHeight: 56 }}>
                <div style={{ padding: '8px 10px 0', fontSize: 11, color: C.textMuted, fontWeight: 600,
                  background: C.bgAlt, borderRight: `1px solid ${C.border}` }}>
                  {time}
                </div>
                {DAYS.map(day => {
                  const slots = (schedule[day] ?? []).filter(s => s.time === time)
                  return (
                    <div key={day} style={{ borderLeft: `1px solid ${C.border}`, padding: 4, minHeight: 56,
                      background: day === currentDay ? (isDark ? 'rgba(0,232,122,0.03)' : '#F9FDF9') : 'transparent' }}>
                      {slots.map((slot, si) => {
                        const pal = docPal(slot.doc)
                        const bg = isDark ? pal.accent : pal.light
                        return (
                          <div key={si} style={{ background: bg,
                            borderLeft: `3px solid ${pal.dark}`,
                            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                            marginBottom: si < slots.length - 1 ? 4 : 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 700,
                              color: isDark ? C.text : pal.dark,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {slot.patient}
                            </div>
                            <div style={{ fontSize: 10, color: C.textSub,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {slot.doc.split(' ').slice(-1)[0]}
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                              background: slot.type === 'virtual' ? C.blueLight : C.accentLight,
                              color: slot.type === 'virtual' ? C.blue : C.accent }}>
                              {slot.type === 'virtual' ? 'Virtual' : 'In-person'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && Object.values(schedule).every(d => d.length === 0) && (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>
          No appointments scheduled this week.
        </div>
      )}
    </div>
  )
}
