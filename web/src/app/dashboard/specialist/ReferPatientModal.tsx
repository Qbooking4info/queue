'use client'
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import {
  type DayHours, defaultDayHours, isOpenNow, hourlySlotsForDate, nextOpenDays,
} from '@/lib/operating-hours'

interface PublicDoctor {
  id: string
  full_name: string
  title: string | null
  clinic_id: string | null
  specialty: { name: string } | null
}
interface PublicHospital {
  id: string
  name: string
  city: string | null
  state: string | null
  is_24_hours?: boolean | null
  emergency_hours?: boolean | null
  doctors: PublicDoctor[]
}
interface Clinic { id: string; name: string; is_emergency?: boolean }

// Mirrors mobile/lib/api.ts's findEmergencyClinic exactly -- an explicitly flagged
// emergency clinic always wins; otherwise fall back to name matching so routing still
// works for a hospital that has an "Accident and Emergency" clinic but never flipped
// the "Set as Emergency Dept" toggle.
const EMERGENCY_NAME_PATTERN = /accident.*emergency|emergency.*(dept|department|room|ward|unit)|\ba\s*&\s*e\b|casualty|trauma\s*(centre|center|unit)/i
function findEmergencyClinic(clinics: Clinic[]): Clinic | null {
  return clinics.find(c => c.is_emergency) ?? clinics.find(c => EMERGENCY_NAME_PATTERN.test(c.name)) ?? null
}

