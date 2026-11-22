import { useState, useEffect } from 'react'
import { EntityAvatar } from '@queue/shared/components/ui/EntityAvatar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import {
  getHospitals, isDailyBookingLimitReached,
  createAppointment, createHospitalAppointment, addNotification,
  getClinicsForHospital, rescheduleAppointment,
  getHospitalHours, getClinicHours, isOpenNow, findEmergencyClinic,
  getAvailableSlots, getLinkedDependents,
} from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { supabase } from '@queue/shared/lib/supabase'
import { fmt12 } from '@queue/shared/lib/format'
import { payForAppointment } from '@queue/shared/lib/payments'
import { getWallet, payWithWallet, naira } from '@queue/shared/lib/wallet'
import { emergencyPremium, totalBookingFee, EMERGENCY_FEE_MULTIPLIER } from '@queue/shared/lib/fees'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Seg, Btn, BottomBar,
  Notice, DetailRow, Field, SearchField, Empty, Mono, MONO,
} from '@queue/shared/components/q'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import type { Clinic, BookingResult, DayHours, LinkedDependent } from '@queue/shared/lib/api'

interface Props { navigation: any; route: any }

// Step indices.
//
// Three pages, down from five. The old flow opened on a full page holding one
// binary choice (physical vs virtual) and then split "about your visit" from
// "pick a time" across two more -- but the clinic you pick is what determines
// which slots exist, so the patient was being walked forward and back across a
// decision that is really one decision. Nothing was removed to get here: the
// type choice became a toggle on the hospital page, and details and schedule
// became two sections of one scrolling page.
//
// STEP_DETAILS and STEP_SCHEDULE are kept as names for those two sections so
// the guards, effects and copy that distinguish them still read clearly; they
// are deliberately the same page.
const STEP_HOSPITAL = 0
const STEP_VISIT    = 1
const STEP_DETAILS  = STEP_VISIT
const STEP_SCHEDULE = STEP_VISIT
const STEP_CONFIRM  = 2


// ── Helpers ───────────────────────────────────────────────────────────────────

// Local calendar date, not UTC — Date#toISOString() shifts to UTC first, which
// silently rolls back to the previous day in positive-offset timezones (e.g. WAT, UTC+1).
function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Matches web/src/lib/dashboard-utils.ts's calcAge exactly (31_557_600_000ms = 365.25 days).
function calcAge(dob: string | null): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000)
}

// hours=null means "not loaded yet" — falls back to the old default (every day but
// Sunday) so the picker never sits empty while the real hours are still in flight.
// A day is only skipped when hours explicitly mark it closed, so a clinic that's
// open exactly one day a week (e.g. Wednesdays only) correctly surfaces just its
// next N occurrences of that day, however many weeks out that spans.
function getBookingDates(n = 8, hours: DayHours[] | null = null) {
  const closedDays = new Set(hours ? hours.filter(h => h.closed).map(h => h.day) : [0])
  const dates: { iso: string; label: string }[] = []
  let offset = 0
  const maxOffset = 180 // safety cap — avoids an infinite loop if hours are misconfigured as closed every day
  while (dates.length < n && offset < maxOffset) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    if (!closedDays.has(d.getDay())) {
      const iso  = fmtLocalDate(d)
      const day  = d.toLocaleDateString('en-NG', { weekday: 'short' })
      const num  = d.getDate()
      const mon  = d.toLocaleDateString('en-NG', { month: 'short' })
      dates.push({ iso, label: offset === 0 ? 'Today' : `${day} ${num} ${mon}` })
    }
    offset++
  }
  return dates
}

const ALL_OPD_SLOTS = [
  { id: 's1',  label: '8:00 AM',  time: '08:00' },
  { id: 's2',  label: '9:00 AM',  time: '09:00' },
  { id: 's3',  label: '10:00 AM', time: '10:00' },
  { id: 's4',  label: '11:00 AM', time: '11:00' },
  { id: 's5',  label: '12:00 PM', time: '12:00' },
  { id: 's6',  label: '1:00 PM',  time: '13:00' },
  { id: 's7',  label: '2:00 PM',  time: '14:00' },
  { id: 's8',  label: '3:00 PM',  time: '15:00' },
  { id: 's9',  label: '4:00 PM',  time: '16:00' },
  { id: 's10', label: '5:00 PM',  time: '17:00' },
]

function getAvailableOpdSlots(dateIso: string) {
  const todayIso = fmtLocalDate(new Date())
  if (dateIso !== todayIso) return ALL_OPD_SLOTS
  const now  = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes() + 30 // 30-min buffer
  return ALL_OPD_SLOTS.filter(sl => {
    const [h, m] = sl.time.split(':').map(Number)
    return h * 60 + m > nowMins
  })
}

const PAYMENT_OPTIONS = [
  { id: 'wallet',   icon: 'wallet-outline'           as const, label: 'Queue wallet',         sub: 'Pay instantly from your balance' },
  { id: 'card',     icon: 'card-outline'             as const, label: 'Debit / Credit Card',  sub: 'Visa, Mastercard, Verve'   },
  { id: 'transfer', icon: 'business-outline'         as const, label: 'Bank Transfer',        sub: 'Direct bank payment'       },
  { id: 'ussd',     icon: 'phone-portrait-outline'   as const, label: 'USSD',                 sub: '*737#, *966#, *000#'       },
  { id: 'hmo',      icon: 'shield-checkmark-outline' as const, label: 'HMO / Insurance',      sub: 'NHIS, AXA Mansard, Hygeia' },
]

// ── BookingFlowScreen ─────────────────────────────────────────────────────────

