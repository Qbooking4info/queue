'use client'
import React, { useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { T } from '@/lib/typography'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  colorKey?: 'accent' | 'blue' | 'purple' | 'amber'
  trend?: number
}

export function StatCard({ icon, label, value, sub, colorKey = 'accent', trend }: StatCardProps) {
  const { theme: C } = useTheme()
  const [hovered, setHovered] = useState(false)
  // MD3 tonal container: the whole card is a bold, saturated fill in the stat's own
  // hue, with an always-readable on-color for every line of text -- not a white card
  // with a thin colored rail down the side.
  const containerMap = {
    accent: { bg: C.accentContainer, fg: C.onAccentContainer },
    blue:   { bg: C.blueContainer,   fg: C.onBlueContainer   },
    purple: { bg: C.purpleContainer, fg: C.onPurpleContainer },
    amber:  { bg: C.amberContainer,  fg: C.onAmberContainer  },
  }
  const { bg, fg } = containerMap[colorKey]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="dash-stat-card"
      // Frosted panel carrying a tint of its own colour, rather than a flat
      // tonal fill: the page wash and light orbs read through it, and the
      // bright 1px edge is what gives glass its lift.
      style={{
        background: bg,
        backdropFilter: C.blur,
        WebkitBackdropFilter: C.blur,
        border: `1px solid ${C.glassBorder}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'box-shadow 0.2s, transform 0.2s, background 0.3s',
        boxShadow: hovered ? `0 18px 40px ${C.accentGlow}` : C.glassShadow,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        cursor: 'default',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: fg }}>
          {icon}
        </div>
        {trend !== undefined && (
          <span style={{ ...T.caption, color: fg,
            background: 'rgba(255,255,255,0.35)',
            padding: '2px 8px', borderRadius: 99 }}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="dash-stat-value" style={{ color: fg }}>
        {value}
      </div>
      <div style={{ ...T.body, color: fg, fontWeight: 700 }}>{label}</div>
      {sub && <div style={{ ...T.caption, color: fg, opacity: 0.75 }}>{sub}</div>}
    </div>
  )
}
