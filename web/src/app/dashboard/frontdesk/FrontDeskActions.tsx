'use client'
import { useState, useTransition } from 'react'
import { Check, X, LogIn, Play } from 'lucide-react'
import { updateAppointmentStatus, rejectPendingApprovalAppointment } from '../appointments/actions'

const NEXT: Record<string, { label: React.ReactNode; status: string; color: string }[]> = {
  pending:    [{ label: <span className="inline-flex items-center gap-1"><Check size={12} /> Confirm</span>,   status: 'confirmed',  color: 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20' }, { label: <span className="inline-flex items-center gap-1"><X size={12} /> Cancel</span>, status: 'cancelled', color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' }],
  confirmed:  [{ label: <span className="inline-flex items-center gap-1"><LogIn size={12} /> Check In</span>, status: 'checked_in', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' },  { label: <span className="inline-flex items-center gap-1"><X size={12} /> Cancel</span>, status: 'cancelled', color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' }],
  checked_in: [{ label: <span className="inline-flex items-center gap-1"><Play size={12} /> Start</span>,    status: 'in_progress', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20' }],
}

export function FrontDeskActions({ appointmentId, currentStatus, approvalStatus, bookingRef }: {
  appointmentId: string
  currentStatus: string
  approvalStatus: string | null
  bookingRef: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const actions = NEXT[currentStatus] ?? []
  if (!actions.length) return null

  function handleClick(targetStatus: string) {
    setError(null)
    startTransition(async () => {
      try {
        // WM11: cancelling a pending_approval appointment routes through reject flow
        if (targetStatus === 'cancelled' && approvalStatus === 'pending_approval') {
          await rejectPendingApprovalAppointment(appointmentId)
        } else {
          await updateAppointmentStatus(appointmentId, targetStatus)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {actions.map(a => (
          <button key={a.status} disabled={pending} onClick={() => handleClick(a.status)}
            className={`text-xs font-semibold px-4 py-1.5 rounded-full border transition-all disabled:opacity-50 ${a.color}`}>
            {pending ? '…' : a.label}
          </button>
        ))}
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
