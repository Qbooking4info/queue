'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { Badge } from '@/components/dashboard/Badge'
import { VitalsModal } from '@/components/dashboard/VitalsModal'
import { SkeletonRow } from '@/components/dashboard/SkeletonRow'
import { DateFilter, getDateBounds } from '@/components/dashboard/DateFilter'
import type { DateRangeKey, DateBounds } from '@/components/dashboard/DateFilter'
import type { AdminAppointment, AdminDoctor } from '@/lib/admin-api'
import { T, SPACE } from '@/lib/typography'
import {
  getAppointments, getClinicAppointments, getDoctorAppointments,
  assignDoctorToAppointment, markNoShow,
  approveAppointment, rejectAppointment,
  checkInAppointment, startConsultation, endConsultation,
  getDoctors as getDoctorsForHospital,
  fmtLocalDate,
} from '@/lib/admin-api'
import { CheckCircle2, ClipboardList } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['all','pending_review','pending','confirmed','checked_in','in_progress','completed','cancelled','no_show']

const DOC_COLORS: Record<string, string> = {}
const PALETTE = ['#1A4A32','#1A2A4A','#3A1A4A','#4A2A1A','#2A1A4A','#1A3A4A']
function docColor(name: string) {
  if (!DOC_COLORS[name]) DOC_COLORS[name] = PALETTE[Object.keys(DOC_COLORS).length % PALETTE.length]
  return DOC_COLORS[name]
}
function filterLabel(f: string) {
  const m: Record<string, string> = {
    pending_review: 'Pending Review', checked_in: 'Checked In',
    in_progress: 'In Progress', no_show: 'No-Show',
  }
  return m[f] ?? f.charAt(0).toUpperCase() + f.slice(1)
}
function urgencyColor(u: string | undefined, C: any) {
  if (u === 'emergency') return { bg: C.redLight, text: C.red, border: `${C.red}4D` }
  if (u === 'urgent')    return { bg: 'rgba(239,159,39,0.12)', text: '#EF9F27', border: 'rgba(239,159,39,0.3)' }
  return null
}

// ── Walk-in Booking Modal ─────────────────────────────────────────────────────

