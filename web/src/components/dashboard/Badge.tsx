'use client'
import { useTheme } from '@/contexts/ThemeContext'

type StatusKey = 'confirmed' | 'checked-in' | 'checked_in' | 'in-progress' | 'in_progress' | 'waiting' | 'cancelled' | 'completed' | 'pending' | 'no_show'

export function Badge({ status }: { status: string }) {
  const { theme: C } = useTheme()

  const meta: Record<string, { label: string; bg: string; color: string }> = {
    confirmed:    { label: 'Confirmed',    bg: C.blueLight,   color: C.blue   },
    pending:      { label: 'Pending',      bg: C.amberLight,  color: C.amber  },
    'checked-in': { label: 'Checked In',   bg: C.accentLight, color: C.accent },
    checked_in:   { label: 'Checked In',   bg: C.accentLight, color: C.accent },
    'in-progress':{ label: 'In Progress',  bg: C.amberLight,  color: C.amber  },
    in_progress:  { label: 'In Progress',  bg: C.amberLight,  color: C.amber  },
    waiting:      { label: 'Waiting',      bg: C.amberLight,  color: C.amber  },
    cancelled:    { label: 'Cancelled',    bg: C.redLight,    color: C.red    },
    completed:    { label: 'Completed',    bg: C.border,      color: C.textMuted },
    no_show:      { label: 'No Show',      bg: C.redLight,    color: C.red    },
  }

  const m = meta[status as StatusKey] ?? meta.confirmed
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
      background: m.bg, color: m.color, whiteSpace: 'nowrap',
      border: `1px solid ${m.color}33`, display: 'inline-block' }}>
      {m.label}
    </span>
  )
}