function fmt12(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ReferPatientModal({
  appointmentId, patientName, ownHospitalId, isInProgress, renderTrigger,
}: {
  // The appointment this referral is made from -- identifies the patient server-side
  // (works for walk-ins with no linked account, not just registered patients) and is
  // where an in-progress consult gets auto-completed once the referral is created.
  appointmentId: string
  patientName: string
  ownHospitalId: string
  // Copy-only: the server decides whether to actually auto-complete the consult, based
  // on that appointment's live status at submit time, not this snapshot.
  isInProgress?: boolean
  // Lets callers in a different layout (e.g. a compact queue row) supply their own
  // trigger instead of the default full-width button.
  renderTrigger?: (open: () => void) => ReactNode
}) {
  const { theme: C } = useTheme()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'same' | 'other'>('same')

  const [activeHospital, setActiveHospital] = useState<PublicHospital | null>(null)
  const [loadingHospital, setLoadingHospital] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PublicHospital[]>([])

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [selectedClinicId, setSelectedClinicId] = useState('')
  const [selectedDoctorId, setSelectedDoctorId] = useState('')

  // Operating hours -- the clinic's own hours win if it has set any custom ones,
  // otherwise the hospital's hours apply (same fallback convention as the mobile
  // booking flow and the web dashboard's Schedule page).
  const [hospitalHours, setHospitalHours] = useState<DayHours[] | null>(null)
  const [clinicHours, setClinicHours] = useState<{ hours: DayHours[]; isCustom: boolean } | null>(null)
  const effectiveHours: DayHours[] = selectedClinicId
    ? (clinicHours?.isCustom ? clinicHours.hours : (hospitalHours ?? defaultDayHours()))
    : (hospitalHours ?? defaultDayHours())

  const [date, setDate] = useState(todayIso())
  const [startTime, setStartTime] = useState('09:00')
  const [reason, setReason] = useState('')
  const [referralReason, setReferralReason] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('routine')
  const isEmergency = urgency === 'emergency'
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ bookingRef: string; approvalStatus: string; originalCompleted: boolean } | null>(null)

  const loadHospital = useCallback((hospitalId: string) => {
    setLoadingHospital(true)
    setActiveHospital(null); setClinics([]); setSelectedClinicId(''); setSelectedDoctorId('')
    setHospitalHours(null); setClinicHours(null)
    Promise.all([
      fetch(`/api/public/hospitals/${hospitalId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/clinics?hospitalId=${hospitalId}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/public/hospitals/${hospitalId}/hours`).then(r => r.ok ? r.json() : null),
    ]).then(([hospital, clinicList, hoursBody]) => {
      setActiveHospital(hospital)
      setClinics(Array.isArray(clinicList) ? clinicList : [])
      setHospitalHours(hoursBody?.hours ?? null)
    }).finally(() => setLoadingHospital(false))
  }, [])

  // "Same hospital" mode needs no search -- load the caller's own hospital + its
  // clinics as soon as the modal opens in that mode.
  useEffect(() => {
    if (open && mode === 'same' && !activeHospital) loadHospital(ownHospitalId)
  }, [open, mode, activeHospital, ownHospitalId, loadHospital])

  useEffect(() => {
    if (!open || mode !== 'other' || activeHospital) return
    const t = setTimeout(() => {
      fetch(`/api/public/hospitals${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`)
        .then(r => r.json())
        .then(data => setSearchResults(Array.isArray(data) ? data.filter((h: PublicHospital) => h.id !== ownHospitalId) : []))
        .catch(() => setSearchResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [open, mode, search, activeHospital, ownHospitalId])

  // Fetch the selected clinic's own hours -- only matters once one is actually picked;
  // before that, the hospital's hours already apply via the effectiveHours fallback.
  useEffect(() => {
    if (!selectedClinicId) { setClinicHours(null); return }
    let cancelled = false
    fetch(`/api/clinics/${selectedClinicId}/hours`).then(r => r.ok ? r.json() : null).then(body => {
      if (!cancelled) setClinicHours(body ?? null)
    })
    return () => { cancelled = true }
  }, [selectedClinicId])

  // Once emergency is flagged, only the hospital's designated Emergency Department clinic
  // is selectable -- mirrors the patient booking flow, so a life-threatening referral can't
  // accidentally get routed through a normal specialist queue.
  const emergencyClinic = findEmergencyClinic(clinics)
  const visibleClinics = isEmergency ? (emergencyClinic ? [emergencyClinic] : []) : clinics
  const noEmergencyClinic = isEmergency && clinics.length > 0 && !emergencyClinic
  useEffect(() => {
    if (isEmergency && emergencyClinic && selectedClinicId !== emergencyClinic.id) {
      setSelectedClinicId(emergencyClinic.id)
    }
  }, [isEmergency, emergencyClinic?.id])

  // Emergency referrals skip scheduling entirely -- always today, right now -- but this
  // still surfaces if the receiving side looks closed and has no round-the-clock emergency
  // capability, since that's worth the referring doctor knowing even though it doesn't block.
  const hospitalOpenNow = activeHospital ? isOpenNow(effectiveHours, activeHospital.is_24_hours) : null
  const emergencyMaybeClosed = isEmergency && activeHospital && hospitalOpenNow === false && !activeHospital.emergency_hours && !activeHospital.is_24_hours

  const openDates = nextOpenDays(14, effectiveHours)
  useEffect(() => {
    if (isEmergency) return
    if (openDates.length > 0 && !openDates.some(d => d.iso === date)) setDate(openDates[0].iso)
  }, [effectiveHours, isEmergency])

  const timeOptions = hourlySlotsForDate(effectiveHours, date)
  useEffect(() => {
    if (isEmergency) return
    if (timeOptions.length > 0 && !timeOptions.includes(startTime)) setStartTime(timeOptions[0])
  }, [effectiveHours, date, isEmergency])

  const filteredDoctors = (activeHospital?.doctors ?? [])
    .filter(d => !selectedClinicId || d.clinic_id === selectedClinicId)

  function switchMode(next: 'same' | 'other') {
    setMode(next)
    setActiveHospital(null); setClinics([]); setSelectedClinicId(''); setSelectedDoctorId('')
    setSearch(''); setSearchResults([])
  }

  async function submit() {
    if (!activeHospital) { setError('Select a receiving hospital'); return }
    if (!referralReason.trim()) { setError('Reason for referral is required'); return }
    if (noEmergencyClinic) { setError(`${activeHospital.name} hasn't set up an Emergency Department`); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/appointments/refer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          receivingHospitalId: activeHospital.id,
          receivingClinicId: selectedClinicId || undefined,
          receivingDoctorId: selectedDoctorId || undefined,
          date: isEmergency ? todayIso() : date,
          startTime: isEmergency ? nowHHMM() : startTime,
          type: 'in-person',
          reason: reason || undefined,
          referralReason,
          urgency,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? 'Referral failed'); setSubmitting(false); return }
      setSuccess({ bookingRef: body.bookingRef, approvalStatus: body.approvalStatus, originalCompleted: !!body.originalCompleted })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Referral failed')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setOpen(false); setMode('same'); setActiveHospital(null); setClinics([]); setSelectedClinicId('')
    setSelectedDoctorId(''); setSearch(''); setSearchResults([])
    setHospitalHours(null); setClinicHours(null)
    setReason(''); setReferralReason(''); setUrgency('routine'); setError(''); setSuccess(null)
  }

  // Never called useTheme() before -- every color here was a static Tailwind class or a
  // literal hex (#0E1512/#7A9089/#0A0F0D/#4A6058), so this whole modal was permanently
  // dark regardless of the clinical/forest toggle, unlike every sibling modal in this
  // codebase. Mapped onto the closest real theme token throughout; the red tints keep
  // their original distinct opacities (0.08 vs 0.15 vs 0.25 vs 0.4 read as different
  // visual weights on purpose) via hex-alpha suffixes on C.red rather than collapsing
  // them onto one token. Input focus rings are left as the static Tailwind green --
  // transient, interaction-only, not worth per-input focus-state tracking here.
  const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
  const inputStyle = { background: C.bg, border: `1px solid ${C.border}`, color: C.text }
  const labelStyle = { color: C.textSub }

  return (
    <>
      {renderTrigger ? renderTrigger(() => setOpen(true)) : (
        <Button onClick={() => setOpen(true)} variant="outline" className="w-full">
          {isInProgress ? 'Refer & End Consultation' : 'Refer Patient'}
        </Button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={reset}>
          <div className="rounded-2xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text }}
            onClick={e => e.stopPropagation()}>
            {success ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-2">✓</div>
                <div className="font-bold text-base mb-1">Referral sent</div>
                <div className="text-sm mb-4" style={labelStyle}>
                  {success.approvalStatus === 'pending_approval'
                    ? `Booking ${success.bookingRef} is awaiting the receiving side's approval.`
                    : `Booking ${success.bookingRef} is confirmed at ${activeHospital?.name}.`}
                  {success.originalCompleted && ' This consultation has been marked complete.'}
                </div>
                <Button onClick={reset}>Done</Button>
              </div>
            ) : (
              <>
                <h2 className="font-bold text-base mb-1">Refer {patientName}</h2>
                <p className="text-xs mb-4" style={labelStyle}>
                  {isInProgress
                    ? "Book this patient elsewhere for further care. Sending this referral also marks this consultation complete."
                    : "Book this patient into another clinic or hospital. They'll be notified once it's confirmed."}
                </p>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => switchMode('same')}
                    className="flex-1 py-2 rounded-xl text-xs font-bold border"
                    style={mode === 'same'
                      ? { background: C.accentLight, borderColor: C.accentBorder, color: C.accent }
                      : { background: C.bgAlt, borderColor: C.border, color: C.textSub }}>
                    Same Hospital
                  </button>
                  <button onClick={() => switchMode('other')}
                    className="flex-1 py-2 rounded-xl text-xs font-bold border"
                    style={mode === 'other'
                      ? { background: C.accentLight, borderColor: C.accentBorder, color: C.accent }
                      : { background: C.bgAlt, borderColor: C.border, color: C.textSub }}>
                    Different Hospital
                  </button>
                </div>

                {mode === 'other' && (
                  <>
                    <label className="text-xs mb-1.5 block" style={labelStyle}>Receiving hospital</label>
                    {!activeHospital ? (
                      <>
                        <input
                          value={search} onChange={e => setSearch(e.target.value)}
                          placeholder="Search hospitals…"
                          className={`${inputClass} mb-2`}
                          style={inputStyle}
                        />
                        <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 mb-3">
                          {searchResults.map(h => (
                            <button key={h.id} onClick={() => loadHospital(h.id)}
                              className="text-left px-3 py-2 rounded-lg border text-sm"
                              style={{ background: C.bgAlt, borderColor: C.border }}>
                              <div className="font-semibold">{h.name}</div>
                              <div className="text-xs" style={labelStyle}>{[h.city, h.state].filter(Boolean).join(', ') || '—'}</div>
                            </button>
                          ))}
                          {searchResults.length === 0 && <div className="text-xs px-1 py-2" style={{ color: C.textMuted }}>No hospitals found.</div>}
                        </div>
                      </>
                    ) : null}
                  </>
                )}

                {loadingHospital && <div className="text-xs mb-3" style={labelStyle}>Loading…</div>}

                {activeHospital && (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border mb-3"
                    style={{ background: C.bgAlt, borderColor: C.accentBorder }}>
                    <div>
                      <div className="font-semibold text-sm">{activeHospital.name}</div>
                      {mode === 'other' && (
                        <div className="text-xs" style={labelStyle}>{[activeHospital.city, activeHospital.state].filter(Boolean).join(', ') || '—'}</div>
                      )}
                    </div>
                    {mode === 'other' && (
                      <button onClick={() => { setActiveHospital(null); setClinics([]); setSelectedClinicId(''); setSelectedDoctorId('') }}
                        className="text-xs" style={labelStyle}>Change</button>
                    )}
                  </div>
                )}

                <div className="mt-3">
                  <label className="text-xs mb-1.5 block" style={labelStyle}>Urgency</label>
                  <select value={urgency} onChange={e => setUrgency(e.target.value as any)}
                    className={inputClass} style={inputStyle}>
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>

                {isEmergency && (
                  <div className="mt-3 rounded-xl px-3 py-2.5 border text-xs leading-relaxed"
                    style={emergencyMaybeClosed
                      ? { background: `${C.red}26`, borderColor: `${C.red}66`, color: C.red }
                      : { background: `${C.red}14`, borderColor: `${C.red}40`, color: C.red }}>
                    {emergencyMaybeClosed ? (
                      <><span className="font-bold">{activeHospital?.name} may be closed right now.</span> Emergency referrals are still sent immediately — confirm they can receive the patient before sending.</>
                    ) : (
                      <>Emergency referrals are sent for <span className="font-bold">right now</span> — no date or time to pick, and this patient will be prioritized at the receiving side.</>
                    )}
                  </div>
                )}

                {activeHospital && visibleClinics.length > 0 && (
                  <div className="mt-3">
                    <label className="text-xs mb-1.5 block" style={labelStyle}>{isEmergency ? 'Emergency department' : 'Clinic / Department (optional)'}</label>
                    {isEmergency ? (
                      <div className="px-3 py-2.5 rounded-xl border text-sm font-semibold"
                        style={{ background: `${C.red}14`, borderColor: `${C.red}40` }}>
                        {emergencyClinic?.name}
                      </div>
                    ) : (
                      <select value={selectedClinicId} onChange={e => { setSelectedClinicId(e.target.value); setSelectedDoctorId('') }}
                        className={inputClass} style={inputStyle}>
                        <option value="">Any clinic</option>
                        {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {noEmergencyClinic && (
                  <div className="mt-3 text-xs rounded-xl px-3 py-2.5 border"
                    style={{ background: `${C.red}1A`, borderColor: `${C.red}40`, color: C.red }}>
                    <span className="font-bold">{activeHospital?.name} hasn't set up an Emergency Department.</span> Choose a different hospital for an emergency referral.
                  </div>
                )}

                {activeHospital && filteredDoctors.length > 0 && (
                  <div className="mt-3">
                    <label className="text-xs mb-1.5 block" style={labelStyle}>Receiving doctor (optional)</label>
                    <select value={selectedDoctorId} onChange={e => setSelectedDoctorId(e.target.value)}
                      className={inputClass} style={inputStyle}>
                      <option value="">No preference — hospital assigns</option>
                      {filteredDoctors.map(d => (
                        <option key={d.id} value={d.id}>{[d.title, d.full_name].filter(Boolean).join(' ')}{d.specialty ? ` · ${d.specialty.name}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!isEmergency && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-xs mb-1.5 block" style={labelStyle}>Date</label>
                      {openDates.length > 0 ? (
                        <select value={date} onChange={e => setDate(e.target.value)}
                          className={inputClass} style={inputStyle}>
                          {openDates.map(d => <option key={d.iso} value={d.iso}>{d.label}</option>)}
                        </select>
                      ) : (
                        <div className="text-xs px-1 py-2.5" style={{ color: C.textMuted }}>No upcoming open day found.</div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs mb-1.5 block" style={labelStyle}>Preferred time</label>
                      {timeOptions.length > 0 ? (
                        <select value={startTime} onChange={e => setStartTime(e.target.value)}
                          className={inputClass} style={inputStyle}>
                          {timeOptions.map(tm => <option key={tm} value={tm}>{fmt12(tm)}</option>)}
                        </select>
                      ) : (
                        <div className="text-xs px-1 py-2.5" style={{ color: C.textMuted }}>Closed this day.</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <label className="text-xs mb-1.5 block" style={labelStyle}>Reason for visit (optional)</label>
                  <input value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="e.g. Follow-up cardiology consult"
                    className={inputClass} style={inputStyle} />
                </div>

                <div className="mt-3">
                  <label className="text-xs mb-1.5 block" style={labelStyle}>Reason for referral *</label>
                  <textarea value={referralReason} onChange={e => setReferralReason(e.target.value)}
                    rows={3}
                    placeholder="Why is this patient being referred? Visible to the receiving side."
                    className={`${inputClass} resize-none`} style={inputStyle} />
                </div>

                {error && (
                  <div className="mt-3 text-xs rounded-lg px-3 py-2 border"
                    style={{ background: `${C.red}1A`, borderColor: `${C.red}33`, color: C.red }}>
                    {error}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <Button onClick={reset} variant="outline" className="flex-1">Cancel</Button>
                  <Button onClick={submit} loading={submitting} disabled={!activeHospital} className="flex-1">
                    {isInProgress ? 'Refer & Complete' : 'Send Referral'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
