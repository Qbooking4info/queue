'use client'
import { useState, useTransition } from 'react'
import { Check, X, LogIn, Play } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { updateAppointmentStatus, approvePendingApprovalAppointment, rejectPendingApprovalAppointment } from '../appointments/actions'

// Never called useTheme() -- same bug as StatusButton.tsx (its appointments/ sibling,
// fixed alongside this one): every color was a static Tailwind class, frozen
// regardless of the clinical/forest toggle.
export function FrontDeskActions({ appointmentId, currentStatus, approvalStatus, bookingRef }: {
  appointmentId: string
  currentStatus: string
  approvalStatus: string | null
  bookingRef: string
}) {
  const { theme: C } = useTheme()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const NEXT: Record<string, { label: React.ReactNode; status: string; bg: string; border: string; color: string }[]> = {
    pending: [
      { label: <span className="inline-flex items-center gap-1"><Check size={12} /> Confirm</span>, status: 'confirmed', bg: C.accentLight, border: C.accentBorder, color: C.accent },
      { label: <span className="inline-flex items-center gap-1"><X size={12} /> Cancel</span>, status: 'cancelled', bg: C.redLight, border: `${C.red}4D`, color: C.red },
    ],
    confirmed: [
      { label: <span className="inline-flex items-center gap-1"><LogIn size={12} /> Check In</span>, status: 'checked_in', bg: C.infoBg, border: C.infoBorder, color: C.info },
      { label: <span className="inline-flex items-center gap-1"><X size={12} /> Cancel</span>, status: 'cancelled', bg: C.redLight, border: `${C.red}4D`, color: C.red },
    ],
    checked_in: [
      { label: <span className="inline-flex items-center gap-1"><Play size={12} /> Start</span>, status: 'in_progress', bg: C.infoBg, border: C.infoBorder, color: C.info },
    ],
  }
  const actions = NEXT[currentStatus] ?? []
  if (!actions.length) return null

  function handleClick(targetStatus: string) {
    setError(null)
    startTransition(async () => {
      try {
        // WM11: cancelling a pending_approval appointment routes through reject flow
        if (targetStatus === 'cancelled' && approvalStatus === 'pending_approval') {
          await rejectPendingApprovalAppointment(appointmentId)
        } else if (targetStatus === 'confirmed' && approvalStatus === 'pending_approval') {
          // Confirming a pending_approval booking must go through the approve flow so
          // approval_status actually clears and the patient gets notified -- a bare
          // status flip here would leave approval_status stuck at 'pending_approval' forever.
          await approvePendingApprovalAppointment(appointmentId)
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
            className="text-xs font-semibold px-4 py-1.5 rounded-full border transition-all disabled:opacity-50"
            style={{ background: a.bg, borderColor: a.border, color: a.color }}>
            {pending ? '…' : a.label}
          </button>
        ))}
      </div>
      {error && <span className="text-xs" style={{ color: C.red }}>{error}</span>}
    </div>
  )
}
