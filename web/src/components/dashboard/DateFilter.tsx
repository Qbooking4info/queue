'use client'
import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'

export type DateRangeKey =
  | 'today' | 'tomorrow'
  | 'this_week' | 'next_week'
  | 'this_month' | 'next_month'
  | 'last_week' | 'last_month'
  | 'last_3_months' | 'last_6_months'
  | 'this_year' | 'last_year'
  | 'all_time' | 'custom'

export interface DateBounds { from: string; to: string }

// Local calendar date, not UTC — Date#toISOString() shifts to UTC first, which
// silently rolls back to the previous day in positive-offset timezones (e.g. WAT, UTC+1).
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const LABELS: Record<DateRangeKey, string> = {
  today:          'Today',
  tomorrow:       'Tomorrow',
  this_week:      'This Week',
  next_week:      'Next Week',
  this_month:     'This Month',
  next_month:     'Next Month',
  last_week:      'Last Week',
  last_month:     'Last Month',
  last_3_months:  'Last 3 Months',
  last_6_months:  'Last 6 Months',
  this_year:      'This Year',
  last_year:      'Last Year',
  all_time:       'All Time',
  custom:         'Custom Range',
}

const GROUPS: { label: string; keys: DateRangeKey[] }[] = [
  { label: 'Current',  keys: ['today', 'this_week', 'this_month', 'this_year'] },
  { label: 'Upcoming', keys: ['tomorrow', 'next_week', 'next_month'] },
  { label: 'Past',     keys: ['last_week', 'last_month', 'last_3_months', 'last_6_months', 'last_year'] },
  { label: 'Other',    keys: ['all_time', 'custom'] },
]

export function getDateBounds(range: DateRangeKey, custom?: DateBounds): DateBounds {
  const now   = new Date()
  const today = fmt(now)

  switch (range) {
    case 'today':
      return { from: today, to: today }

    case 'tomorrow': {
      const t = new Date(now); t.setDate(now.getDate() + 1)
      const s = fmt(t)
      return { from: s, to: s }
    }

    case 'this_week': {
      const dow = now.getDay() || 7
      const mon = new Date(now); mon.setDate(now.getDate() - dow + 1)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return { from: fmt(mon), to: fmt(sun) }
    }

    case 'next_week': {
      const dow     = now.getDay() || 7
      const thisMon = new Date(now); thisMon.setDate(now.getDate() - dow + 1)
      const nextMon = new Date(thisMon); nextMon.setDate(thisMon.getDate() + 7)
      const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6)
      return { from: fmt(nextMon), to: fmt(nextSun) }
    }

    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: fmt(first), to: fmt(last) }
    }

    case 'next_month': {
      const first = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth() + 2, 0)
      return { from: fmt(first), to: fmt(last) }
    }

    case 'last_week': {
      const dow     = now.getDay() || 7
      const thisMon = new Date(now); thisMon.setDate(now.getDate() - dow + 1)
      const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7)
      const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1)
      return { from: fmt(lastMon), to: fmt(lastSun) }
    }

    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }

    case 'last_3_months': {
      const first = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      return { from: fmt(first), to: today }
    }

    case 'last_6_months': {
      const first = new Date(now.getFullYear(), now.getMonth() - 6, 1)
      return { from: fmt(first), to: today }
    }

    case 'this_year': {
      const first = new Date(now.getFullYear(), 0, 1)
      const last  = new Date(now.getFullYear(), 11, 31)
      return { from: fmt(first), to: fmt(last) }
    }

    case 'last_year': {
      const first = new Date(now.getFullYear() - 1, 0, 1)
      const last  = new Date(now.getFullYear() - 1, 11, 31)
      return { from: fmt(first), to: fmt(last) }
    }

    case 'all_time':
      return { from: '2020-01-01', to: '2099-12-31' }

    case 'custom':
      return custom ?? { from: today, to: today }
  }
}

