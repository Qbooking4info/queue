'use client'
import { useTheme } from '@/contexts/ThemeContext'

// Care plan adherence: a short bar plus the percentage, green / amber / red at 80 / 50.
export function AdherenceBar({ pct }: { pct: number | null }) {
  const { theme: C } = useTheme()
  if (pct == null) return <span style={{ color: C.textMuted }}>—</span>
  const color = pct >= 80 ? (C.id === 'forest' ? '#4ADE80' : '#15803D') : pct >= 50 ? C.amber : C.red
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ width: 70, height: 6, borderRadius: 99, background: C.bgAlt, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
      </span>
      <b style={{ color, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{pct}%</b>
    </span>
  )
}

