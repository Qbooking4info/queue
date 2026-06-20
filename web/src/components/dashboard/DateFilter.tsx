'use client'
import { useTheme } from '@/contexts/ThemeContext'

export type DateRangeKey = 'today' | 'this_week' | 'last_week' | 'this_month' | 'all_time'
export interface DateBounds { from: string; to: string }

const FILTERS: { key: DateRangeKey; label: string }[] = [
  { key: 'today',      label: 'Today'      },
  { key: 'this_week',  label: 'This Week'  },
  { key: 'last_week',  label: 'Last Week'  },
  { key: 'this_month', label: 'This Month' },
  { key: 'all_time',   label: 'All Time'   },
]

const fmt = (d: Date) => d.toISOString().split('T')[0]

export function getDateBounds(range: DateRangeKey): DateBounds {
  const now = new Date()
  const today = fmt(now)

  if (range === 'today') return { from: today, to: today }

  if (range === 'this_week') {
    const dow = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - dow + 1)
    return { from: fmt(mon), to: today }
  }

  if (range === 'last_week') {
    const dow = now.getDay() || 7
    const thisMon = new Date(now); thisMon.setDate(now.getDate() - dow + 1)
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7)
    const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1)
    return { from: fmt(lastMon), to: fmt(lastSun) }
  }

  if (range === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: fmt(first), to: today }
  }

  // all_time
  return { from: '2020-01-01', to: today }
}

export function rangeDateLabel(range: DateRangeKey, bounds: DateBounds): string {
  if (range === 'today') return new Date(bounds.from).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })
  if (range === 'all_time') return 'All records'
  const from = new Date(bounds.from).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  const to   = new Date(bounds.to).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${from} – ${to}`
}

interface Props {
  value: DateRangeKey
  onChange: (key: DateRangeKey, bounds: DateBounds) => void
  label?: string
}

export function DateFilter({ value, onChange, label }: Props) {
  const { theme: C } = useTheme()
  const bounds = getDateBounds(value)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted,
          textTransform: 'uppercase', letterSpacing: '.05em', marginRight: 4 }}>
          {label}
        </span>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = value === f.key
          return (
            <button key={f.key} onClick={() => onChange(f.key, getDateBounds(f.key))}
              style={{ padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit', border: '1px solid',
                background: active ? C.accentLight : C.bgAlt,
                color: active ? C.accent : C.textSub,
                borderColor: active ? C.accentBorder : C.border }}>
              {f.label}
            </button>
          )
        })}
      </div>
      <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 2 }}>
        {rangeDateLabel(value, bounds)}
      </span>
    </div>
  )
}
