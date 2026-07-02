'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { Badge } from '@/components/dashboard/Badge'
import { updateAppointmentStatus, getAppointments, getClinicAppointments } from '@/lib/admin-api'
import type { AdminAppointment } from '@/lib/admin-api'

const QUEUE_STATUSES = ['confirmed', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled']

function statusColor(s: string) {
  if (s === 'checked_in')  return { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' }
  if (s === 'in_progress') return { bg: 'rgba(239,159,39,0.12)', text: '#EF9F27', border: 'rgba(239,159,39,0.3)' }
  if (s === 'completed')   return { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.3)' }
  if (s === 'cancelled' || s === 'no_show') return { bg: 'rgba(220,60,60,0.10)', text: '#f07070', border: 'rgba(220,60,60,0.25)' }
  return { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.12)' }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    confirmed: 'Waiting', checked_in: 'Checked In', in_progress: 'In Progress',
    completed: 'Done', no_show: 'No-Show', cancelled: 'Cancelled',
  }
  return map[s] ?? s
}

function nextAction(status: string): { label: string; next: string } | null {
  if (status === 'confirmed')   return { label: 'Check In',   next: 'checked_in' }
  if (status === 'checked_in')  return { label: 'Start',      next: 'in_progress' }
  if (status === 'in_progress') return { label: 'Complete',   next: 'completed' }
  return null
}

export default function QueuePage() {
  const { theme: C } = useTheme()
  const { hospital, role, doctorId, clinicId, todayAppointments, reload } = useAdmin()
  const [appts, setAppts] = useState<AdminAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('active')

  const today = new Date().toISOString().split('T')[0]

  const fetchQueue = useCallback(async () => {
    if (!hospital?.id) { setAppts(todayAppointments); setLoading(false); return }
    setLoading(true)
    let data: AdminAppointment[]
    if (role === 'doctor' && doctorId) {
      data = todayAppointments
    } else if ((role === 'clinic_admin' || role === 'front_desk') && clinicId) {
      data = await getClinicAppointments(hospital.id, clinicId, today, today)
    } else {
      data = await getAppointments(hospital.id, today, today)
    }
    setAppts(data)
    setLoading(false)
  }, [hospital?.id, role, doctorId, clinicId, today, todayAppointments])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  async function advance(id: string, next: string) {
    setUpdating(id)
    await updateAppointmentStatus(id, next)
    await fetchQueue()
    setUpdating(null)
  }

  const active  = appts.filter(a => ['confirmed', 'checked_in', 'in_progress'].includes(a.status))
  const done    = appts.filter(a => ['completed', 'no_show', 'cancelled'].includes(a.status))
  const shown   = filter === 'active' ? active : filter === 'done' ? done : appts

  const waiting    = active.filter(a => a.status === 'confirmed').length
  const inProgress = active.filter(a => a.status === 'in_progress').length
  const completed  = done.filter(a => a.status === 'completed').length

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>
          Live Queue
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Waiting',     value: waiting,    color: 'rgba(255,255,255,0.55)' },
          { label: 'In Progress', value: inProgress, color: '#EF9F27' },
          { label: 'Completed',   value: completed,  color: '#4ade80' },
          { label: 'Total Today', value: appts.length, color: C.accent },
        ].map(chip => (
          <div key={chip.label} style={{ flex: '1 1 140px', padding: '16px 20px', borderRadius: 14,
            background: C.card, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: chip.color }}>{chip.value}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{chip.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'active', label: `Active (${active.length})` },
          { key: 'done',   label: `Done (${done.length})` },
          { key: 'all',    label: `All (${appts.length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            style={{ padding: '7px 18px', borderRadius: 99, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: `1px solid ${filter === tab.key ? C.accent : C.border}`,
              background: filter === tab.key ? C.accentMid : 'transparent',
              color: filter === tab.key ? C.accent : C.textMuted,
              fontFamily: 'inherit', transition: 'all .15s' }}>
            {tab.label}
          </button>
        ))}
        <button onClick={() => { fetchQueue(); reload() }}
          style={{ marginLeft: 'auto', padding: '7px 18px', borderRadius: 99, fontSize: 13,
            fontWeight: 600, cursor: 'pointer', border: `1px solid ${C.border}`,
            background: 'transparent', color: C.textMuted, fontFamily: 'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Queue list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>Loading queue…</div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>
          {filter === 'active' ? 'No active patients in queue' : 'No appointments'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((appt, idx) => {
            const sc = statusColor(appt.status)
            const action = nextAction(appt.status)
            const isUpdating = updating === appt.id
            return (
              <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 14, background: C.card,
                border: `1px solid ${appt.status === 'in_progress' ? C.accentBorder : C.border}`,
                boxShadow: appt.status === 'in_progress' ? `0 0 0 1px ${C.accentBorder}` : 'none' }}>

                {/* Queue number */}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                  {idx + 1}
                </div>

                {/* Patient info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{appt.patient_name}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {appt.start_time} · Dr. {appt.doctor_name}
                    {appt.booking_ref ? ` · #${appt.booking_ref}` : ''}
                  </div>
                </div>

                {/* Status badge */}
                <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                  whiteSpace: 'nowrap' }}>
                  {statusLabel(appt.status)}
                </span>

                {/* Action button */}
                {action && (role === 'front_desk' || role === 'clinic_admin' || role === 'hospital_admin' || role === 'doctor') && (
                  <button onClick={() => advance(appt.id, action.next)} disabled={isUpdating}
                    style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: isUpdating ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                      background: C.accentMid, color: C.accent, border: `1px solid ${C.accentBorder}`,
                      fontFamily: 'inherit', opacity: isUpdating ? 0.6 : 1, transition: 'opacity .15s' }}>
                    {isUpdating ? '…' : action.label}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
