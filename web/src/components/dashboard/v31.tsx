'use client'
import type { CSSProperties, ReactNode } from 'react'
import { useTheme } from '@/contexts/ThemeContext'

// Shared building blocks for v3.1 dashboard modules, matching w-dash: 14px cards
// on a 1px line, 26px/800 page titles, 36px secondary buttons, 38px pill segments.

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  const { theme: C } = useTheme()
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
      <div>
        {eyebrow && <div style={{ fontSize: 13, color: C.textMuted }}>{eyebrow}</div>}
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: C.text }}>{title}</h1>
      </div>
      {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}

export function Card({ children, style, title, actions }: { children: ReactNode; style?: CSSProperties; title?: string; actions?: ReactNode }) {
  const { theme: C } = useTheme()
  return (
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, color: C.text, ...style }}>
      {(title || actions) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          {title && <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>}
          {actions && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Button({ children, onClick, variant = 'secondary', disabled, type = 'button', ariaLabel }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'link'; disabled?: boolean
  type?: 'button' | 'submit'; ariaLabel?: string
}) {
  const { theme: C } = useTheme()
  const onAccent = C.id === 'forest' ? '#04201D' : '#FFFFFF'
  const look: Record<string, CSSProperties> = {
    primary:   { height: 44, padding: '0 18px', borderRadius: 13, border: 'none', background: C.accent, color: onAccent, fontWeight: 700, fontSize: 14 },
    secondary: { height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontWeight: 600, fontSize: 13 },
    danger:    { height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.red, fontWeight: 700, fontSize: 13 },
    link:      { height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.accent, fontWeight: 700, fontSize: 13 },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      style={{ fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', ...look[variant] }}>
      {children}
    </button>
  )
}

export function Segmented<K extends string>({ options, value, onChange, label }: {
  options: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; label: string
}) {
  const { theme: C } = useTheme()
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const on = o.key === value
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => onChange(o.key)}
            style={{ height: 38, padding: '0 14px', borderRadius: 99, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              ...(on ? { background: C.accent, color: C.id === 'forest' ? '#04201D' : '#FFFFFF', border: `1px solid ${C.accent}` }
                     : { background: C.card, color: C.textSub, border: `1px solid ${C.border}` }) }}>
            {o.label}{o.count != null ? ` · ${o.count}` : ''}
          </button>
        )
      })}
    </div>
  )
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  const { theme: C } = useTheme()
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, color: C.text }}>
      <div style={{ fontSize: 13, color: C.textMuted }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>{sub}</div>}
    </div>
  )
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>{children}</div>
}

export function DataTable({ head, children, minWidth = 640 }: { head: string[]; children: ReactNode; minWidth?: number }) {
  const { theme: C } = useTheme()
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth, borderCollapse: 'collapse', fontSize: 14, color: C.text }}>
        <thead><tr style={{ textAlign: 'left', color: C.textMuted, fontSize: 12 }}>
          {head.map(h => <th key={h} style={{ padding: '10px 8px', fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function useCellStyle() {
  const { theme: C } = useTheme()
  return { padding: '11px 8px', borderBottom: `1px solid ${C.bgAlt}`, verticalAlign: 'middle' } as CSSProperties
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const { theme: C } = useTheme()
  return (
    <div style={{ padding: '36px 12px', textAlign: 'center', color: C.textMuted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
      {body && <div style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{body}</div>}
      {action}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const { theme: C } = useTheme()
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: C.textSub }}>
      {label}
      {children}
      {hint && <span style={{ fontSize: 12, fontWeight: 500, color: C.textMuted }}>{hint}</span>}
    </label>
  )
}

export function useInputStyle(): CSSProperties {
  const { theme: C } = useTheme()
  return { height: 44, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text,
    padding: '0 12px', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, width: '100%', boxSizing: 'border-box' }
}

export function downloadCsv(filename: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob([[head, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  URL.revokeObjectURL(a.href)
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