export function BookingFlowScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { user }     = useAuth()

  // Params — HospitalProfile can pre-fill these to skip earlier steps
  const presetType:     'virtual' | 'physical' | undefined = route.params?.bookingType
  const presetHospital: DisplayHospital | undefined        = route.params?.hospital
  const rescheduleCtx: { originalId: string; doctorId?: string | null; clinicId?: string | null; reason?: string } | undefined
    = route.params?.reschedule

  // Computed fresh on every screen visit — a module-level constant here would get cached
  // for the lifetime of the JS bundle and silently go stale ("Today" pointing at an old date).
  // Starts with the naive "every day but Sunday" list and gets replaced once real hours
  // load (see the hours-driven effect below), so the picker is never empty while loading.
  const [DATES, setDATES] = useState(() => getBookingDates(8))

  // A hospital arriving from HospitalProfile skips straight to the visit page;
  // a bare type preset just preselects the toggle.
  const startStep = presetHospital ? STEP_VISIT : STEP_HOSPITAL

  // ── Core state ────────────────────────────────────────────────────────────
  const [step,        setStep]        = useState(startStep)
  const [bookingType, setBookingType] = useState<'virtual' | 'physical'>(presetType ?? 'physical')
  const [hospital,    setHospital]    = useState<DisplayHospital | null>(presetHospital ?? null)

  // Step 1 — hospital search
  const [searchText,   setSearchText]   = useState('')
  const [hospitalList, setHospitalList] = useState<DisplayHospital[]>([])
  const [loadingHosp,  setLoadingHosp]  = useState(false)

  // Step 2 — details
  const [reason,  setReason]  = useState(rescheduleCtx?.reason ?? '')
  const [urgency, setUrgency] = useState<'routine' | 'emergency'>('routine')
  const isEmergency = urgency === 'emergency'

  // Who this booking is for -- linked (real-account) dependents only; a reschedule
  // keeps whoever the original appointment was already for, so this never applies
  // there. null = booking for myself.
  const [linkedDependents,   setLinkedDependents]   = useState<LinkedDependent[]>([])
  const [bookingForDependentId, setBookingForDependentId] = useState<string | null>(null)
  useEffect(() => {
    if (rescheduleCtx) return
    let cancelled = false
    getLinkedDependents().then(({ managing }) => { if (!cancelled) setLinkedDependents(managing) })
    return () => { cancelled = true }
  }, [])

  // Emergency bookings never leave "today" — no future date, no exceptions. If this hospital
  // is closed today (and isn't a 24/7 emergency_hours hospital), the patient needs to pick
  // a different hospital rather than queue up for a day that doesn't exist for an emergency.
  const [hospitalOpenNow, setHospitalOpenNow] = useState<boolean | null>(null)
  useEffect(() => {
    if (!isEmergency || !hospital?.id) { setHospitalOpenNow(null); return }
    if ((hospital as any).emergencySlots) { setHospitalOpenNow(true); return }
    let cancelled = false
    getHospitalHours(String(hospital.id)).then(hours => {
      if (!cancelled) setHospitalOpenNow(isOpenNow(hours))
    })
    return () => { cancelled = true }
  }, [isEmergency, hospital?.id])

  // Step 3 — schedule
  // DATES can legitimately come back empty once real hours load (a clinic whose
  // hours mark every day closed, or misconfigured hours that hit getBookingDates'
  // maxOffset cap), so every read of DATES[0] has to tolerate undefined rather
  // than throw mid-flow.
  const [selectedDate, setSelectedDate] = useState(DATES[0]?.iso ?? '')

  // Force today the moment urgency becomes emergency — an emergency booking can't be for
  // a future date, even if the patient had already picked one before switching urgency.
  useEffect(() => {
    if (isEmergency && DATES[0]) setSelectedDate(DATES[0].iso)
  }, [isEmergency])
  const [opdSlot,      setOpdSlot]      = useState<typeof ALL_OPD_SLOTS[0] | null>(null)
  const [preferredDoc, setPreferredDoc] = useState<any | null>(null)
  // A doctor's real configured slots, when they have any. The web dashboard's
  // schedule generator writes these to time_slots; until now nothing read them,
  // so an admin could configure a doctor's hours and the app would keep offering
  // the same hardcoded 08:00-17:00 grid regardless.
  const [doctorSlots,  setDoctorSlots]  = useState<{ id: string; label: string; time: string }[] | null>(null)
  const [dateFullMap,  setDateFullMap]  = useState<Record<string, boolean>>({})
  const [checkingLim,  setCheckingLim]  = useState(false)

  // Step 4 — confirm
  const [payMethod,   setPayMethodState] = useState('card')
  // Remember the last payment method so returning patients don't pick it again.
  useEffect(() => { AsyncStorage.getItem('queue:lastPayMethod').then(v => { if (v) setPayMethodState(v) }).catch(() => {}) }, [])
  const setPayMethod = (m: string) => { setPayMethodState(m); AsyncStorage.setItem('queue:lastPayMethod', m).catch(() => {}) }
  const [walletKobo, setWalletKobo] = useState<number | null>(null)
  useEffect(() => { getWallet().then(w => setWalletKobo(w.notReady ? null : w.balanceKobo)).catch(() => {}) }, [])
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')
  // Buzz whenever a booking error appears, whichever path set it.
  useEffect(() => { if (submitError) haptics.error() }, [submitError])

  // Multi-clinic selection
  const [clinics,        setClinics]        = useState<Clinic[]>([])
  const [loadingClinics, setLoadingClinics] = useState(false)
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [referralNote,   setReferralNote]   = useState('')

  // Operating hours drive which dates are even offered in the picker below — a clinic
  // that's only open Wednesdays should only ever show upcoming Wednesdays, not every
  // day of the week. The clinic's own hours win if it has set any; otherwise the
  // hospital's hours apply (same fallback convention as the web dashboard's Schedule
  // page and the "Emergency Department" clinic lookup).
  const [hospitalHours, setHospitalHours] = useState<DayHours[] | null>(null)
  useEffect(() => {
    if (!hospital?.id) { setHospitalHours(null); return }
    let cancelled = false
    getHospitalHours(String(hospital.id)).then(h => { if (!cancelled) setHospitalHours(h) })
    return () => { cancelled = true }
  }, [hospital?.id])

  const [clinicHoursState, setClinicHoursState] = useState<{ hours: DayHours[]; isCustom: boolean } | null>(null)
  useEffect(() => {
    if (!selectedClinic?.id) { setClinicHoursState(null); return }
    let cancelled = false
    getClinicHours(selectedClinic.id).then(h => { if (!cancelled) setClinicHoursState(h) })
    return () => { cancelled = true }
  }, [selectedClinic?.id])

  const effectiveHours: DayHours[] | null = selectedClinic
    ? (clinicHoursState?.isCustom ? clinicHoursState.hours : hospitalHours)
    : hospitalHours

  useEffect(() => {
    setDATES(getBookingDates(8, effectiveHours))
  }, [effectiveHours])

  // If the newly-computed date list no longer contains what was selected (e.g. hours
  // just loaded and today isn't actually an open day for this clinic), snap to the
  // first valid option instead of leaving an invalid date selected.
  useEffect(() => {
    if (DATES.length > 0 && !DATES.some(d => d.iso === selectedDate)) {
      setSelectedDate(DATES[0].iso)
    }
  }, [DATES])

  // Forces opdSlots to re-filter periodically — otherwise a slot that was valid when this
  // screen first rendered can keep showing as bookable long after it's actually passed if
  // the user just sits on the schedule step without triggering any other re-render.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Load the selected doctor's configured slots for the chosen date. Cancellation
  // guarded so switching doctor quickly can't let a stale response overwrite a
  // newer one.
  useEffect(() => {
    if (!preferredDoc?.id || !selectedDate) { setDoctorSlots(null); return }
    let cancelled = false
    getAvailableSlots(String(preferredDoc.id), selectedDate, bookingType === 'virtual')
      .then(rows => {
        if (cancelled) return
        setDoctorSlots(rows.map(r => ({
          id: r.id,
          time: String(r.start_time).slice(0, 5),
          label: fmt12(String(r.start_time).slice(0, 5)),
        })))
      })
      .catch(() => { if (!cancelled) setDoctorSlots(null) })
    return () => { cancelled = true }
  }, [preferredDoc?.id, selectedDate, bookingType])

  // ── Derived ───────────────────────────────────────────────────────────────
  // A doctor's configured schedule governs when they have one. Falling back to
  // the default grid otherwise keeps hospitals that never set schedules working
  // exactly as before, rather than showing them an empty picker.
  const usingRealSlots = !!preferredDoc && doctorSlots !== null && doctorSlots.length > 0
  const opdSlots       = usingRealSlots
    ? (selectedDate === fmtLocalDate(new Date())
        ? doctorSlots!.filter(sl => {
            const [h, m] = sl.time.split(':').map(Number)
            const now = new Date()
            return h * 60 + m > now.getHours() * 60 + now.getMinutes() + 30
          })
        : doctorSlots!)
    : getAvailableOpdSlots(selectedDate)
  const virtualDoctors = (hospital?.doctors ?? []).filter((d: any) => d.accepts_virtual)
  const isManual       = hospital?.approval_mode === 'manual' || (selectedClinic != null && !selectedClinic.is_opd)
  const baseFee        = bookingType === 'virtual'
    ? (preferredDoc?.virtual_fee ?? preferredDoc?.consultation_fee ?? 0)
    : (hospital?.opd_fee ?? 0)
  const emergencyExtra = isEmergency ? emergencyPremium(baseFee) : 0
  const totalFee       = totalBookingFee(baseFee, isEmergency)

  // Pre-select the earliest open slot so most people can just tap Continue.
  useEffect(() => {
    if (step === STEP_SCHEDULE && !opdSlot && opdSlots.length > 0) setOpdSlot(opdSlots[0] as any)
  }, [step, selectedDate, opdSlots.length])

  // Once emergency is flagged at a multi-clinic hospital, only the hospital's designated
  // Emergency Department clinic is selectable — every other clinic (specialist or OPD) is
  // hidden so patients can't accidentally route a life-threatening visit through a normal
  // referral queue.
  const emergencyClinic    = findEmergencyClinic(clinics)
  const visibleClinics     = isEmergency ? (emergencyClinic ? [emergencyClinic] : []) : clinics
  const noEmergencyClinic  = isEmergency && hospital?.clinic_model === 'multi' && !loadingClinics && !emergencyClinic

  // Whoever the booking is actually for -- the selected linked dependent's own
  // demographics when booking on their behalf, not the caretaker's.
  const effectivePatient = bookingForDependentId
    ? linkedDependents.find(d => d.dependent.id === bookingForDependentId)?.dependent ?? null
    : user

  // Client-side pre-check for a clean UX -- the real enforcement is the
  // enforce_clinic_booking_eligibility DB trigger (20260826000001), which this
  // mirrors exactly (same emergency exemption, same "unknown data -> ask them
  // to complete their profile" fallback) so a race with someone else editing
  // the clinic's restriction just falls through to that trigger's own error.
  const clinicRestrictionReason: { reason: string; needsProfile: boolean } | null = (() => {
    if (isEmergency || !selectedClinic) return null
    const { min_age, max_age, gender_restriction } = selectedClinic
    if (min_age == null && max_age == null && gender_restriction == null) return null
    const forSelf = !bookingForDependentId
    const profileHint = forSelf ? 'your' : "the dependent's"

    if (min_age != null || max_age != null) {
      const age = calcAge(effectivePatient?.date_of_birth ?? null)
      if (age == null) {
        return { reason: `This clinic has an age restriction. Please complete ${profileHint} date of birth before booking here.`, needsProfile: forSelf }
      }
      if (min_age != null && age < min_age) return { reason: `This clinic only accepts patients aged ${min_age} and above.`, needsProfile: false }
      if (max_age != null && age > max_age) return { reason: `This clinic only accepts patients aged ${max_age} and under.`, needsProfile: false }
    }

    if (gender_restriction != null) {
      const gender = effectivePatient?.gender?.toLowerCase() || null
      if (!gender) {
        return { reason: `This clinic has a gender restriction. Please complete ${profileHint} gender before booking here.`, needsProfile: forSelf }
      }
      if (gender !== gender_restriction) return { reason: `This clinic is restricted to ${gender_restriction} patients.`, needsProfile: false }
    }

    return null
  })()

  // Auto-select the Emergency Department the moment it's the only option — no need to make
  // someone tap a single-item list while triaging.
  useEffect(() => {
    if (isEmergency && emergencyClinic && selectedClinic?.id !== emergencyClinic.id) {
      setSelectedClinic(emergencyClinic)
    }
  }, [isEmergency, emergencyClinic?.id])

  // ── Effects ───────────────────────────────────────────────────────────────

  // Load hospitals when entering step 1
  useEffect(() => {
    if (step !== STEP_HOSPITAL) return
    loadHospitals('')
  }, [step])

  async function loadHospitals(q: string) {
    setLoadingHosp(true)
    const raw    = await getHospitals(q || undefined)
    const mapped = raw.map(toDisplayHospital)
    setHospitalList(mapped)
    setLoadingHosp(false)
  }

  // Debounced search
  useEffect(() => {
    if (step !== STEP_HOSPITAL) return
    const tid = setTimeout(() => loadHospitals(searchText), 350)
    return () => clearTimeout(tid)
  }, [searchText])

  // Clear selected OPD slot when it's no longer available (e.g. date changed to today)
  useEffect(() => {
    if (opdSlot && !opdSlots.find(s => s.id === opdSlot.id)) {
      setOpdSlot(null)
    }
  }, [selectedDate])

  // Daily limit check when entering schedule — a selected clinic's own limit (including
  // an explicit "unlimited") always governs over the hospital-wide default; only when no
  // clinic is selected (single-clinic hospitals, or OPD without a clinic) does the
  // hospital-level limit apply.
  const effectiveDailyLimit = selectedClinic ? selectedClinic.daily_booking_limit : (hospital?.daily_booking_limit ?? null)
  useEffect(() => {
    if (step !== STEP_SCHEDULE || !hospital) return
    // Cancellation guard: switching clinic re-fires this before the previous
    // batch settles, and without it whichever batch resolves last wins — so a
    // stale clinic's fullness map can overwrite the current one.
    let cancelled = false
    setCheckingLim(true)
    Promise.all(
      DATES.map(d =>
        isDailyBookingLimitReached(String(hospital.id), d.iso, selectedClinic?.id).then(limitReached => ({
          date: d.iso,
          full: urgency !== 'emergency' && limitReached,
        }))
      )
    ).then(results => {
      if (cancelled) return
      const map: Record<string, boolean> = {}
      results.forEach(r => { map[r.date] = r.full })
      setDateFullMap(map)
    }).catch(err => {
      // Without this, a single rejected lookup leaves checkingLim stuck true
      // and the schedule step spinning forever with no way to recover.
      console.warn('[BookingFlow] daily limit check failed:', err)
    }).finally(() => {
      if (!cancelled) setCheckingLim(false)
    })
    return () => { cancelled = true }
  }, [step, bookingType, hospital?.id, selectedClinic?.id, effectiveDailyLimit])

  // Load clinics when entering STEP_DETAILS for multi-clinic hospitals
  useEffect(() => {
    if (step !== STEP_DETAILS || hospital?.clinic_model !== 'multi') return
    setLoadingClinics(true)
    getClinicsForHospital(String(hospital.id))
      .then(data => setClinics(data))
      .finally(() => setLoadingClinics(false))
  }, [step, hospital?.id])

  // ── Navigation ────────────────────────────────────────────────────────────

  function goBack() {
    if (step <= startStep) { navigation.goBack(); return }
    setStep(step - 1)
  }

  function canAdvance() {
    if (step === STEP_HOSPITAL) return !!hospital
    if (step === STEP_VISIT) {
      // Details half.
      if (isEmergency && hospitalOpenNow === false) return false
      if (noEmergencyClinic) return false
      if (clinicRestrictionReason) return false
      if (reason.trim().length < 3) return false
      if (hospital?.clinic_model === 'multi' && !selectedClinic) return false
      // Schedule half. Both must hold before the patient reaches payment --
      // merging the pages must not merge away a requirement.
      return !!opdSlot && !dateFullMap[selectedDate]
    }
    return true
  }

  // With details and schedule on one page there are several reasons Continue
  // can be disabled, and a button that is simply dead is the worst of them.
  // Says the first thing still missing, in the order the page asks for it.
  function blockingReason(): string | null {
    if (step !== STEP_VISIT || canAdvance()) return null
    if (isEmergency && hospitalOpenNow === false) return 'This hospital is closed right now — choose another for an emergency.'
    if (noEmergencyClinic) return 'This hospital has no emergency department.'
    if (clinicRestrictionReason) return clinicRestrictionReason.reason
    if (reason.trim().length < 3) return 'Tell us the reason for your visit.'
    if (hospital?.clinic_model === 'multi' && !selectedClinic) return 'Choose a clinic.'
    if (dateFullMap[selectedDate]) return 'That date is fully booked — pick another day.'
    if (!opdSlot) return 'Pick an arrival window.'
    return null
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!user || !hospital) return
    setSubmitError(''); setSubmitting(true)

    // MM8: Re-validate slot availability at submit time to prevent race conditions
    if (urgency !== 'emergency') {
      const limitReached = await isDailyBookingLimitReached(String(hospital.id), selectedDate, selectedClinic?.id)
      if (limitReached) {
        setSubmitError('This time slot is now full. Please choose a different time.')
        setSubmitting(false)
        return
      }
    }

    let result: BookingResult | null = null

    // Specialist clinic forces manual approval regardless of hospital setting — except for
    // emergencies, which must never wait on review even if routed to a non-OPD clinic.
    const clinicApprovalMode = isEmergency
      ? 'auto'
      : (selectedClinic && !selectedClinic.is_opd)
        ? 'manual'
        : (hospital.approval_mode ?? 'auto')

    const arrivalTime = opdSlot?.time ?? '09:00'
    // A linked dependent's booking uses THEIR OWN account as patientId (medically
    // correct -- history follows the real person), never the booking caretaker's.
    const bookingPatientId = bookingForDependentId ?? user.id

    if (rescheduleCtx) {
      result = await rescheduleAppointment({
        originalId:   rescheduleCtx.originalId,
        patientId:    user.id,
        hospitalId:   String(hospital.id),
        doctorId:     rescheduleCtx.doctorId ?? undefined,
        clinicId:     selectedClinic?.id ?? rescheduleCtx.clinicId ?? undefined,
        date:         selectedDate,
        startTime:    arrivalTime,
        reason,
        type:         bookingType === 'virtual' ? 'virtual' : 'in-person',
        approvalMode: clinicApprovalMode,
        paymentMethod: payMethod,
      })
    } else if (bookingType === 'physical' || !preferredDoc) {
      result = await createHospitalAppointment({
        patientId:          bookingPatientId,
        hospitalId:         String(hospital.id),
        date:               selectedDate,
        startTime:          arrivalTime,
        reason,
        urgency,
        type:               bookingType === 'virtual' ? 'virtual' : 'in-person',
        approvalMode:       clinicApprovalMode,
        clinicId:           selectedClinic?.id,
        symptomDescription: referralNote || undefined,
        paymentMethod:      payMethod,
      })
    } else {
      // Virtual with preferred doctor — queue-based, no DB slot needed.
      // clinicId/symptomDescription/clinicApprovalMode are passed here for the
      // same reasons as the two branches above: without clinicId the booking
      // loses its clinic association entirely (clinic-scoped staff queries filter
      // on clinic_id), and using hospital.approval_mode directly skipped the
      // "specialist clinic forces manual approval" rule that clinicApprovalMode
      // encodes — so a specialist booking could auto-confirm purely because the
      // patient also picked a preferred doctor.
      result = await createAppointment({
        patientId:    bookingPatientId,
        doctorId:     preferredDoc.id,
        hospitalId:   String(hospital.id),
        slotId:       usingRealSlots ? (opdSlot?.id ?? null) : null,
        clinicId:     selectedClinic?.id,
        date:         selectedDate,
        startTime:    arrivalTime,
        type:         'virtual',
        reason,
        urgency,
        symptomDescription: referralNote || undefined,
        approvalMode: clinicApprovalMode,
        paymentMethod: payMethod,
      })
    }

    setSubmitting(false)

    if (result?.ok) {
      // Offer online payment if the platform and this hospital support it.
      // Deliberately AFTER the booking exists: the appointment is the thing the
      // patient came for, and a payment failure must never lose it. If payment
      // is unavailable or abandoned, the booking simply stays payable at the
      // hospital — which is what happens today for every booking.
      if (result.id) {
        let useCard = payMethod !== 'wallet'
        if (!useCard) {
          const w = await payWithWallet(result.id)
          if (w.status === 'success') haptics.success()
          else {
            useCard = await new Promise<boolean>(resolve => Alert.alert(
              w.status === 'insufficient' ? 'Not enough in your wallet' : 'Wallet payment failed',
              `${w.status === 'error' ? w.message + '\n\n' : ''}Pay by card instead? Your booking is held either way.`,
              [{ text: 'Pay at hospital', style: 'cancel', onPress: () => resolve(false) }, { text: 'Pay by card', onPress: () => resolve(true) }],
            ))
          }
        }
        const outcome = useCard ? await payForAppointment(result.id) : { status: 'cancelled' as const }
        if (outcome.status === 'error') {
          haptics.error()
          Alert.alert(
            'Payment could not be completed',
            `${outcome.message}\n\nYour booking is confirmed — you can pay at the hospital.`,
          )
        } else if (outcome.status === 'pending') {
          Alert.alert('Payment received', 'We are confirming it with your bank. Your booking is held.')
        }
        // 'disabled' and 'cancelled' are silent: pay-at-hospital is the norm,
        // not an exception worth interrupting the patient about.
      }

      // Notify doctor/staff about new booking (best-effort)
      if (result.id) {
        const apiBase = process.env.EXPO_PUBLIC_API_URL ?? ''
        // Bearer token required: this endpoint is no longer open, and the
        // notification text is composed server-side from the appointment rather
        // than from anything sent here.
        supabase.auth.getSession().then(({ data: { session } }) => {
          const jwt = session?.access_token
          if (!jwt) return
          return fetch(`${apiBase}/api/appointments/notify-staff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ appointmentId: result.id }),
          })
        }).catch(() => {/* best-effort */})
      }

      const isPending = result.approvalStatus === 'pending_approval'
      const isReschedule = !!rescheduleCtx
      await addNotification({
        userId: user.id,
        type:   isPending ? 'pending' : 'confirmed',
        title:  isReschedule
          ? (isPending ? 'Reschedule Submitted — Pending Review' : 'Appointment Rescheduled')
          : (isPending ? 'Booking Submitted — Pending Review' : 'Booking Confirmed'),
        body:   isPending
          ? `${result.bookingRef} · ${hospital.name}\nUnder review — you'll be notified when approved.`
          : `${result.bookingRef} · ${preferredDoc?.full_name ?? (bookingType === 'virtual' ? 'Virtual visit' : 'OPD visit')} · ${hospital.name}`,
        data: { appointment_id: result.id, booking_ref: result.bookingRef },
      })
      haptics.success()
      navigation.navigate('Confirmation', {
        hospital, doctor: preferredDoc ?? null, selectedDate,
        urgency, bookingType,
        bookingRef: result.bookingRef, approvalStatus: result.approvalStatus, startTime: arrivalTime,
      })
    } else {
      setSubmitError(result && !result.ok ? `Booking failed: ${result.error}` : 'Booking failed. Please try again.')
    }
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  const PHASES = ['Hospital', 'Your visit', 'Pay & confirm'] as const
  const phase = step

  // ── Render ────────────────────────────────────────────────────────────────

  // The handoff's three steps. The names changed with the redesign ("Your
  // visit / Doctor & time / Pay"); the step boundaries did not.
  const PHASE_LABELS = ['Your visit', 'Doctor & time', 'Pay'] as const

  return (
    <Screen>
      <AppBar
        title={rescheduleCtx ? 'Reschedule visit' : 'Book a visit'}
        sub={`Step ${phase + 1} of 3`}
        onBack={goBack}
      />

      {/* The step rail. Three equal segments: the bar no longer claims a third
          of the way through while the patient is on page two of five. */}
      <View
        style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12 }}
        accessibilityLabel={`Step ${phase + 1} of 3: ${PHASE_LABELS[phase]}`}>
        {PHASE_LABELS.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: 5 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: i <= phase ? t.q.primary : t.q.line }} />
            <Text style={{ fontSize: 11, fontWeight: i === phase ? '700' : '500', color: i === phase ? t.q.ink : t.q.ink60 }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <Body keyboardShouldPersistTaps="handled">

          {/* ══ STEP 1 — Choose a hospital ═══════════════════════════ */}
          {step === STEP_HOSPITAL && (
            <>
              {/* Two options that change nothing else on screen, so they are a
                  switch rather than a page of their own -- and the patient can
                  change their mind without walking backwards. */}
              <Seg<'physical' | 'virtual'>
                value={bookingType}
                onChange={v => { haptics.tap(); setBookingType(v); setPreferredDoc(null) }}
                options={[{ key: 'physical', label: 'In person' }, { key: 'virtual', label: 'Video call' }]}
              />

              <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60 }}>
                  {bookingType === 'virtual'
                    ? 'A doctor will call you. Pick the hospital you want to consult with.'
                    : 'A doctor is assigned when you arrive. Pick a hospital to continue.'}
                </Text>
              </View>

              <SearchField value={searchText} onChangeText={setSearchText} placeholder="Search hospitals…" />

              {loadingHosp ? (
                <ActivityIndicator color={t.q.primary} style={{ marginTop: 30 }} />
              ) : hospitalList.length === 0 ? (
                <Card>
                  <Empty
                    icon="business-outline"
                    title={bookingType === 'virtual' ? 'No hospital here consults online yet' : 'No hospitals match that'}
                    body={bookingType === 'virtual'
                      ? 'Try an in-person visit, or find an independent doctor who consults online.'
                      : 'Try a shorter search.'}
                    action={bookingType === 'virtual' ? 'Find a doctor online' : undefined}
                    onAction={() => navigation.navigate('DoctorSearch', { initialFilter: 'virtual' })}
                  />
                </Card>
              ) : (
                <Card>
                  {hospitalList.map((h, i) => (
                    <View key={String(h.id)}>
                      {i > 0 && <Hair />}
                      <Row
                        leading={
                          <EntityAvatar size={40} kind="hospital" uri={h.logoUrl} label={h.name}
                            hospital={{ type: h.hospitalType, ownership: h.ownership, clinicModel: h.clinic_model }} />
                        }
                        title={h.name}
                        sub={[h.specialty, h.approval_mode === 'manual' ? 'reviewed by hand' : null].filter(Boolean).join(' · ')}
                        right={h.opd_fee != null && h.opd_fee > 0 && bookingType === 'physical'
                          ? <Mono size={13} weight="700">₦{Number(h.opd_fee).toLocaleString('en-NG')}</Mono>
                          : undefined}
                        chevron
                        onPress={() => {
                          setHospital(h)
                          setPreferredDoc(null)
                          setSelectedClinic(null); setReferralNote('')
                          setStep(STEP_VISIT)
                        }}
                      />
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}

          {/* ══ STEP 2 — Your visit, then when ══════════════════════ */}
          {step === STEP_VISIT && (
            <>
              <Card>
                <Row
                  icon={bookingType === 'virtual' ? 'videocam-outline' : 'business-outline'}
                  title={hospital?.name ?? '—'}
                  sub={bookingType === 'virtual' ? 'Virtual consultation' : 'In-person visit'}
                  right={!presetHospital
                    ? <Btn label="Change" variant="ghost" small onPress={() => setStep(STEP_HOSPITAL)} />
                    : undefined}
                />
              </Card>

              {linkedDependents.length > 0 && (
                <>
                  <SectionHead title="Who is this for?" />
                  <Card>
                    <Row
                      icon="person-outline"
                      iconTone={!bookingForDependentId ? 'teal' : 'neutral'}
                      tint={!bookingForDependentId}
                      title={user?.full_name ?? 'Me'}
                      sub={(user as any)?.patient_code ?? 'Your own account'}
                      right={!bookingForDependentId ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                      onPress={() => setBookingForDependentId(null)}
                    />
                    {linkedDependents.map(d => {
                      const on = bookingForDependentId === d.dependent.id
                      return (
                        <View key={d.linkId}>
                          <Hair />
                          <Row
                            icon="person-outline"
                            iconTone={on ? 'teal' : 'neutral'}
                            tint={on}
                            title={d.dependent.full_name}
                            sub={`${d.relationship} · managed by you`}
                            right={on ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                            onPress={() => setBookingForDependentId(d.dependent.id)}
                          />
                        </View>
                      )
                    })}
                  </Card>
                </>
              )}

              {isManual && (
                <Notice tone="amber" icon="clipboard-outline">
                  This hospital reviews each booking by hand. Describe your symptoms clearly so they can
                  assess your case. Nothing is charged until they accept.
                </Notice>
              )}

              <SectionHead title={bookingType === 'virtual' ? 'Reason for consultation' : 'Reason for visit'} />
              <View style={{ paddingHorizontal: 16 }}>
                <Field
                  label="What brings you in?"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                  placeholder="e.g. Persistent headache for 3 days, chest discomfort, follow-up after surgery…"
                  style={{ minHeight: 88, textAlignVertical: 'top' }}
                />
              </View>

              <SectionHead title="How urgent is this?" />
              <Card>
                {([
                  ['routine', 'medical-outline', 'Routine', 'Regular check-up or follow-up'],
                  ['emergency', 'warning-outline', 'Emergency', `Severe symptoms needing prompt care (${EMERGENCY_FEE_MULTIPLIER}× fee)`],
                ] as const).map(([id, icon, label, sub], i) => {
                  const on = urgency === id
                  return (
                    <View key={id}>
                      {i > 0 && <Hair />}
                      <Row
                        icon={icon}
                        iconTone={id === 'emergency' ? 'red' : on ? 'teal' : 'neutral'}
                        tint={on}
                        title={label}
                        sub={sub}
                        right={on ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                        onPress={() => setUrgency(id)}
                      />
                    </View>
                  )
                })}
              </Card>

              {isEmergency && (
                hospitalOpenNow === false ? (
                  <Notice tone="red">
                    {hospital?.name} is closed right now. An emergency booking can only be for today, so go
                    back and choose a hospital that is open.
                  </Notice>
                ) : (
                  <Notice tone="red">
                    Emergency bookings are for today only — no future date — and you are placed at the front
                    of today&apos;s queue.
                  </Notice>
                )
              )}

              {/* ── Clinic selector (multi-clinic hospitals) ────────── */}
              {hospital?.clinic_model === 'multi' && (
                <>
                  <SectionHead title={isEmergency ? 'Emergency department' : 'Clinic'} />

                  {!isEmergency && (
                    <Notice tone="teal" icon="information-circle-outline">
                      Not sure where to go? Book general outpatient — the front desk directs you to the
                      right specialist.
                    </Notice>
                  )}

                  {noEmergencyClinic && (
                    <Notice tone="red">
                      {hospital?.name} has not set up an emergency department. Go back and choose a
                      different hospital for an emergency booking.
                    </Notice>
                  )}

                  {loadingClinics ? (
                    <ActivityIndicator color={t.q.primary} style={{ marginVertical: 12 }} />
                  ) : (
                    <Card>
                      {visibleClinics.map((clinic, i) => {
                        const on = selectedClinic?.id === clinic.id
                        return (
                          <View key={clinic.id}>
                            {i > 0 && <Hair />}
                            <Row
                              icon="medical-outline"
                              iconTone={on ? 'teal' : 'neutral'}
                              tint={on}
                              title={clinic.name}
                              sub={clinic.description ?? (clinic.service_tags?.length ? clinic.service_tags.slice(0, 4).join(' · ') : null)}
                              pill={isEmergency ? 'Emergency' : clinic.is_opd ? 'No referral' : 'Needs referral'}
                              pillTone={isEmergency ? 'red' : clinic.is_opd ? 'teal' : 'amber'}
                              pillSolid={isEmergency}
                              onPress={() => { setSelectedClinic(on ? null : clinic); setReferralNote('') }}
                            />
                          </View>
                        )
                      })}
                    </Card>
                  )}

                  {clinicRestrictionReason && (
                    <>
                      <Notice tone="red">
                        You cannot book this clinic. {clinicRestrictionReason.reason}
                      </Notice>
                      {clinicRestrictionReason.needsProfile && (
                        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                          <Btn label="Complete your health profile" variant="secondary" small
                            onPress={() => { haptics.tap(); navigation.navigate('MedicalHistory') }} />
                        </View>
                      )}
                    </>
                  )}

                  {selectedClinic && !selectedClinic.is_opd && !isEmergency && !clinicRestrictionReason && (
                    <>
                      <Notice tone="amber">
                        A specialist clinic is reviewed by the hospital. A referral note helps them approve faster.
                      </Notice>
                      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                        <Field
                          label="Referral note (optional)"
                          value={referralNote}
                          onChangeText={setReferralNote}
                          multiline
                          numberOfLines={3}
                          placeholder="e.g. Referred by Dr Okafor for chest pain."
                          style={{ minHeight: 80, textAlignVertical: 'top' }}
                        />
                      </View>
                    </>
                  )}
                </>
              )}

              {/* ── When ───────────────────────────────────────────── */}
              <SectionHead title={rescheduleCtx ? 'Pick a new time' : 'When would you like to come?'} />

              {bookingType === 'virtual' && (
                <Notice tone="teal" icon="videocam-outline">
                  Join the queue for your date and window. When it is your turn the doctor calls you
                  directly — you do not need to be at the hospital.
                </Notice>
              )}

              {bookingType === 'virtual' && virtualDoctors.length > 0 && (
                <Card>
                  <View style={{ padding: 14, paddingBottom: 6 }}>
                    <CardLabel>Preferred doctor (optional)</CardLabel>
                  </View>
                  <Row
                    icon="shuffle-outline"
                    iconTone={!preferredDoc ? 'teal' : 'neutral'}
                    tint={!preferredDoc}
                    title="No preference"
                    sub="The hospital assigns the next available doctor"
                    right={!preferredDoc ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                    onPress={() => setPreferredDoc(null)}
                  />
                  {virtualDoctors.map((d: any) => {
                    const on = preferredDoc?.id === d.id
                    const fee = d.virtual_fee ?? d.consultation_fee ?? 0
                    return (
                      <View key={d.id}>
                        <Hair />
                        <Row
                          leading={<EntityAvatar size={40} kind="doctor" uri={d.avatar_url} label={d.full_name} />}
                          tint={on}
                          title={d.full_name}
                          sub={d.specialty?.name ?? 'Specialist'}
                          right={<Mono size={13} weight="700">₦{Number(fee).toLocaleString('en-NG')}</Mono>}
                          onPress={() => setPreferredDoc(on ? null : d)}
                        />
                      </View>
                    )
                  })}
                </Card>
              )}

              <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
                <CardLabel>Choose a date</CardLabel>
                {checkingLim && (
                  <Text style={{ fontSize: 11, color: t.q.ink60, marginTop: 4 }}>Checking availability…</Text>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
                {(isEmergency ? DATES.slice(0, 1) : DATES).map(d => {
                  const on = selectedDate === d.iso
                  const full = !!dateFullMap[d.iso]
                  return (
                    <Pressable
                      key={d.iso}
                      disabled={full}
                      onPress={() => setSelectedDate(d.iso)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: full }}
                      accessibilityLabel={full ? `${d.label}, fully booked` : d.label}
                      style={{
                        minWidth: 84, minHeight: 56, paddingHorizontal: 12,
                        alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                        backgroundColor: on ? t.q.sel : t.q.surface,
                        borderWidth: 1, borderColor: on ? t.q.primary : t.q.line,
                        opacity: full ? 0.45 : 1,
                      }}>
                      <Text style={{ fontSize: 13, fontWeight: on ? '700' : '600', color: on ? t.q.primary : t.q.ink }}>
                        {d.label}
                      </Text>
                      {full && <Text style={{ fontSize: 10, color: t.q.ink60, marginTop: 2 }}>Full</Text>}
                    </Pressable>
                  )
                })}
              </ScrollView>

              {isEmergency && (
                <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                  <Text style={{ fontSize: 11.5, color: t.q.red }}>
                    Emergency bookings are today only — no other date is offered.
                  </Text>
                </View>
              )}
              {dateFullMap[selectedDate] && (
                <Notice tone="amber">That date is fully booked. Please pick another day.</Notice>
              )}

              <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                <CardLabel>{bookingType === 'virtual' ? 'Preferred call window' : 'Preferred arrival window'}</CardLabel>
              </View>
              {opdSlots.length === 0 ? (
                <Notice tone="amber">
                  {bookingType === 'virtual'
                    ? 'No call windows left for that date. Please choose another day.'
                    : 'No arrival windows left for that date. Please choose another day.'}
                </Notice>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
                  {opdSlots.map(sl => {
                    const on = opdSlot?.id === sl.id
                    return (
                      <Pressable
                        key={sl.id}
                        onPress={() => setOpdSlot(on ? null : (sl as any))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={{
                          flexGrow: 1, flexBasis: '30%', minHeight: 46,
                          alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                          backgroundColor: on ? t.q.sel : t.q.surface,
                          borderWidth: 1, borderColor: on ? t.q.primary : t.q.line,
                        }}>
                        <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: on ? '700' : '400', color: on ? t.q.primary : t.q.ink70 }}>
                          {sl.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}

              <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
                <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
                  {bookingType === 'virtual'
                    ? 'The doctor calls you during your window when it is your turn. Keep your phone on.'
                    : 'A doctor is assigned by the front desk when you arrive. Your window is a preferred arrival time.'}
                </Text>
              </View>
            </>
          )}

          {/* ══ STEP 3 — Review and pay ═════════════════════════════ */}
          {step === STEP_CONFIRM && (
            <>
              {isManual && (
                <Notice tone="amber" icon="time-outline">
                  Pending hospital review. Nothing is charged now — you pay at the hospital, and if the
                  request is rejected there is nothing to pay.
                </Notice>
              )}

              <SectionHead title="Booking summary" />
              <Card>
                <DetailRow label="Patient" value={bookingForDependentId
                  ? (linkedDependents.find(d => d.dependent.id === bookingForDependentId)?.dependent.full_name ?? 'Dependent')
                  : (user?.full_name ?? 'Me')} />
                <DetailRow label="Hospital" value={hospital?.name ?? '—'} />
                {selectedClinic && (
                  <DetailRow label="Clinic" value={selectedClinic.name + (!selectedClinic.is_opd ? ' (pending review)' : '')} />
                )}
                <DetailRow label="Type" value={bookingType === 'virtual' ? 'Video consultation' : 'In person'} />
                <DetailRow label="Doctor" value={bookingType === 'virtual'
                  ? (preferredDoc?.full_name ?? 'No preference — hospital assigns')
                  : 'Assigned on arrival'} />
                <DetailRow label="Arrive" value={`${DATES.find(d => d.iso === selectedDate)?.label ?? selectedDate}${opdSlot ? ', ' + opdSlot.label : ''}`} />
                <DetailRow label="Reason" value={reason || '—'} />
                <DetailRow label="Priority" value={urgency === 'emergency' ? 'Emergency' : 'Routine'} last />
              </Card>

              <SectionHead title="Order summary" />
              <Card>
                <DetailRow
                  label={bookingType === 'virtual' ? 'Consultation' : 'OPD fee'}
                  value={`₦${baseFee.toLocaleString('en-NG')}`} mono />
                <DetailRow label="Platform fee" value="₦500" mono />
                {emergencyExtra > 0 && (
                  <DetailRow label={`Emergency (${EMERGENCY_FEE_MULTIPLIER}×)`} value={`₦${emergencyExtra.toLocaleString('en-NG')}`} mono />
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 48 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: t.q.ink }}>Total</Text>
                  <Mono size={17} weight="700" color={t.q.primary}>₦{totalFee.toLocaleString('en-NG')}</Mono>
                </View>
              </Card>

              <SectionHead title="Payment method" />
              <Card>
                {PAYMENT_OPTIONS.map((pm, i) => {
                  const on = payMethod === pm.id
                  return (
                    <View key={pm.id}>
                      {i > 0 && <Hair />}
                      <Row
                        icon={pm.icon}
                        iconTone={on ? 'teal' : 'neutral'}
                        tint={on}
                        title={pm.label}
                        sub={pm.id === 'wallet' && walletKobo != null ? `Balance ${naira(walletKobo)}` : pm.sub}
                        right={on ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                        onPress={() => setPayMethod(pm.id)}
                      />
                    </View>
                  )
                })}
              </Card>

              <SectionHead title="If you cannot come" />
              <Card pad>
                {[
                  'Cancel any time before your appointment — no charge.',
                  'No-show: you have 48 hours to reschedule free.',
                  'Rejected by the hospital: nothing is charged.',
                  'Repeated late cancellations may affect future bookings.',
                ].map(line => (
                  <View key={line} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    <Text style={{ color: t.q.ink60 }}>·</Text>
                    <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: t.q.ink70 }}>{line}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </Body>

        {!!submitError && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
            <Text style={{ fontSize: 12, color: t.q.red, textAlign: 'center' }}>{submitError}</Text>
          </View>
        )}

        {/* Why Continue is disabled, so the page never reads as a dead end. */}
        {!!blockingReason() && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
            <Text style={{ fontSize: 12, color: t.q.ink60, textAlign: 'center' }}>{blockingReason()}</Text>
          </View>
        )}

        <BottomBar meta={
          step >= STEP_DETAILS && totalFee > 0 ? (
            <>
              <Mono size={12} color={t.q.ink60}>Total</Mono>
              <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
              <Mono size={12} weight="700">₦{totalFee.toLocaleString('en-NG')}</Mono>
            </>
          ) : undefined
        }>
          {step < STEP_CONFIRM ? (
            <Btn
              grow
              label={step === STEP_HOSPITAL ? 'Continue · your visit' : 'Continue to payment'}
              disabled={!canAdvance()}
              onPress={() => { haptics.tap(); setStep(n => n + 1) }}
            />
          ) : (
            <Btn
              grow
              label={isManual ? 'Submit for review' : `Pay ₦${totalFee.toLocaleString('en-NG')}`}
              loading={submitting}
              onPress={() => { haptics.success(); handleConfirm() }}
            />
          )}
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