function WalkInModal({
  hospitalId, doctors, onClose, onDone,
}: { hospitalId: string; doctors: AdminDoctor[]; onClose: () => void; onDone: () => void }) {
  const { theme: C } = useTheme()
  const [clinics,       setClinics]       = useState<{ id: string; name: string; is_opd: boolean }[]>([])
  const [patientNumber, setPatientNumber] = useState('')
  const [foundPatient,  setFoundPatient]  = useState<{ id: string; full_name: string; phone: string | null; patient_number: string } | null>(null)
  const [searching,     setSearching]     = useState(false)
  const [name,          setName]          = useState('')
  const [phone,         setPhone]         = useState('')
  const [clinicId,      setClinicId]      = useState('')
  const [doctorId,      setDoctorId]      = useState('')

  // Doctors filtered to the selected clinic; if no clinic chosen, show all
  const availableDoctors = clinicId
    ? doctors.filter(d => d.is_active && d.clinic_id === clinicId)
    : doctors.filter(d => d.is_active)
  const [date,          setDate]          = useState(fmtLocalDate(new Date()))
  const [time,          setTime]          = useState('09:00')
  const [reason,        setReason]        = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [done,          setDone]          = useState('')

  useEffect(() => {
    fetch(`/api/clinics?hospitalId=${hospitalId}`)
      .then(r => r.json())
      .then(data => setClinics(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [hospitalId])

  async function searchByPatientNumber() {
    const q = patientNumber.trim().toUpperCase()
    if (!q) return
    setSearching(true); setFoundPatient(null); setError('')
    const res = await fetch(`/api/appointments/walkin?patientNumber=${encodeURIComponent(q)}`)
    const json = await res.json()
    setSearching(false)
    if (json.found) {
      setFoundPatient(json.patient)
      setName(json.patient.full_name)
      setPhone(json.patient.phone ?? '')
    } else {
      setError(`No registered patient found with number ${q}`)
    }
  }

  async function searchByPhone() {
    const q = phone.trim()
    if (!q || foundPatient) return
    const res = await fetch(`/api/appointments/walkin?phone=${encodeURIComponent(q)}`)
    const json = await res.json()
    if (json.found) {
      setFoundPatient(json.patient)
      setName(json.patient.full_name)
      setPatientNumber(json.patient.patient_number ?? '')
    }
  }

  function clearPatient() {
    setFoundPatient(null); setPatientNumber(''); setName(''); setPhone('')
  }

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true); setError('')
    const res = await fetch('/api/appointments/walkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalId,
        patientName:   name.trim(),
        patientPhone:  phone.trim()         || undefined,
        patientNumber: patientNumber.trim() || undefined,
        clinicId:      clinicId             || undefined,
        doctorId:      doctorId             || undefined,
        date, startTime: time, reason: reason.trim(),
      }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    setDone(json.bookingRef)
    onDone()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 480, background: C.card,
        border: `1px solid ${C.borderMed}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Walk-in Booking</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
              Book an appointment for a patient at the front desk
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 8, background: C.bgAlt,
              border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircle2 size={40} style={{ opacity: 0.8, display: 'block', margin: '0 auto 12px', color: '#22c55e' }} />
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 6 }}>Booking Created</div>
              <div style={{ fontSize: 14, color: C.textSub, marginBottom: 4 }}>Reference:</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.accent, fontFamily: 'monospace' }}>{done}</div>
              <button onClick={onClose}
                style={{ marginTop: 20, padding: '10px 32px', borderRadius: 10, background: C.accent,
                  color: C.id === 'forest' ? '#061208' : '#fff', border: 'none',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Patient number lookup */}
              <div style={{ background: C.bgAlt, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
                <label style={lbl}>Patient Number (QB-XXXXXX)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={patientNumber}
                    onChange={e => { setPatientNumber(e.target.value.toUpperCase()); setFoundPatient(null) }}
                    onKeyDown={e => e.key === 'Enter' && searchByPatientNumber()}
                    placeholder="QB-001234"
                    style={{ ...inputStyle, flex: 1 }}
                    disabled={!!foundPatient}
                  />
                  {foundPatient ? (
                    <button onClick={clearPatient}
                      style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
                        background: C.bgAlt, color: C.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      Clear
                    </button>
                  ) : (
                    <button onClick={searchByPatientNumber} disabled={!patientNumber.trim() || searching}
                      style={{ padding: '10px 16px', borderRadius: 10, border: 'none',
                        background: patientNumber.trim() ? C.accent : C.bgAlt,
                        color: patientNumber.trim() ? (C.id === 'forest' ? '#061208' : '#fff') : C.textMuted,
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {searching ? '…' : 'Look up'}
                    </button>
                  )}
                </div>
                {foundPatient && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: C.accentLight ?? 'rgba(0,200,100,0.08)',
                    borderRadius: 8, border: `1px solid ${C.accentBorder}`, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <CheckCircle2 size={16} color="#22c55e" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{foundPatient.full_name}</div>
                      <div style={{ fontSize: 11, color: C.textSub }}>
                        {foundPatient.patient_number} · {foundPatient.phone ?? 'No phone'}
                      </div>
                    </div>
                  </div>
                )}
                {!foundPatient && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
                    App patients have a QB number on their profile. Leave blank for first-time or unregistered patients.
                  </div>
                )}
              </div>

              {/* Manual patient details */}
              <div>
                <label style={lbl}>Patient Name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Chukwuemeka Obi" style={inputStyle}
                  disabled={!!foundPatient} />
              </div>
              <div>
                <label style={lbl}>Phone (optional)</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  onBlur={searchByPhone}
                  placeholder="08012345678" style={inputStyle}
                  disabled={!!foundPatient} />
              </div>

              {clinics.length > 0 && (
                <div>
                  <label style={lbl}>Clinic / Department</label>
                  <select value={clinicId} onChange={e => { setClinicId(e.target.value); setDoctorId('') }} style={inputStyle}>
                    <option value="">— General / Main Hospital —</option>
                    {clinics.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Date *</label>
                  <input type="date" value={date} min={fmtLocalDate(new Date())} onChange={e => setDate(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Time *</label>
                  <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={lbl}>
                  Assign Doctor (optional)
                  {clinicId && availableDoctors.length === 0 && (
                    <span style={{ color: '#f07070', fontWeight: 400, marginLeft: 6, textTransform: 'none' }}>
                      — no doctors in this clinic
                    </span>
                  )}
                </label>
                <select value={doctorId} onChange={e => setDoctorId(e.target.value)} style={inputStyle}
                  disabled={clinicId !== '' && availableDoctors.length === 0}>
                  <option value="">— Assign later —</option>
                  {availableDoctors.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.title ? `${d.title} ` : ''}{d.full_name}{d.specialty_name ? ` · ${d.specialty_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Reason / Chief Complaint</label>
                <input value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Fever and headache" style={inputStyle} />
              </div>
              {error && (
                <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
                  borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070' }}>
                  ⚠️ {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                    background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                    color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={loading || !name.trim()}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, fontFamily: 'inherit',
                    background: name.trim() ? C.accent : C.bgAlt,
                    color: name.trim() ? (C.id === 'forest' ? '#061208' : '#fff') : C.textMuted,
                    border: 'none', fontSize: 13, fontWeight: 700,
                    cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Creating…' : 'Create Booking'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Assign Doctor Modal ───────────────────────────────────────────────────────

function AssignDoctorModal({
  appointment, doctors, onClose, onDone,
}: { appointment: AdminAppointment; doctors: AdminDoctor[]; onClose: () => void; onDone: (doctorId: string) => void }) {
  const { theme: C } = useTheme()
  const currentDoctorId = appointment.assigned_doctor_id ?? appointment.doctor_id ?? ''
  const isReassign = !!currentDoctorId
  const [selected, setSelected] = useState(currentDoctorId)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Only show doctors from the appointment's clinic (if one is assigned)
  const eligibleDoctors = appointment.clinic_id
    ? doctors.filter(d => d.is_active && d.clinic_id === appointment.clinic_id)
    : doctors.filter(d => d.is_active)

  async function handleAssign() {
    if (!selected) return
    setSaving(true)
    setError(null)
    const { error } = await assignDoctorToAppointment(appointment.id, selected)
    setSaving(false)
    if (error) { setError(error); return }
    onDone(selected)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 420, background: C.card,
        border: `1px solid ${C.borderMed}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            {isReassign ? 'Reassign Doctor' : 'Assign Doctor'} — {appointment.patient_name}
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 7, background: C.bgAlt,
              border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer', fontSize: 14 }}>
            ✕
          </button>
        </div>
        {appointment.clinic_id && (
          <div style={{ padding: '8px 22px', background: C.bgAlt, borderBottom: `1px solid ${C.border}`,
            fontSize: 11, color: C.textMuted }}>
            Showing doctors registered to this appointment's clinic only
          </div>
        )}
        <div style={{ padding: '16px 22px', maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {eligibleDoctors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: C.textMuted, fontSize: 13 }}>
              No doctors registered to this clinic yet
            </div>
          ) : eligibleDoctors.map(d => (
            <button key={d.id} onClick={() => setSelected(d.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                padding: '11px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${selected === d.id ? C.accent : C.border}`,
                background: selected === d.id ? C.accentLight : C.bgAlt }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: docColor(d.full_name),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                {d.avatar}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {d.title ? `${d.title} ` : ''}{d.full_name}
                </div>
                <div style={{ fontSize: 11, color: C.textSub }}>{d.specialty_name ?? 'General'}</div>
              </div>
              {selected === d.id && <CheckCircle2 size={15} color={C.accent} />}
            </button>
          ))}
        </div>
        {error && (
          <div style={{ margin: '0 22px 14px', background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
            borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070' }}>
            ⚠️ {error}
          </div>
        )}
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
              background: C.bgAlt, border: `1px solid ${C.borderMed}`,
              color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={handleAssign} disabled={!selected || selected === currentDoctorId || saving}
            style={{ flex: 2, padding: '10px', borderRadius: 10, fontFamily: 'inherit',
              background: selected && selected !== currentDoctorId ? C.accent : C.bgAlt,
              color: selected && selected !== currentDoctorId ? (C.id === 'forest' ? '#061208' : '#fff') : C.textMuted,
              border: 'none', fontSize: 13, fontWeight: 700,
              cursor: !selected || selected === currentDoctorId || saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1 }}>
            {saving ? (isReassign ? 'Reassigning…' : 'Assigning…') : (isReassign ? 'Reassign Doctor' : 'Assign Doctor')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({
  appointment, onClose, onDone,
}: { appointment: AdminAppointment; onClose: () => void; onDone: () => void }) {
  const { theme: C } = useTheme()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleReject() {
    if (!note.trim()) return
    setSaving(true)
    await rejectAppointment(appointment.id, note.trim())
    setSaving(false)
    onDone()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 420, background: C.card,
        border: '1px solid rgba(220,60,60,0.25)', borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', padding: '24px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>
          Reject Booking
        </div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>
          Patient <strong style={{ color: C.text }}>{appointment.patient_name}</strong> will receive a full refund.
        </div>
        <textarea
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="Reason for rejection (required)…"
          rows={3}
          style={{ width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
            borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text,
            outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
              background: C.bgAlt, border: `1px solid ${C.borderMed}`,
              color: C.textSub, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={handleReject} disabled={saving || !note.trim()}
            style={{ flex: 1, padding: '10px', borderRadius: 10, fontFamily: 'inherit',
              background: note.trim() ? 'rgba(220,60,60,0.15)' : C.bgAlt,
              border: note.trim() ? '1px solid rgba(220,60,60,0.3)' : `1px solid ${C.border}`,
              color: note.trim() ? '#f07070' : C.textMuted,
              fontSize: 13, fontWeight: 700,
              cursor: !note.trim() || saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Rejecting…' : 'Reject & Refund'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Appointment Detail Panel ──────────────────────────────────────────────────

function DetailPanel({
  appt, onClose,
}: { appt: AdminAppointment; onClose: () => void }) {
  const { theme: C } = useTheme()
  const urg = urgencyColor(appt.urgency, C)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 440, background: C.card,
        border: `1px solid ${C.borderMed}`, borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Appointment Detail</div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 7, background: C.bgAlt,
              border: `1px solid ${C.border}`, color: C.textMuted, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Ref',           value: appt.booking_ref },
            { label: 'Patient',       value: appt.patient_name },
            { label: 'Date / Time',   value: `${appt.appointment_date} · ${appt.start_time}` },
            { label: 'Doctor',        value: appt.doctor_name || (appt.assigned_doctor_name ? `Assigned: ${appt.assigned_doctor_name}` : 'Unassigned') },
            { label: 'Type',          value: appt.type === 'virtual' ? '💻 Virtual' : '🏥 In-person' },
            { label: 'Mode',          value: appt.booking_mode === 'walkin' ? '🚶 Walk-in' : appt.booking_mode === 'hospital' ? '🏥 Hospital (OPD)' : '👨‍⚕️ Doctor-specific' },
            { label: 'Urgency',       value: appt.urgency ?? 'Routine' },
            { label: 'Reason',        value: appt.reason ?? '—' },
            { label: 'Clinic',        value: appt.clinic_name ?? 'Main Hospital' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, width: 90, flexShrink: 0,
                textTransform: 'uppercase', letterSpacing: '.04em' }}>{row.label}</span>
              <span style={{ fontSize: 13, color: C.text }}>{row.value}</span>
            </div>
          ))}
          {appt.symptom_description && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase',
                letterSpacing: '.04em', marginBottom: 6 }}>Symptoms / Description</div>
              <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '10px 14px', fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                {appt.symptom_description}
              </div>
            </div>
          )}
          {appt.approval_note && (
            <div style={{ background: 'rgba(239,159,39,0.1)', border: '1px solid rgba(239,159,39,0.25)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#EF9F27' }}>
              📋 {appt.approval_note}
            </div>
          )}
          {urg && (
            <div style={{ background: urg.bg, border: `1px solid ${urg.border}`,
              borderRadius: 10, padding: '8px 14px', fontSize: 12, color: urg.text, fontWeight: 700 }}>
              {appt.urgency === 'emergency' ? '🚨' : '⚡'} {(appt.urgency ?? 'routine').toUpperCase()} — handle as priority
            </div>
          )}
          {appt.no_show_at && appt.reschedule_deadline && (
            <div style={{ background: 'rgba(85,167,235,0.1)', border: '1px solid rgba(85,167,235,0.25)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
              <div style={{ color: '#55A7EB', fontWeight: 700, marginBottom: 4 }}>No-Show recorded</div>
              <div style={{ color: C.textSub }}>
                Patient has until {new Date(appt.reschedule_deadline).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })} to reschedule for free (48-hr window).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const { theme: C } = useTheme()
  const { hospital, role, clinicId: userClinicId, doctorId: userDoctorId, user } = useAdmin()

  const isDoctor         = role === 'doctor'
  const isScopedToClinic = (role === 'clinic_admin' || role === 'front_desk') && !!userClinicId

  const [range,   setRange]   = useState<DateRangeKey>('this_week')
  const [bounds,  setBounds]  = useState<DateBounds>(getDateBounds('this_week'))
  const [appts,   setAppts]   = useState<AdminAppointment[]>([])
  const [doctors, setDoctors] = useState<AdminDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')

  const [showWalkIn,     setShowWalkIn]     = useState(false)
  const [assignAppt,     setAssignAppt]     = useState<AdminAppointment | null>(null)
  const [rejectAppt,     setRejectAppt]     = useState<AdminAppointment | null>(null)
  const [detailAppt,     setDetailAppt]     = useState<AdminAppointment | null>(null)
  const [vitalsAppt,     setVitalsAppt]     = useState<AdminAppointment | null>(null)
  const [actionError,    setActionError]    = useState('')
  const [pendingActionId,setPendingActionId]= useState<string | null>(null)

  const load = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    if (isDoctor && userDoctorId) {
      const a = await getDoctorAppointments(userDoctorId, bounds.from, bounds.to)
      setAppts(a); setDoctors([])
    } else {
      const [a, d] = await Promise.all([
        isScopedToClinic
          ? getClinicAppointments(hospital.id, userClinicId!, bounds.from, bounds.to)
          : getAppointments(hospital.id, bounds.from, bounds.to),
        getDoctorsForHospital(hospital.id, isScopedToClinic ? userClinicId! : undefined),
      ])
      setAppts(a); setDoctors(d)
    }
    setLoading(false)
  }, [hospital?.id, bounds, isDoctor, userDoctorId, isScopedToClinic, userClinicId])

  useEffect(() => { load() }, [load])

  // Realtime: refresh whenever a new appointment lands for this hospital
  useEffect(() => {
    if (!hospital?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel(`appointments:hospital:${hospital.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `hospital_id=eq.${hospital.id}`,
      }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [hospital?.id, load])

  async function handleApprove(appt: AdminAppointment) {
    setPendingActionId(appt.id)
    try { await approveAppointment(appt.id); await load() } finally { setPendingActionId(null) }
  }

  async function handleNoShow(appt: AdminAppointment) {
    setPendingActionId(appt.id)
    try { await markNoShow(appt.id); await load() } finally { setPendingActionId(null) }
  }

  async function handleCheckIn(appt: AdminAppointment) {
    setActionError(''); setPendingActionId(appt.id)
    try {
      const { error } = await checkInAppointment(appt.id)
      if (error) { setActionError(error); return }
      await load()
    } finally { setPendingActionId(null) }
  }

  async function handleStartConsult(appt: AdminAppointment) {
    setActionError(''); setPendingActionId(appt.id)
    try {
      const { error } = await startConsultation(appt.id)
      if (error) { setActionError(error); return }
      await load()
    } finally { setPendingActionId(null) }
  }

  async function handleEndConsult(appt: AdminAppointment) {
    setActionError(''); setPendingActionId(appt.id)
    try {
      const { error } = await endConsultation(appt.id)
      if (error) { setActionError(error); return }
      await load()
    } finally { setPendingActionId(null) }
  }

  function formatDuration(secs: number) {
    const m = Math.round(secs / 60)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }

  const filtered = appts.filter(a => {
    const mf = filter === 'all'
      ? true
      : filter === 'pending_review'
        ? a.approval_status === 'pending_approval'
        : a.status === filter
    const ms = !search.trim() ||
      a.patient_name.toLowerCase().includes(search.toLowerCase()) ||
      a.doctor_name.toLowerCase().includes(search.toLowerCase()) ||
      a.booking_ref.toLowerCase().includes(search.toLowerCase()) ||
      (a.clinic_name ?? '').toLowerCase().includes(search.toLowerCase())
    return mf && ms
  })

  const pendingApproval = appts.filter(a => a.approval_status === 'pending_approval').length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.lg }}>
        <div>
          <div style={{ ...T.display, color: C.text }}>Appointments</div>
          <div style={{ ...T.body, color: C.textSub, marginTop: SPACE.xs }}>
            {appts.length} record{appts.length !== 1 ? 's' : ''}
            {!isDoctor && ' · all clinics'}
            {!isDoctor && pendingApproval > 0 && (
              <span style={{ marginLeft: 10, background: 'rgba(239,159,39,0.15)',
                border: '1px solid rgba(239,159,39,0.3)', color: '#EF9F27',
                ...T.caption, fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>
                {pendingApproval} pending approval
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: SPACE.sm }}>
          {!isDoctor && (
            <button onClick={() => setShowWalkIn(true)}
              style={{ background: C.bgAlt, color: C.text, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '10px 18px', ...T.body, fontWeight: 700, cursor: 'pointer',
                transition: 'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              + Walk-in Booking
            </button>
          )}
          <button onClick={load}
            style={{ background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
              border: 'none', borderRadius: 10, padding: '10px 18px', ...T.body, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '12px 16px', marginBottom: 14 }}>
        <DateFilter value={range} onChange={(key, b) => { setRange(key); setBounds(b) }} label="Period" />
      </div>

      {/* Search + status filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '9px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: C.textMuted }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search patient, doctor, booking ID…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13,
              color: C.text, background: 'none', fontFamily: 'inherit' }} />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${filter === f ? C.accent : C.border}`,
              background: filter === f ? C.accentLight : C.card,
              color: filter === f ? C.accent : C.textSub, transition: 'all .15s' }}>
              {filterLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
          borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070',
          marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{display:'flex',alignItems:'center',gap:4}}><svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>{actionError}</span>
          <button onClick={() => setActionError('')} aria-label="Close"
            style={{ background: 'none', border: 'none', color: '#f07070', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bgAlt }}>
              {['Date','Time','ID','Patient','Clinic','Doctor / Mode','Type','Urgency','Status','Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', ...T.label,
                  color: C.textMuted,
                  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: 0 }}>
                <div style={{ padding: '24px 20px' }}>
                  {[56, 48, 56, 48, 56, 48].map((h, i) => (
                    <SkeletonRow key={i} height={h} mb={8} />
                  ))}
                </div>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10}>
                <div style={{ textAlign: 'center', padding: '48px 20px', color: C.textMuted }}>
                  <ClipboardList size={40} style={{ opacity: 0.3, display: 'block', margin: `0 auto ${SPACE.md}px` }} />
                  <div style={{ ...T.subheading, color: C.text, marginBottom: SPACE.xs }}>No appointments found</div>
                  <div style={{ ...T.body, color: C.textMuted }}>Try adjusting your filters or date range.</div>
                </div>
              </td></tr>
            ) : filtered.map((a, i) => {
              const urg = urgencyColor(a.urgency, C)
              const needsAssign   = a.booking_mode === 'hospital' && !a.assigned_doctor_id && !a.doctor_id
              const hasDoctor     = !!(a.assigned_doctor_id || a.doctor_id)
              // Assign/reassign only before check-in — queue_position is computed per-doctor at
              // check-in time, so swapping doctors after that would leave a stale queue slot.
              const canAssignDoctor = !isDoctor && ['pending', 'confirmed'].includes(a.status)
              const needsApproval = a.approval_status === 'pending_approval'
              const isEmergency = a.urgency === 'emergency'
              return (
                <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}`,
                  background: isEmergency ? C.redLight : i % 2 === 0 ? C.card : C.rowAlt,
                  boxShadow: isEmergency ? `inset 3px 0 0 ${C.red}` : 'none',
                  outline: needsApproval ? `1px solid rgba(239,159,39,0.2)` : 'none' }}>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: C.textSub, whiteSpace: 'nowrap' }}>
                    {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      ...(range === 'all_time' ? { year: 'numeric' } : {}),
                    })}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: C.text }}>{a.start_time}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>
                    {a.booking_ref}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.patient_name}</div>
                    <div style={{ fontSize: 11, color: C.textSub }}>
                      {a.patient_age ? `${a.patient_age}y` : ''}{a.patient_gender ? ` · ${a.patient_gender}` : ''}
                      {a.walkin_patient_phone ? ` · ${a.walkin_patient_phone}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {a.clinic_name ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                        background: 'rgba(180,156,240,0.12)', color: '#B49CF0',
                        border: '1px solid rgba(180,156,240,0.25)', whiteSpace: 'nowrap' }}>
                        {a.clinic_name}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textMuted }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6,
                        background: docColor(a.doctor_name),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 700, color: '#a0e8c0', flexShrink: 0 }}>
                        {a.doctor_name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: needsAssign ? '#EF9F27' : C.text }}>
                          {needsAssign ? '⚠ Unassigned' : a.assigned_doctor_name ?? a.doctor_name}
                        </div>
                        <div style={{ fontSize: 10, color: C.textMuted }}>
                          {a.booking_mode === 'walkin' ? '🚶 Walk-in' : a.booking_mode === 'hospital' ? '🏥 OPD' : '👨‍⚕️ Direct'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 600,
                      background: a.type === 'virtual' ? C.blueLight : C.accentLight,
                      color: a.type === 'virtual' ? C.blue : C.accent }}>
                      {a.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {urg ? (
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700,
                        background: urg.bg, color: urg.text, border: `1px solid ${urg.border}` }}>
                        {a.urgency === 'emergency' ? '🚨' : '⚡'} {a.urgency}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textMuted }}>Routine</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge status={a.status} />
                    {needsApproval && (
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700,
                        color: '#EF9F27', background: 'rgba(239,159,39,0.1)',
                        borderRadius: 6, padding: '2px 6px', display: 'inline-block' }}>
                        AWAITING REVIEW
                      </div>
                    )}
                    {a.status === 'checked_in' && a.queue_position != null && (
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: C.textSub }}>
                        #{a.queue_position} in queue{a.estimated_wait != null ? ` · ~${a.estimated_wait}m wait` : ''}
                      </div>
                    )}
                    {a.status === 'completed' && a.consult_duration_secs != null && (
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: C.textSub }}>
                        🕐 {formatDuration(a.consult_duration_secs)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {(() => {
                      const isPending = pendingActionId === a.id
                      const btnBase: React.CSSProperties = { fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1, transition: 'opacity 0.15s' }
                      return (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {/* Detail */}
                        <button onClick={() => setDetailAppt(a)}
                          style={{ ...btnBase, border: `1px solid ${C.border}`, background: C.bgAlt, color: C.textMuted }}>
                          Detail
                        </button>
                        {/* Vitals — admins, front desk, doctors */}
                        {!['cancelled'].includes(a.status) && (
                          <button onClick={() => setVitalsAppt(a)}
                            style={{ ...btnBase, border: `1px solid ${a.vitals_recorded_at ? C.accentBorder : C.border}`,
                              background: a.vitals_recorded_at ? C.accentLight : C.bgAlt,
                              color: a.vitals_recorded_at ? C.accent : C.textMuted }}>
                            {a.vitals_recorded_at ? '✓ Vitals' : 'Vitals'}
                          </button>
                        )}
                        {/* Approve / Reject — admins and front desk only */}
                        {!isDoctor && needsApproval && (
                          <>
                            <button onClick={() => handleApprove(a)} disabled={isPending}
                              style={{ ...btnBase, fontWeight: 700, border: '1px solid rgba(0,232,122,0.3)', background: 'rgba(0,232,122,0.1)', color: '#00E87A' }}>
                              {isPending ? '…' : 'Approve'}
                            </button>
                            <button onClick={() => setRejectAppt(a)} disabled={isPending}
                              style={{ ...btnBase, fontWeight: 700, border: '1px solid rgba(220,60,60,0.3)', background: 'rgba(220,60,60,0.08)', color: '#f07070' }}>
                              Reject
                            </button>
                          </>
                        )}
                        {/* Assign / Reassign Doctor — admins and front desk, before check-in */}
                        {canAssignDoctor && (
                          <button onClick={() => setAssignAppt(a)} disabled={isPending}
                            style={{ ...btnBase, fontWeight: 700,
                              border: hasDoctor ? `1px solid ${C.border}` : '1px solid rgba(239,159,39,0.3)',
                              background: hasDoctor ? C.bgAlt : 'rgba(239,159,39,0.1)',
                              color: hasDoctor ? C.textMuted : '#EF9F27' }}>
                            {hasDoctor ? 'Reassign' : 'Assign Dr.'}
                          </button>
                        )}
                        {/* Check In */}
                        {!['cancelled','completed','no_show','checked_in','in_progress'].includes(a.status) && !needsApproval && (
                          <button onClick={() => handleCheckIn(a)} disabled={isPending}
                            style={{ ...btnBase, border: `1px solid ${C.accentBorder}`, background: C.accentLight, color: C.accent }}>
                            {isPending ? '…' : 'Check In'}
                          </button>
                        )}
                        {/* Start Consultation */}
                        {a.status === 'checked_in' && (
                          <button onClick={() => handleStartConsult(a)} disabled={isPending}
                            style={{ ...btnBase, fontWeight: 700, border: '1px solid rgba(85,167,235,0.3)', background: 'rgba(85,167,235,0.1)', color: '#55A7EB' }}>
                            {isPending ? '…' : '▶ Start'}
                          </button>
                        )}
                        {/* End Consultation */}
                        {a.status === 'in_progress' && (
                          <button onClick={() => handleEndConsult(a)} disabled={isPending}
                            style={{ ...btnBase, fontWeight: 700, border: '1px solid rgba(0,232,122,0.3)', background: 'rgba(0,232,122,0.1)', color: '#00E87A' }}>
                            {isPending ? '…' : '■ End'}
                          </button>
                        )}
                        {/* No-Show */}
                        {['confirmed','checked_in'].includes(a.status) && (
                          <button onClick={() => handleNoShow(a)} disabled={isPending}
                            style={{ ...btnBase, border: '1px solid rgba(85,167,235,0.3)', background: 'rgba(85,167,235,0.08)', color: '#55A7EB' }}>
                            {isPending ? '…' : 'No-Show'}
                          </button>
                        )}
                      </div>
                      )
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modals */}
      {showWalkIn && hospital?.id && (
        <WalkInModal
          hospitalId={hospital.id}
          doctors={doctors}
          onClose={() => setShowWalkIn(false)}
          onDone={() => { load(); setShowWalkIn(false) }}
        />
      )}
      {assignAppt && (
        <AssignDoctorModal
          appointment={assignAppt}
          doctors={doctors}
          onClose={() => setAssignAppt(null)}
          onDone={() => { load(); setAssignAppt(null) }}
        />
      )}
      {rejectAppt && (
        <RejectModal
          appointment={rejectAppt}
          onClose={() => setRejectAppt(null)}
          onDone={() => { load(); setRejectAppt(null) }}
        />
      )}
      {detailAppt && (
        <DetailPanel appt={detailAppt} onClose={() => setDetailAppt(null)} />
      )}
      {vitalsAppt && (
        <VitalsModal
          appointment={vitalsAppt}
          onClose={() => setVitalsAppt(null)}
          onSaved={() => { load(); setVitalsAppt(null) }}
          recordedByAuthId={user?.id}
        />
      )}
    </div>
  )
}
