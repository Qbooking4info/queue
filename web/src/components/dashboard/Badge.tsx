'use client'
import { useTheme } from '@/contexts/ThemeContext'

// v3.1 status palette (handoff "Design tokens" > status): pending = warning,
// confirmed = primary, checked_in = blue, in_progress = primaryDeep,
// completed = success, cancelled / no_show = neutral. Every chip carries a glyph
// and a word, so status never rests on colour alone.
export function Badge({ status }: { status: string }) {
  const { theme: C } = useTheme()
  const dark = C.id === 'forest'

  const warning = { bg: C.amberLight, color: C.amber }
  const primary = { bg: C.accentLight, color: C.accent }
  const blue    = { bg: C.blueLight, color: C.blue }
  const deep    = dark ? { bg: 'rgba(45,212,191,0.22)', color: '#CCFBF1' } : { bg: '#134E4A', color: '#FFFFFF' }
  const success = dark ? { bg: 'rgba(74,222,128,0.14)', color: '#4ADE80' } : { bg: '#DCFCE7', color: '#15803D' }
  const neutral = dark ? { bg: 'rgba(148,163,166,0.16)', color: '#B8C7C9' } : { bg: '#F1F5F4', color: '#4B5B5E' }

  const meta: Record<string, { label: string; glyph: string; tone: { bg: string; color: string } }> = {
    pending:          { label: 'Pending',          glyph: '●', tone: warning },
    pending_approval: { label: 'Pending approval', glyph: '●', tone: warning },
    waiting:          { label: 'Waiting',          glyph: '●', tone: warning },
    confirmed:        { label: 'Confirmed',        glyph: '✓', tone: primary },
    'checked-in':     { label: 'Checked in',       glyph: '→', tone: blue },
    checked_in:       { label: 'Checked in',       glyph: '→', tone: blue },
    'in-progress':    { label: 'In progress',      glyph: '◉', tone: deep },
    in_progress:      { label: 'In progress',      glyph: '◉', tone: deep },
    completed:        { label: 'Completed',        glyph: '✓', tone: success },
    cancelled:        { label: 'Cancelled',        glyph: '✕', tone: neutral },
    no_show:          { label: 'No-show',          glyph: '○', tone: neutral },
  }

  const m = meta[status] ?? { label: status.replace(/_/g, ' '), glyph: '•', tone: neutral }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 99,
      background: m.tone.bg, color: m.tone.color, whiteSpace: 'nowrap', display: 'inline-block' }}>
      <span aria-hidden="true">{m.glyph} </span>{m.label}
    </span>
  )
}
