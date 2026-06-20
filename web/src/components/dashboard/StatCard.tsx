'use client'
import { useTheme } from '@/contexts/ThemeContext'

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  sub?: string
  colorKey?: 'accent' | 'blue' | 'purple' | 'amber'
  trend?: number
}

export function StatCard({ icon, label, value, sub, colorKey = 'accent', trend }: StatCardProps) {
  const { theme: C } = useTheme()
  const colorMap = { accent: C.accent, blue: C.blue, purple: C.purple, amber: C.amber }
  const col = colorMap[colorKey]

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'background .3s, border-color .3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: col + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {icon}
        </div>
        {trend !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 700,
            color: trend > 0 ? C.accent : C.red,
            background: trend > 0 ? C.accentLight : C.redLight,
            padding: '2px 8px', borderRadius: 99 }}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: '-.04em', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: C.textSub, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted }}>{sub}</div>}
    </div>
  )
}