export function rangeDateLabel(range: DateRangeKey, bounds: DateBounds): string {
  if (range === 'today' || range === 'tomorrow') {
    return new Date(bounds.from + 'T12:00:00').toLocaleDateString('en-NG', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  }
  if (range === 'all_time') return 'All records'
  const from = new Date(bounds.from + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  const to   = new Date(bounds.to   + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${from} – ${to}`
}

interface Props {
  value: DateRangeKey
  onChange: (key: DateRangeKey, bounds: DateBounds) => void
  label?: string
}

export function DateFilter({ value, onChange, label }: Props) {
  const { theme: C }                      = useTheme()
  const [open,       setOpen]             = useState(false)
  const [customFrom, setCustomFrom]       = useState('')
  const [customTo,   setCustomTo]         = useState('')
  const ref                               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function pick(key: DateRangeKey) {
    if (key === 'custom') return  // handled separately
    onChange(key, getDateBounds(key))
    setOpen(false)
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    const diffDays = (new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86_400_000
    if (diffDays < 0) return // end before start
    if (diffDays > 90) { alert('Custom range cannot exceed 90 days.'); return }
    const bounds = { from: customFrom, to: customTo }
    onChange('custom', bounds)
    setOpen(false)
  }

  const bounds = value === 'custom'
    ? { from: customFrom, to: customTo }
    : getDateBounds(value)

  const label_text = LABELS[value] ?? value
  const date_text  = customFrom && customTo && value === 'custom'
    ? rangeDateLabel('custom', bounds)
    : value !== 'custom' ? rangeDateLabel(value, bounds) : ''

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {label && (
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted,
          textTransform: 'uppercase', letterSpacing: '.05em', marginRight: 8 }}>
          {label}
        </span>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 12px 7px 14px', borderRadius: 10, cursor: 'pointer',
          background: C.bgAlt, border: `1px solid ${open ? C.accentBorder : C.border}`,
          color: C.text, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          transition: 'border-color .15s',
        }}>
        <span style={{ color: C.accent, fontSize: 14 }}>📅</span>
        <span>{label_text}</span>
        {date_text && (
          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400 }}>
            · {date_text}
          </span>
        )}
        <span style={{ color: C.textMuted, fontSize: 10, marginLeft: 2 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)', minWidth: 220,
          overflow: 'hidden',
        }}>
          {GROUPS.map((g, gi) => (
            <div key={g.label}>
              {gi > 0 && (
                <div style={{ height: 1, background: C.border, margin: '0 10px' }} />
              )}
              <div style={{ padding: '8px 6px 4px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted,
                  textTransform: 'uppercase', letterSpacing: '.08em', padding: '0 8px 4px' }}>
                  {g.label}
                </div>
                {g.keys.filter(k => k !== 'custom').map(key => (
                  <button key={key} onClick={() => pick(key as DateRangeKey)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 12px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                      background: value === key ? C.accentLight : 'transparent',
                      color: value === key ? C.accent : C.text,
                      fontWeight: value === key ? 700 : 500,
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (value !== key) (e.target as HTMLElement).style.background = C.bgAlt }}
                    onMouseLeave={e => { if (value !== key) (e.target as HTMLElement).style.background = 'transparent' }}>
                    {LABELS[key as DateRangeKey]}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Custom range section */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              Custom Range
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ flex: 1, background: C.bgAlt, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '6px 8px', fontSize: 12, color: C.text,
                  outline: 'none', fontFamily: 'inherit', colorScheme: 'dark' }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ flex: 1, background: C.bgAlt, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '6px 8px', fontSize: 12, color: C.text,
                  outline: 'none', fontFamily: 'inherit', colorScheme: 'dark' }} />
            </div>
            <button onClick={applyCustom}
              disabled={!customFrom || !customTo}
              style={{
                width: '100%', padding: '8px', borderRadius: 8, cursor: 'pointer',
                background: customFrom && customTo ? C.accentLight : C.bgAlt,
                border: `1px solid ${customFrom && customTo ? C.accentBorder : C.border}`,
                color: customFrom && customTo ? C.accent : C.textMuted,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              }}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
