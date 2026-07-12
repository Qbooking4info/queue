'use client'
import { useTheme } from '@/contexts/ThemeContext'
import type { DayHours } from '@/lib/admin-api'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function HoursEditor({ hours, onChange }: { hours: DayHours[]; onChange: (hours: DayHours[]) => void }) {
  const { theme: C } = useTheme()

  function update(day: number, field: 'open' | 'close' | 'closed', value: string | boolean) {
    onChange(hours.map(h => h.day === day ? { ...h, [field]: value } : h))
  }

  const timeInput: React.CSSProperties = {
    background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 8,
    padding: '6px 8px', fontSize: 12, color: C.text, outline: 'none',
    fontFamily: 'inherit', colorScheme: C.id === 'forest' ? 'dark' : 'light',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[...hours].sort((a, b) => a.day - b.day).map(h => (
        <div key={h.day} style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bgAlt }}>
          <span style={{ fontSize: 12, fontWeight: 700, width: 40, flexShrink: 0,
            color: h.closed ? C.textMuted : C.text }}>
            {DAY_LABELS[h.day]}
          </span>
          {h.closed ? (
            <span style={{ fontSize: 12, color: C.textMuted, flex: 1 }}>Closed</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <input type="time" value={h.open} onChange={e => update(h.day, 'open', e.target.value)} style={timeInput} />
              <span style={{ fontSize: 11, color: C.textMuted }}>to</span>
              <input type="time" value={h.close} onChange={e => update(h.day, 'close', e.target.value)} style={timeInput} />
            </div>
          )}
          <button type="button" onClick={() => update(h.day, 'closed', !h.closed)}
            style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              border: `1px solid ${h.closed ? C.accentBorder : C.border}`,
              background: h.closed ? C.accentLight : 'transparent',
              color: h.closed ? C.accent : C.textMuted }}>
            {h.closed ? 'Open' : 'Close'}
          </button>
        </div>
      ))}
    </div>
  )
}
