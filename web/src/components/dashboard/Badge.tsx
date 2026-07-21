'use client'
import { useTheme } from '@/contexts/ThemeContext'

export function Badge({ status }: { status: string }) {
  const { theme: C } = useTheme()

  const meta: Record<string, { label: string; bg: string; color: string }> = {
    confirmed:        { label: 'Confirmed',        bg: C.blueLight,                   color: C.blue      },
    pending:          { label: 'Pending',           bg: C.amberLight,                  color: C.amber     },
    pending_approval: { label: 'Pending Approval',  bg: 'rgba(239,159,39,0.15)',       color: '#EF9F27'   },
    'checked-in':     { label: 'Checked In',        bg: C.accentLight,                 color: C.accent    },
    checked_in:       { label: 'Checked In',        bg: C.accentLight,                 color: C.accent    },
    'in-progress':    { label: 'In Progress',       bg: C.blueLight,                   color: C.blue      },
    in_progress:      { label: 'In Progress',       bg: C.blueLight,                   color: C.blue      },
    waiting:          { label: 'Waiting',           bg: C.amberLight,                  color: C.amber     },
    cancelled:        { label: 'Cancelled',         bg: C.redLight,                    color: C.red       },
    completed:        { label: 'Completed',         bg: C.border,                      color: C.textMuted },
    no_show:          { label: 'No Show',           bg: 'rgba(128,128,128,0.15)',       color: '#94a3b8'   },
  }

  const m = meta[status] ?? { label: 'Unknown', bg: 'rgba(128,128,128,0.12)', color: '#94a3b8' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
      background: m.bg, color: m.color, whiteSpace: 'nowrap',
      border: `1px solid ${m.color}33`, display: 'inline-block' }}>
      {m.label}
    </span>
  )
}
