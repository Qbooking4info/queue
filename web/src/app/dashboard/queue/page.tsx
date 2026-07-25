'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { X, RefreshCw, CheckCircle2, ClipboardList, AlertTriangle, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/dashboard/Badge'
import { SkeletonRow } from '@/components/dashboard/SkeletonRow'
import { checkInAppointment, startConsultation, endConsultation, getQueueForToday, getDoctorAppointments, approveAppointment, fmtLocalDate } from '@/lib/admin-api'
import type { AdminAppointment } from '@/lib/admin-api'

const QUEUE_STATUSES = ['confirmed', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled']

function statusColor(s: string) {
  if (s === 'pending')          return { bg: 'rgba(239,159,39,0.10)', text: '#EF9F27', border: 'rgba(239,159,39,0.25)' }
  if (s === 'pending_approval') return { bg: 'rgba(167,139,250,0.12)', text: '#A78BFA', border: 'rgba(167,139,250,0.3)' }
  if (s === 'confirmed')        return { bg: 'rgba(91,158,255,0.10)', text: '#5B9EFF', border: 'rgba(91,158,255,0.25)' }
  if (s === 'checked_in')       return { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' }
  if (s === 'in_progress')      return { bg: 'rgba(239,159,39,0.12)', text: '#EF9F27', border: 'rgba(239,159,39,0.3)' }
  if (s === 'completed')        return { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.3)' }
  if (s === 'cancelled' || s === 'no_show') return { bg: 'rgba(220,60,60,0.10)', text: '#f07070', border: 'rgba(220,60,60,0.25)' }
  return { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.12)' }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending: 'Pending', pending_approval: 'Awaiting Approval',
    confirmed: 'Confirmed', checked_in: 'Checked In', in_progress: 'In Progress',
    completed: 'Done', no_show: 'No-Show', cancelled: 'Cancelled',
  }
  return map[s] ?? s
}

function nextAction(status: string): { label: string; next: string } | null {
  if (status === 'pending')          return { label: 'Confirm',  next: 'confirmed' }
  if (status === 'pending_approval') return { label: 'Approve',  next: 'confirmed' }
  if (status === 'confirmed')        return { label: 'Check In', next: 'checked_in' }
  if (status === 'checked_in')       return { label: 'Start',    next: 'in_progress' }
  if (status === 'in_progress')      return { label: 'Complete', next: 'completed' }
  return null
}

export default function QueuePage() {
  const { theme: C } = useTheme()
  const { hospital, role, doctorId, clinicId, todayAppointments, reload } = useAdmin()
  const [appts, setAppts] = useState<AdminAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('active')
  const [actionError, setActionError] = useState('')

  const fetchQueue = useCallback(async () => {
    if (!hospital?.id) { setAppts(todayAppointments); setLoading(false); return }
    setLoading(true)
    let data: AdminAppointment[]
    if (role === 'doctor' && doctorId) {
      // Fetch fresh from API so actions always show the latest state
      const today = fmtLocalDate(new Date())
      data = await getDoctorAppointments(doctorId, today, today)
    } else if ((role === 'clinic_admin' || role === 'front_desk') && clinicId) {
      data = await getQueueForToday(hospital.id, clinicId)
    } else {
      data = await getQueueForToday(hospital.id)
    }
    setAppts(data)
    setLoading(false)
  }, [hospital?.id, role, doctorId, clinicId])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  useEffect(() => {
    if (!hospital?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel(`queue:hospital:${hospital.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'appointments',
        filter: `hospital_id=eq.${hospital.id}`,
      }, () => { fetchQueue() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [hospital?.id, fetchQueue])

  async function advance(id: string, next: string, currentStatus: string) {
    setUpdating(id)
    setActionError('')
    try {
      let result: { error: string | null } = { error: null }
      if (next === 'confirmed') {
        if (currentStatus === 'pending_approval') {
          // Use approveAppointment so that the patient receives a confirmation notification
          // and the proper approval_status='approved' guard is respected.
          await approveAppointment(id)
        } else {
          // pending -> confirmed: only flip status; do NOT touch approval_status which may
          // already be 'auto_approved' (changing it to 'approved' would incorrectly imply
          // a manual review happened when none did).
          const supabaseClient = createClient()
          const r = await (supabaseClient as any)
            .from('appointments')
            .update({ status: 'confirmed' })
            .eq('id', id)
            .in('status', ['pending'])
          result = { error: r.error?.message ?? null }
        }
      } else if (next === 'checked_in') {
        result = await checkInAppointment(id)
      } else if (next === 'in_progress') {
        result = await startConsultation(id)
      } else if (next === 'completed') {
        result = await endConsultation(id)
      }
      if (result.error) setActionError(result.error)
    } catch {
      setActionError('Action failed — please try again')
    }
    await fetchQueue()
    setUpdating(null)
  }

  const active  = appts.filter(a => ['pending', 'pending_approval', 'confirmed', 'checked_in', 'in_progress'].includes(a.status))
  const done    = appts.filter(a => ['completed', 'no_show', 'cancelled'].includes(a.status))
  const shown   = filter === 'active' ? active : filter === 'done' ? done : appts

  const waiting    = active.filter(a => ['pending', 'pending_approval', 'confirmed'].includes(a.status)).length
  const inProgress = active.filter(a => a.status === 'in_progress').length
  const completed  = done.filter(a => a.status === 'completed').length

  return (
    <div>
      <style>{`
        .queue-chips { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
        .queue-filter-row { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .queue-item { display: flex; align-items: center; gap: 14px; }
        @media (max-width: 767px) {
          .queue-chips { grid-template-columns: repeat(2,1fr); gap: 8px; }
          .queue-filter-row { gap: 6px; }
          .queue-filter-row button { padding: 6px 12px !important; font-size: 12px !important; }
          .queue-item { gap: 8px; }
          .queue-item-meta { display: none; }
          .queue-item-ref { display: none; }
        }
      `}</style>
      <div style={{ marginBottom: 16 }}>
        <div className="dash-greeting-title" style={{ color: C.text }}>Live Queue</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Summary chips */}
      <div className="queue-chips">
        {[
          { label: 'Waiting',     value: waiting,    color: 'rgba(255,255,255,0.55)' },
          { label: 'In Progress', value: inProgress, color: '#EF9F27' },
          { label: 'Completed',   value: completed,  color: '#4ade80' },
          { label: 'Total Today', value: appts.length, color: C.accent },
        ].map(chip => (
          <div key={chip.label} style={{ padding: 'clamp(12px,2.5vw,16px) clamp(14px,2.5vw,20px)', borderRadius: 14,
            background: C.card, border: `1px solid ${C.border}` }}>
            <div className="dash-stat-value" style={{ color: chip.color }}>{chip.value}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{chip.label}</div>
          </div>
        ))}
      </div>

      {actionError && (
        <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
          borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070',
          marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{display:'flex',alignItems:'center',gap:4}}><svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>{actionError}</span>
          <button onClick={() => setActionError('')}
            style={{ background: 'none', border: 'none', color: '#f07070', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="queue-filter-row">
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
            background: 'transparent', color: C.textMuted, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Queue list */}
      {loading ? (
        <div>
          {[64, 56, 64, 56, 64].map((h, i) => (
            <SkeletonRow key={i} height={h} mb={10} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: C.textMuted }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            {filter === 'active' ? <CheckCircle2 size={36} /> : <ClipboardList size={36} />}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            {filter === 'active' ? 'Queue is clear' : 'No appointments'}
          </div>
          <div style={{ fontSize: 13 }}>
            {filter === 'active'
              ? 'No active patients in queue right now.'
              : 'No appointments for today in this view.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((appt, idx) => {
            const sc = statusColor(appt.status)
            const action = nextAction(appt.status)
            const isUpdating = updating === appt.id
            const isEmergency = appt.urgency === 'emergency'
            return (
              <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 14,
                background: isEmergency ? C.redLight : C.card,
                border: `1px solid ${isEmergency ? C.red : appt.status === 'in_progress' ? C.accentBorder : C.border}`,
                borderLeftWidth: isEmergency ? 4 : 1,
                boxShadow: appt.status === 'in_progress' && !isEmergency ? `0 0 0 1px ${C.accentBorder}` : 'none' }}>

                {/* Queue number */}
                <div style={{ width: 36, height: 36, borderRadius: 10,
                  background: isEmergency ? C.red : 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: isEmergency ? '#fff' : 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                  {appt.queue_position ?? idx + 1}
                </div>

                {/* Patient info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{appt.patient_name}</div>
                    {isEmergency && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                        background: C.red, color: '#fff', whiteSpace: 'nowrap',
                        display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <AlertTriangle size={10} /> EMERGENCY
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span>
                      {appt.start_time} · Dr. {appt.doctor_name}
                      {appt.booking_ref ? ` · #${appt.booking_ref}` : ''}
                      {appt.status === 'checked_in' && appt.estimated_wait != null ? ` · ~${appt.estimated_wait}m wait` : ''}
                    </span>
                    {appt.status === 'completed' && appt.consult_duration_secs != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        · <Clock size={11} /> {Math.round(appt.consult_duration_secs / 60)} min
                      </span>
                    )}
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
                  <button onClick={() => advance(appt.id, action.next, appt.status)} disabled={isUpdating}
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
