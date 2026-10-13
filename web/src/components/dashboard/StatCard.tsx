'use client'
import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'

// v3.1 KPI card (w-dash): label, large tabular number, optional subline and trend.
// Same props as before so every page picks up the new look; `icon` and `colorKey`
// are accepted but no longer drawn (the v3.1 card has no icon tile or colour rail).

interface StatCardProps {
  icon?: React.ReactNode
  label: string
  value: string | number
  sub?: string
  colorKey?: 'accent' | 'blue' | 'purple' | 'amber'
  trend?: number
}

export function StatCard({ label, value, sub, trend }: StatCardProps) {
  const { theme: C } = useTheme()
  const good = C.id === 'forest' ? '#4ADE80' : '#15803D'
  return (
    <div className="dash-stat-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 2, color: C.text, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: C.textMuted }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>
        {value === '…' || value === '...' ? <span style={{ color: C.textMuted }}>—</span> : value}
      </div>
      {trend !== undefined && trend !== 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: trend > 0 ? good : C.amber }}>
          {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}% vs previous
        </div>
      )}
      {sub && <div style={{ fontSize: 12, color: C.textMuted }}>{sub}</div>}
    </div>
  )
}
