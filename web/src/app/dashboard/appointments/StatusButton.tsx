'use client'
import { useState, useTransition } from 'react'
import { updateAppointmentStatus } from './actions'

const NEXT_ACTIONS: Record<string, { label: string; status: string; color: string }[]> = {
  pending:     [{ label: 'Confirm', status: 'confirmed', color: 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20' }, { label: 'Cancel', status: 'cancelled', color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' }],
  confirmed:   [{ label: 'Check In', status: 'checked_in', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' }, { label: 'Cancel', status: 'cancelled', color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' }],
  checked_in:  [{ label: 'Start', status: 'in_progress', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' }],
  in_progress: [{ label: 'Complete', status: 'completed', color: 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20' }, { label: 'No Show', status: 'no_show', color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' }],
}

export function StatusButton({ appointmentId, currentStatus }: { appointmentId: string; currentStatus: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const actions = NEXT_ACTIONS[currentStatus] ?? []
  if (!actions.length) return null

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
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 ${action.color}`}>
            {pending ? '…' : action.label}
          </button>
        ))}
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
