'use client'
import { useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { updateAppointmentStatus } from './actions'

// Never called useTheme() -- every color here was a static Tailwind class
// (text-green-400, bg-blue-500/10, ...), which can't react to the clinical/forest
// toggle the rest of the dashboard runs on. Same bug as Button.tsx had, just never
// caught here since this component has no shared adopter to notice it through.
export function StatusButton({ appointmentId, currentStatus }: { appointmentId: string; currentStatus: string }) {
  const { theme: C } = useTheme()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const NEXT_ACTIONS: Record<string, { label: string; status: string; bg: string; border: string; color: string }[]> = {
    pending:     [{ label: 'Confirm',  status: 'confirmed',   bg: C.accentLight, border: C.accentBorder, color: C.accent }, { label: 'Cancel', status: 'cancelled', bg: C.redLight, border: `${C.red}4D`, color: C.red }],
    confirmed:   [{ label: 'Check In', status: 'checked_in',  bg: C.infoBg,      border: C.infoBorder,   color: C.info   }, { label: 'Cancel', status: 'cancelled', bg: C.redLight, border: `${C.red}4D`, color: C.red }],
    checked_in:  [{ label: 'Start',    status: 'in_progress', bg: C.infoBg,      border: C.infoBorder,   color: C.info   }],
    in_progress: [{ label: 'Complete', status: 'completed',   bg: C.accentLight, border: C.accentBorder, color: C.accent }, { label: 'No Show', status: 'no_show', bg: C.redLight, border: `${C.red}4D`, color: C.red }],
  }
  const TERMINAL: Record<string, { label: string; bg: string; border: string; color: string; icon: typeof Check }> = {
    completed: { label: 'Completed', bg: C.bgAlt,   border: C.border,       color: C.textMuted, icon: Check },
    cancelled: { label: 'Cancelled', bg: C.redLight, border: `${C.red}1A`, color: `${C.red}99`, icon: X },
    no_show:   { label: 'No Show',   bg: C.redLight, border: `${C.red}1A`, color: `${C.red}99`, icon: X },
  }

  const actions = NEXT_ACTIONS[currentStatus] ?? []
  if (!actions.length) {
    const terminal = TERMINAL[currentStatus]
    if (!terminal) return null
    const Icon = terminal.icon
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border"
        style={{ background: terminal.bg, borderColor: terminal.border, color: terminal.color }}
      >
        <Icon size={12} />
        {terminal.label}
      </span>
    )
  }

  function handleClick(status: string) {
    setError(null)
    startTransition(async () => {
      try {
        await updateAppointmentStatus(appointmentId, status)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Update failed')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {actions.map(action => (
          <button
            key={action.status}
            disabled={pending}
            onClick={() => handleClick(action.status)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all disabled:opacity-50"
            style={{ background: action.bg, borderColor: action.border, color: action.color }}
          >
            {pending ? '…' : action.label}
          </button>
        ))}
      </div>
      {error && <span className="text-xs" style={{ color: C.red }}>{error}</span>}
    </div>
  )
}
