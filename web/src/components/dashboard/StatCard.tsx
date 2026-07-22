'use client'
import { useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { T } from '@/lib/typography'

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
  const [hovered, setHovered] = useState(false)
  const colorMap = { accent: C.accent, blue: C.blue, purple: C.purple, amber: C.amber }
  const col = colorMap[colorKey]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${col}`,
        borderRadius: 16,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'box-shadow 0.2s, transform 0.2s, background 0.3s, border-color 0.3s',
        boxShadow: hovered ? `0 8px 24px rgba(0,0,0,0.25), 0 0 0 1px ${col}33` : 'none',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        cursor: 'default',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: col + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {icon}
        </div>
        {trend !== undefined && (
          <span style={{ ...T.caption,
            color: trend > 0 ? C.accent : C.red,
            background: trend > 0 ? C.accentLight : C.redLight,
            padding: '2px 8px', borderRadius: 99 }}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ ...T.display, color: C.text, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ ...T.body, color: C.textSub, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ ...T.caption, color: C.textMuted }}>{sub}</div>}
    </div>
  )
}
