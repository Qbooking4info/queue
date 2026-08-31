import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
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
import { emergencyPremium, totalBookingFee, EMERGENCY_FEE_MULTIPLIER } from '@queue/shared/lib/fees'
import { Avatar } from '@queue/shared/components/ui/Avatar'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import type { Clinic, BookingResult, DayHours, LinkedDependent } from '@queue/shared/lib/api'

interface Props { navigation: any; route: any }

// Step indices
const STEP_TYPE     = 0
const STEP_HOSPITAL = 1
const STEP_DETAILS  = 2
const STEP_SCHEDULE = 3
const STEP_CONFIRM  = 4

const STEP_LABELS = ['Type', 'Hospital', 'Details', 'Schedule', 'Confirm']

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

  const startStep = presetType && presetHospital ? STEP_DETAILS
                  : presetType                   ? STEP_HOSPITAL
                  : STEP_TYPE

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
  const [payMethod,   setPayMethod]   = useState('card')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')

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
    const prev = step - 1
    // skip hospital step on back if it was pre-set
    if (prev === STEP_HOSPITAL && presetHospital) { setStep(STEP_TYPE); return }
    setStep(prev)
  }

  function canAdvance() {
    if (step === STEP_HOSPITAL) return !!hospital
    if (step === STEP_DETAILS) {
      if (isEmergency && hospitalOpenNow === false) return false
      if (noEmergencyClinic) return false
      if (clinicRestrictionReason) return false
      return reason.trim().length >= 3 && !(hospital?.clinic_model === 'multi' && !selectedClinic)
    }
    if (step === STEP_SCHEDULE) {
      return !!opdSlot && !dateFullMap[selectedDate]
    }
    return true
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
        const outcome = await payForAppointment(result.id)
        if (outcome.status === 'error') {
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
      navigation.navigate('Confirmation', {
        hospital, doctor: preferredDoc ?? null, selectedDate,
        urgency, bookingType,
        bookingRef: result.bookingRef, approvalStatus: result.approvalStatus,
      })
    } else {
      setSubmitError(result && !result.ok ? `Booking failed: ${result.error}` : 'Booking failed. Please try again.')
    }
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  const visibleLabels = STEP_LABELS.slice(startStep)
  const visibleIndex  = step - startStep

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.container}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={goBack} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={t.textMuted} />
          </TouchableOpacity>
          <Text style={[s.title, { color: t.textPrimary }]}>
            {step === STEP_TYPE     && 'New Appointment'}
            {step === STEP_HOSPITAL && 'Choose Hospital'}
            {step === STEP_DETAILS  && (rescheduleCtx ? 'Reschedule Visit' : 'Tell Us More')}
            {step === STEP_SCHEDULE && (rescheduleCtx ? 'Pick a New Time' : 'Pick a Time')}
            {step === STEP_CONFIRM  && (rescheduleCtx ? 'Confirm New Date' : 'Review & Confirm')}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Progress */}
        <View style={s.progress}>
          {visibleLabels.map((label, i) => (
            <View key={label} style={{ flex: 1 }}>
              <View style={[s.progressBar, { backgroundColor: i <= visibleIndex ? t.accent : t.cardBorder }]} />
              <Text style={[s.progressLabel, {
                color:      i <= visibleIndex ? t.accent : t.textMuted,
                fontWeight: i === visibleIndex ? '700' : '400',
              }]}>{label}</Text>
            </View>
          ))}
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* ══ STEP 0 — Choose type ══════════════════════════════════ */}
          {step === STEP_TYPE && (
            <View style={s.stepWrap}>
              <Text style={[s.stepHeading, { color: t.textPrimary }]}>
                How would you like to see a doctor?
              </Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>
                Choose your consultation type to get started.
              </Text>

              {([
                {
                  type: 'physical' as const,
                  icon: 'business-outline' as const,
                  iconColor: t.accent,
                  iconBg: t.accentBg,
                  label: 'Physical Visit',
                  desc:  'Visit the hospital in person. A doctor will be assigned when you arrive at the clinic.',
                },
                {
                  type: 'virtual' as const,
                  icon: 'videocam-outline' as const,
                  iconColor: '#85B7EB',
                  iconBg: 'rgba(55,138,221,0.12)',
                  label: 'Virtual Consultation',
                  desc:  'Video or phone call with a doctor. You can choose a preferred doctor if available.',
                },
              ]).map(opt => (
                <TouchableOpacity key={opt.type}
                  onPress={() => { setBookingType(opt.type); setPreferredDoc(null); setStep(STEP_HOSPITAL) }}
                  style={[s.typeCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <View style={[s.typeIcon, { backgroundColor: opt.iconBg }]}>
                    <Ionicons name={opt.icon} size={26} color={opt.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.typeLabel, { color: t.textPrimary }]}>{opt.label}</Text>
                    <Text style={[s.typeSub,   { color: t.textMuted   }]}>{opt.desc}</Text>
                  </View>
                  <Text style={{ color: t.textMuted, fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ══ STEP 1 — Choose hospital ══════════════════════════════ */}
          {step === STEP_HOSPITAL && (
            <View style={s.stepWrap}>
              <Text style={[s.stepSub, { color: t.textMuted, marginBottom: 14 }]}>
                {bookingType === 'virtual'
                  ? 'Showing hospitals that offer virtual consultations'
                  : 'All hospitals available for in-person visits'}
              </Text>

              <View style={[s.searchRow, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                <Ionicons name="search-outline" size={14} color={t.textMuted} />
                <TextInput
                  value={searchText} onChangeText={setSearchText}
                  placeholder="Search hospitals…"
                  placeholderTextColor={t.textMuted}
                  style={[s.searchInput, { color: t.textPrimary }]}
                />
                {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}>
                    <Ionicons name="close-circle" size={14} color={t.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {loadingHosp ? (
                <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />
              ) : hospitalList.length === 0 ? (
                <View style={[s.emptyBox, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                  <Ionicons name="business-outline" size={28} color={t.textMuted} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <Text style={[{ fontSize: 13, color: t.textMuted, textAlign: 'center' }]}>
                    {bookingType === 'virtual'
                      ? 'No hospitals with virtual consultations found.'
                      : 'No hospitals found. Try a different search.'}
                  </Text>
                </View>
              ) : (
                hospitalList.map(h => (
                  <TouchableOpacity key={h.id}
                    onPress={() => {
                      setHospital(h)
                      setPreferredDoc(null)
                      setSelectedClinic(null); setReferralNote('')
                      setStep(STEP_DETAILS)
                    }}
                    style={[s.hospRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                    <Avatar initials={h.avatar} bg={h.avatarBg} size={42} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={[s.hospName, { color: t.textPrimary }]} numberOfLines={1}>{h.name}</Text>
                        {h.verified && <Ionicons name="checkmark-circle" size={12} color={t.accent} />}
                      </View>
                      <Text style={[s.hospSpec, { color: t.textMuted }]} numberOfLines={1}>{h.specialty}</Text>
                      <View style={{ flexDirection: 'row', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                        {h.virtual && (
                          <View style={[s.miniTag, { backgroundColor: 'rgba(55,138,221,0.1)', borderColor: 'rgba(55,138,221,0.2)' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="videocam-outline" size={9} color="#85B7EB" /><Text style={{ fontSize: 9, color: '#85B7EB' }}>Virtual</Text></View>
                          </View>
                        )}
                        {h.approval_mode === 'manual' && (
                          <View style={[s.miniTag, { backgroundColor: 'rgba(239,159,39,0.1)', borderColor: 'rgba(239,159,39,0.2)' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="clipboard-outline" size={9} color="#EF9F27" /><Text style={{ fontSize: 9, color: '#EF9F27' }}>Manual review</Text></View>
                          </View>
                        )}
                        {h.opd_fee != null && h.opd_fee > 0 && bookingType === 'physical' && (
                          <View style={[s.miniTag, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                            <Text style={{ fontSize: 9, color: t.accent }}>₦{Number(h.opd_fee).toLocaleString()} OPD</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={{ color: t.textMuted, fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* ══ STEP 2 — Details (reason + urgency) ══════════════════ */}
          {step === STEP_DETAILS && (
            <View style={s.stepWrap}>
              {/* Context chip */}
              <View style={[s.contextChip, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                <Text style={{ fontSize: 16 }}>{bookingType === 'virtual' ? <Ionicons name="videocam-outline" size={16} color={t.textMuted} /> : <Ionicons name="walk-outline" size={16} color={t.accent} />}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.contextName, { color: t.textPrimary }]} numberOfLines={1}>
                    {hospital?.name}
                  </Text>
                  <Text style={[{ fontSize: 11, color: t.textMuted }]}>
                    {bookingType === 'virtual' ? 'Virtual consultation' : 'In-person visit'}
                  </Text>
                </View>
                {!presetHospital && (
                  <TouchableOpacity onPress={() => setStep(STEP_HOSPITAL)}>
                    <Text style={{ fontSize: 11, color: t.accent }}>Change</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Who is this for -- linked (real-account) dependents only */}
              {linkedDependents.length > 0 && (
                <>
                  <Text style={[s.label, { color: t.textMuted }]}>Who is this for?</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    <TouchableOpacity onPress={() => setBookingForDependentId(null)}
                      style={[s.forBtnSmall, {
                        borderColor:     !bookingForDependentId ? t.accent : t.cardBorder,
                        backgroundColor: !bookingForDependentId ? t.accentBg : t.cardBg,
                      }]}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: !bookingForDependentId ? t.accent : t.textMuted }}>Myself</Text>
                    </TouchableOpacity>
                    {linkedDependents.map(d => (
                      <TouchableOpacity key={d.linkId} onPress={() => setBookingForDependentId(d.dependent.id)}
                        style={[s.forBtnSmall, {
                          borderColor:     bookingForDependentId === d.dependent.id ? t.accent : t.cardBorder,
                          backgroundColor: bookingForDependentId === d.dependent.id ? t.accentBg : t.cardBg,
                        }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: bookingForDependentId === d.dependent.id ? t.accent : t.textMuted }}>
                          {d.dependent.full_name} ({d.relationship})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {isManual && (
                <View style={[s.noticeBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                  <Text style={{ fontSize: 12, color: '#EF9F27', lineHeight: 18 }}>
                    <Text style={{ fontWeight: '700' }}>Manual approval:</Text> This hospital reviews each booking. Please describe your symptoms clearly so they can assess your case.
                  </Text>
                </View>
              )}

              <Text style={[s.label, { color: t.textMuted }]}>{bookingType === 'virtual' ? 'Reason for consultation' : 'Reason for visit'} *</Text>
              <TextInput
                value={reason} onChangeText={setReason}
                multiline numberOfLines={3}
                placeholder="e.g. Persistent headache for 3 days, chest discomfort, follow-up after surgery…"
                placeholderTextColor={t.textMuted}
                style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
              />

              <Text style={[s.label, { color: t.textMuted, marginTop: 16 }]}>How urgent is this?</Text>
              <View style={{ gap: 8 }}>
                {([
                  ['routine',   'medical-outline',      'Routine',   'Regular check-up or follow-up'],
                  ['emergency', 'warning-outline',       'Emergency', 'Severe symptoms requiring prompt care (2× fee)'],
                ] as const).map(([id, icon, label, sub]) => {
                  const active = urgency === id
                  const danger = id === 'emergency'
                  const activeColor = danger ? '#FF5C5C' : t.accent
                  const activeBg    = danger ? 'rgba(255,92,92,0.08)' : t.accentBg
                  return (
                    <TouchableOpacity key={id} onPress={() => setUrgency(id)}
                      style={[s.urgRow, {
                        borderColor:     active ? activeColor : t.cardBorder,
                        backgroundColor: active ? activeBg    : t.cardBg,
                      }]}>
                      <Ionicons name={icon} size={20} color={active ? activeColor : t.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.urgLabel, { color: active ? activeColor : t.textPrimary }]}>{label}</Text>
                        <Text style={[s.urgSub,   { color: t.textMuted }]}>{sub}</Text>
                      </View>
                      <View style={[s.radio, {
                        borderColor:     active ? activeColor : t.cardBorder,
                        backgroundColor: active ? activeColor : 'transparent',
                      }]}>
                        {active && <Ionicons name="checkmark" size={10} color="#000" />}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {isEmergency && (
                <View style={[s.noticeBox, {
                  marginTop: 12,
                  backgroundColor: hospitalOpenNow === false ? 'rgba(255,92,92,0.1)' : 'rgba(255,92,92,0.06)',
                  borderColor: 'rgba(255,92,92,0.35)',
                }]}>
                  {hospitalOpenNow === false ? (
                    <Text style={{ fontSize: 12, color: '#FF5C5C', lineHeight: 18 }}>
                      <Text style={{ fontWeight: '800' }}>{hospital?.name} is closed right now.</Text> Emergency
                      bookings can only be for today, so please go back and choose a hospital that's currently open.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#FF5C5C', lineHeight: 18 }}>
                      Emergency bookings are for <Text style={{ fontWeight: '800' }}>today only</Text> — you won't
                      be able to pick a future date, and you'll be prioritized to the front of today's queue.
                    </Text>
                  )}
                </View>
              )}

              {/* ── Clinic selector (multi-clinic hospitals) ────────── */}
              {hospital?.clinic_model === 'multi' && (
                <View style={{ marginTop: 20 }}>
                  <Text style={[s.label, { color: t.textMuted }]}>
                    {isEmergency ? 'Emergency department' : 'Select a clinic *'}
                  </Text>

                  {!isEmergency && (
                    <View style={[s.noticeBox, { backgroundColor: 'rgba(26,127,193,0.08)', borderColor: 'rgba(26,127,193,0.25)', marginBottom: 12 }]}>
                      <Text style={{ fontSize: 12, color: '#1A7FC1', lineHeight: 18 }}>
                        <Text style={{ fontWeight: '700' }}>Not sure where to go?</Text>{' Book OPD — our front desk will direct you to the right specialist.'}
                      </Text>
                    </View>
                  )}

                  {noEmergencyClinic && (
                    <View style={[s.noticeBox, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.35)', marginBottom: 12 }]}>
                      <Text style={{ fontSize: 12, color: '#FF5C5C', lineHeight: 18 }}>
                        <Text style={{ fontWeight: '800' }}>{hospital?.name} hasn't set up an Emergency Department.</Text> Please
                        go back and choose a different hospital for an emergency booking.
                      </Text>
                    </View>
                  )}

                  {loadingClinics ? (
                    <ActivityIndicator color={t.accent} style={{ marginVertical: 12 }} />
                  ) : (
                    visibleClinics.map(clinic => {
                      const active = selectedClinic?.id === clinic.id
                      return (
                        <TouchableOpacity key={clinic.id}
                          onPress={() => { setSelectedClinic(active ? null : clinic); setReferralNote('') }}
                          style={[s.urgRow, {
                            borderColor:     active ? t.accent : t.cardBorder,
                            backgroundColor: active ? t.accentBg : t.cardBg,
                            marginBottom: 8,
                          }]}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                              <Text style={[s.urgLabel, { color: active ? t.accent : t.textPrimary }]}>{clinic.name}</Text>
                              {isEmergency ? (
                                <View style={[s.miniTag, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.35)' }]}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Ionicons name="alert-circle-outline" size={9} color="#FF5C5C" /><Text style={{ fontSize: 9, fontWeight: '700', color: '#FF5C5C' }}>Emergency</Text></View>
                                </View>
                              ) : clinic.is_opd ? (
                                <View style={[s.miniTag, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: t.accent }}>Recommended</Text>
                                </View>
                              ) : (
                                <View style={[s.miniTag, { backgroundColor: 'rgba(239,159,39,0.1)', borderColor: 'rgba(239,159,39,0.3)' }]}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#EF9F27' }}>Needs referral</Text>
                                </View>
                              )}
                            </View>
                            {clinic.description && (
                              <Text style={[s.urgSub, { color: t.textMuted, marginTop: 3 }]}>{clinic.description}</Text>
                            )}
                            {clinic.service_tags?.length > 0 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                                {clinic.service_tags.slice(0, 4).map(tag => (
                                  <View key={tag} style={[s.miniTag, {
                                    backgroundColor: active ? t.accentBgMid : t.inputBg,
                                    borderColor: active ? t.accentBorder : t.cardBorder,
                                  }]}>
                                    <Text style={{ fontSize: 9, color: active ? t.accent : t.textMuted }}>{tag}</Text>
                                  </View>
                                ))}
                                {clinic.service_tags.length > 4 && (
                                  <Text style={{ fontSize: 9, color: t.textMuted, alignSelf: 'center' }}>
                                    +{clinic.service_tags.length - 4}
                                  </Text>
                                )}
                              </View>
                            )}
                          </View>
                          <View style={[s.radio, {
                            borderColor:     active ? t.accent : t.cardBorder,
                            backgroundColor: active ? t.accent : 'transparent',
                          }]}>
                            {active && <Ionicons name="checkmark" size={10} color="#000" />}
                          </View>
                        </TouchableOpacity>
                      )
                    })
                  )}

                  {clinicRestrictionReason && (
                    <View style={[s.noticeBox, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.35)', marginTop: 4 }]}>
                      <Text style={{ fontSize: 12, color: '#FF5C5C', lineHeight: 18 }}>
                        <Text style={{ fontWeight: '800' }}>Can't book this clinic.</Text> {clinicRestrictionReason.reason}
                      </Text>
                      {clinicRestrictionReason.needsProfile && (
                        <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('MedicalHistory') }} style={{ marginTop: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF5C5C', textDecorationLine: 'underline' }}>
                            Complete your health profile →
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {selectedClinic && !selectedClinic.is_opd && !isEmergency && !clinicRestrictionReason && (
                    <>
                      <View style={[s.noticeBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)', marginTop: 4 }]}>
                        <Text style={{ fontSize: 12, color: '#EF9F27', lineHeight: 18 }}>
                          <Text style={{ fontWeight: '700' }}>Specialist clinic</Text>{' — the hospital will review your booking. A referral note helps them approve faster.'}
                        </Text>
                      </View>
                      <Text style={[s.label, { color: t.textMuted, marginTop: 10 }]}>Referral note (optional)</Text>
                      <TextInput
                        value={referralNote} onChangeText={setReferralNote}
                        multiline numberOfLines={3}
                        placeholder="e.g. Referred by Dr. Okafor for chest pain. Include referral letter details here."
                        placeholderTextColor={t.textMuted}
                        style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                      />
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ══ STEP 3 — Schedule ════════════════════════════════════ */}
          {step === STEP_SCHEDULE && (
            <View style={s.stepWrap}>

              {/* ── Physical ───────────────────────────────────────── */}
              {bookingType === 'physical' && (
                <>
                  <Text style={[s.label, { color: t.textMuted }]}>Choose a date</Text>
                  {checkingLim && (
                    <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Checking availability…</Text>
                  )}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
                    {(isEmergency ? DATES.slice(0, 1) : DATES).map(d => {
                      const active = selectedDate === d.iso
                      const full   = !!dateFullMap[d.iso]
                      return (
                        <TouchableOpacity key={d.iso} onPress={() => !full && setSelectedDate(d.iso)}
                          disabled={full}
                          style={[s.dateChip, {
                            borderColor:     full ? t.cardBorder : active ? t.accent : t.cardBorder,
                            backgroundColor: full ? t.inputBg   : active ? t.accentBg : t.cardBg,
                            opacity: full ? 0.45 : 1,
                          }]}>
                          <Text style={[s.dateLabel, { color: full ? t.textMuted : active ? t.accent : t.textPrimary }]}>
                            {d.label}
                          </Text>
                          {full && <Text style={{ fontSize: 9, color: t.textMuted }}>Full</Text>}
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                  {isEmergency && (
                    <Text style={{ fontSize: 11, color: '#FF5C5C', marginBottom: 8 }}>
                      Emergency bookings are today only — no other dates available.
                    </Text>
                  )}
                  {dateFullMap[selectedDate] && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}><Ionicons name="alert-circle-outline" size={13} color="#EF9F27" style={{ marginTop: 1 }} /><Text style={{ fontSize: 12, color: '#EF9F27', flex: 1 }}>This date is fully booked. Please pick another day.</Text></View>
                    </View>
                  )}

                  <Text style={[s.label, { color: t.textMuted, marginTop: 14 }]}>Preferred arrival window</Text>
                  {opdSlots.length === 0 && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}><Ionicons name="alert-circle-outline" size={13} color="#EF9F27" style={{ marginTop: 1 }} /><Text style={{ fontSize: 12, color: '#EF9F27', flex: 1 }}>No available slots for today. Please choose another date.</Text></View>
                    </View>
                  )}
                  <View style={s.slotGrid}>
                    {opdSlots.map(sl => {
                      const active = opdSlot?.id === sl.id
                      return (
                        <TouchableOpacity key={sl.id} onPress={() => setOpdSlot(active ? null : sl)}
                          style={[s.slotBtn, {
                            borderColor:     active ? t.accent : t.cardBorder,
                            backgroundColor: active ? t.accentBg : t.cardBg,
                          }]}>
                          <Text style={[s.slotText, {
                            color: active ? t.accent : t.textSecondary,
                            fontWeight: active ? '700' : '400',
                          }]}>{sl.label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  <View style={[s.infoBox, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                    <Text style={[s.infoText, { color: t.textMuted }]}>
                      A doctor will be assigned by the front desk when you arrive. Your selected window is a preferred arrival time.
                    </Text>
                  </View>
                </>
              )}

              {/* ── Virtual ────────────────────────────────────────── */}
              {bookingType === 'virtual' && (
                <>
                  {/* How it works banner */}
                  <View style={[s.infoBox, { backgroundColor: 'rgba(55,138,221,0.08)', borderColor: 'rgba(55,138,221,0.22)', marginBottom: 18 }]}>
                    <Text style={[s.infoText, { color: '#85B7EB', lineHeight: 18 }]}>
                      <Text style={{ fontWeight: '700' }}>Virtual queue — how it works:</Text>{'\n'}
                      Join the queue for your chosen date and window. When it's your turn, the doctor will call you directly. You don't need to be at the hospital.
                    </Text>
                  </View>

                  {/* Preferred doctor (optional) */}
                  {virtualDoctors.length > 0 && (
                    <>
                      <Text style={[s.label, { color: t.textMuted }]}>Preferred doctor (optional)</Text>
                      <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>
                        Pick a doctor you'd like to consult, or skip — the hospital will assign one.
                      </Text>

                      <TouchableOpacity
                        onPress={() => setPreferredDoc(null)}
                        style={[s.docRow, {
                          borderColor:     !preferredDoc ? t.accent : t.cardBorder,
                          backgroundColor: !preferredDoc ? t.accentBg : t.cardBg,
                        }]}>
                        <View style={[s.docAvatarBox, { backgroundColor: t.inputBg }]}>
                          <Ionicons name="shuffle-outline" size={18} color={t.textMuted} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.docName, { color: !preferredDoc ? t.accent : t.textPrimary }]}>No preference</Text>
                          <Text style={[s.docSpec, { color: t.textMuted }]}>Hospital assigns the next available doctor</Text>
                        </View>
                        <View style={[s.radio, {
                          borderColor:     !preferredDoc ? t.accent : t.cardBorder,
                          backgroundColor: !preferredDoc ? t.accent : 'transparent',
                        }]}>
                          {!preferredDoc && <Ionicons name="checkmark" size={10} color="#000" />}
                        </View>
                      </TouchableOpacity>

                      {virtualDoctors.map((d: any) => {
                        const active   = preferredDoc?.id === d.id
                        const initials = (d.full_name ?? 'Dr')
                          .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                        const fee = d.virtual_fee ?? d.consultation_fee ?? 0
                        return (
                          <TouchableOpacity key={d.id}
                            onPress={() => setPreferredDoc(active ? null : d)}
                            style={[s.docRow, {
                              borderColor:     active ? t.accent : t.cardBorder,
                              backgroundColor: active ? t.accentBg : t.cardBg,
                            }]}>
                            <Avatar initials={initials} bg="#1A2A4A" size={40} />
                            <View style={{ flex: 1 }}>
                              <Text style={[s.docName, { color: active ? t.accent : t.textPrimary }]}>{d.full_name}</Text>
                              <Text style={[s.docSpec, { color: t.textMuted }]}>
                                {d.specialty?.name ?? 'Specialist'} · ₦{Number(fee).toLocaleString()}
                              </Text>
                            </View>
                            <View style={[s.radio, {
                              borderColor:     active ? t.accent : t.cardBorder,
                              backgroundColor: active ? t.accent : 'transparent',
                            }]}>
                              {active && <Ionicons name="checkmark" size={10} color="#000" />}
                            </View>
                          </TouchableOpacity>
                        )
                      })}
                    </>
                  )}

                  {/* Date */}
                  <Text style={[s.label, { color: t.textMuted, marginTop: 16 }]}>Choose a date</Text>
                  {checkingLim && (
                    <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Checking availability…</Text>
                  )}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
                    {(isEmergency ? DATES.slice(0, 1) : DATES).map(d => {
                      const active = selectedDate === d.iso
                      const full   = !!dateFullMap[d.iso]
                      return (
                        <TouchableOpacity key={d.iso} onPress={() => !full && setSelectedDate(d.iso)}
                          disabled={full}
                          style={[s.dateChip, {
                            borderColor:     full ? t.cardBorder : active ? t.accent : t.cardBorder,
                            backgroundColor: full ? t.inputBg   : active ? t.accentBg : t.cardBg,
                            opacity: full ? 0.45 : 1,
                          }]}>
                          <Text style={[s.dateLabel, { color: full ? t.textMuted : active ? t.accent : t.textPrimary }]}>
                            {d.label}
                          </Text>
                          {full && <Text style={{ fontSize: 9, color: t.textMuted }}>Full</Text>}
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                  {isEmergency && (
                    <Text style={{ fontSize: 11, color: '#FF5C5C', marginBottom: 8 }}>
                      Emergency bookings are today only — no other dates available.
                    </Text>
                  )}
                  {dateFullMap[selectedDate] && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}><Ionicons name="alert-circle-outline" size={13} color="#EF9F27" style={{ marginTop: 1 }} /><Text style={{ fontSize: 12, color: '#EF9F27', flex: 1 }}>This date is fully booked. Please pick another day.</Text></View>
                    </View>
                  )}

                  {/* Arrival window */}
                  <Text style={[s.label, { color: t.textMuted, marginTop: 14 }]}>Preferred call window</Text>
                  {opdSlots.length === 0 && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}><Ionicons name="alert-circle-outline" size={13} color="#EF9F27" style={{ marginTop: 1 }} /><Text style={{ fontSize: 12, color: '#EF9F27', flex: 1 }}>No available windows for today. Please choose another date.</Text></View>
                    </View>
                  )}
                  <View style={s.slotGrid}>
                    {opdSlots.map(sl => {
                      const active = opdSlot?.id === sl.id
                      return (
                        <TouchableOpacity key={sl.id} onPress={() => setOpdSlot(active ? null : sl)}
                          style={[s.slotBtn, {
                            borderColor:     active ? t.accent : t.cardBorder,
                            backgroundColor: active ? t.accentBg : t.cardBg,
                          }]}>
                          <Text style={[s.slotText, {
                            color: active ? t.accent : t.textSecondary,
                            fontWeight: active ? '700' : '400',
                          }]}>{sl.label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  <View style={[s.infoBox, { backgroundColor: t.inputBg, borderColor: t.cardBorder, marginTop: 10 }]}>
                    <Text style={[s.infoText, { color: t.textMuted }]}>
                      The doctor will call you during your selected window when it's your turn. Make sure your phone is on.
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* ══ STEP 4 — Review & Confirm ════════════════════════════ */}
          {step === STEP_CONFIRM && (
            <View style={s.stepWrap}>

              {isManual && (
                <View style={[s.noticeBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)', marginBottom: 14 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}><Ionicons name="time-outline" size={14} color="#EF9F27" /><Text style={{ fontSize: 13, fontWeight: '700', color: '#EF9F27' }}>Pending hospital review</Text></View>
                  <Text style={{ fontSize: 12, color: '#EF9F27', lineHeight: 18 }}>
                    Nothing is charged now — you pay at the hospital. If the hospital rejects the request, there is nothing to pay.
                  </Text>
                </View>
              )}

              {/* Summary */}
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.cardTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Booking summary</Text>
                {[
                  { label: 'Hospital', value: hospital?.name ?? '—' },
                  ...(selectedClinic ? [{ label: 'Clinic', value: selectedClinic.name + (!selectedClinic.is_opd ? ' (pending review)' : '') }] : []),
                  { label: 'Type',     value: bookingType === 'virtual' ? 'Virtual consultation' : 'Physical visit' },
                  { label: 'Doctor',   value: bookingType === 'virtual'
                      ? (preferredDoc?.full_name ?? 'No preference — hospital assigns')
                      : 'Assigned on arrival at clinic' },
                  { label: 'Date',     value: DATES.find(d => d.iso === selectedDate)?.label ?? selectedDate },
                  { label: 'Time',     value: opdSlot?.label ?? '—' },
                  { label: 'Reason',   value: reason },
                  { label: 'Priority', value: urgency.charAt(0).toUpperCase() + urgency.slice(1) },
                ].map(row => (
                  <View key={row.label} style={[s.cardRow, { borderBottomColor: t.cardBorder }]}>
                    <Text style={[s.cardLabel, { color: t.textMuted }]}>{row.label}</Text>
                    <Text style={[s.cardValue, { color: t.textPrimary }]} numberOfLines={2}>{row.value}</Text>
                  </View>
                ))}
              </View>

              {/* Fee */}
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.cardTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Order summary</Text>
                {[
                  { label: bookingType === 'virtual' ? 'Consultation fee' : 'OPD fee', value: `₦${baseFee.toLocaleString()}` },
                  { label: 'Platform fee', value: '₦500' },
                  ...(emergencyExtra > 0 ? [{ label: `Emergency premium (${EMERGENCY_FEE_MULTIPLIER}×)`, value: `₦${emergencyExtra.toLocaleString()}` }] : []),
                ].map(item => (
                  <View key={item.label} style={[s.cardRow, { borderBottomColor: t.cardBorder }]}>
                    <Text style={[s.cardLabel, { color: t.textMuted }]}>{item.label}</Text>
                    <Text style={[s.cardValue, { color: t.textPrimary }]}>{item.value}</Text>
                  </View>
                ))}
                <View style={[s.cardRow, { borderBottomColor: 'transparent' }]}>
                  <Text style={[s.cardLabel, { color: t.textPrimary, fontWeight: '700', fontSize: 14 }]}>Total</Text>
                  <Text style={[s.cardValue, { color: t.accent, fontWeight: '800', fontSize: 15 }]}>₦{totalFee.toLocaleString()}</Text>
                </View>
              </View>

              {/* Cancellation policy */}
              <View style={[s.policyCard, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                <Text style={[s.policyTitle, { color: t.textPrimary }]}>Cancellation Policy</Text>
                {[
                  { icon: 'checkmark-circle-outline' as const, text: 'Cancel any time before your appointment – no charge' },
                  { icon: 'warning-outline'           as const, text: 'Repeated late cancellations may affect future bookings' },
                  { icon: 'repeat-outline'            as const, text: 'No-show – 48-hour window to reschedule free' },
                  { icon: 'close-circle-outline'      as const, text: 'Booking rejected by hospital – no charge' },
                ].map((p, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
                    <Ionicons name={p.icon} size={13} color={t.textSecondary} />
                    <Text style={{ fontSize: 12, flex: 1, lineHeight: 17, color: t.textSecondary }}>{p.text}</Text>
                  </View>
                ))}
              </View>

              {/* Payment */}
              <Text style={[s.label, { color: t.textMuted }]}>Payment method</Text>
              {PAYMENT_OPTIONS.map(p => {
                const active = payMethod === p.id
                return (
                  <TouchableOpacity key={p.id} onPress={() => setPayMethod(p.id)}
                    style={[s.payRow, {
                      backgroundColor: active ? t.accentBg : t.cardBg,
                      borderColor:     active ? t.accentBorder : t.cardBorder,
                    }]}>
                    <Ionicons name={p.icon} size={20} color={active ? t.accent : t.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.payLabel, { color: active ? t.accent : t.textPrimary }]}>{p.label}</Text>
                      <Text style={[s.paySub,   { color: t.textMuted }]}>{p.sub}</Text>
                    </View>
                    <View style={[s.radio, {
                      borderColor:     active ? t.accent : t.cardBorder,
                      backgroundColor: active ? t.accent : 'transparent',
                    }]}>
                      {active && <Ionicons name="checkmark" size={10} color="#000" />}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Error */}
        {submitError.length > 0 && (
          <Text style={{ color: '#F87171', fontSize: 12, textAlign: 'center', paddingBottom: 6, paddingHorizontal: 20 }}>
            {submitError}
          </Text>
        )}

        {/* CTA row */}
        <View style={[s.ctaWrap, { borderTopColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
          {step > startStep && step !== STEP_TYPE && (
            <TouchableOpacity onPress={goBack}
              style={[s.backStepBtn, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
              <Text style={[s.backStepText, { color: t.textPrimary }]}>Back</Text>
            </TouchableOpacity>
          )}

          {/* Type step: no CTA — tapping a card advances */}
          {step !== STEP_TYPE && step < STEP_CONFIRM && (
            <TouchableOpacity onPress={() => { haptics.tap(); setStep(s => s + 1) }} disabled={!canAdvance()}
              style={[s.ctaBtn, { backgroundColor: canAdvance() ? t.accent : t.inputBg, flex: 1 }]}>
              <Text style={[s.ctaBtnText, { color: canAdvance() ? '#fff' : t.textMuted }]}>
                Continue
              </Text>
            </TouchableOpacity>
          )}

          {step === STEP_CONFIRM && (
            <TouchableOpacity onPress={() => { haptics.success(); handleConfirm() }} disabled={submitting}
              style={[s.ctaBtn, { backgroundColor: t.accent, opacity: submitting ? 0.6 : 1, flex: 1 }]}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={[s.ctaBtnText, { color: '#fff' }]}>
                    {isManual ? 'Submit for Review' : 'Confirm booking'}
                  </Text>}
            </TouchableOpacity>
          )}
        </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:         { flex: 1 },
  container:    { flex: 1, paddingHorizontal: 20 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, marginBottom: 12 },
  backBtn:      { width: 32, height: 32, justifyContent: 'center' },
  backArrow:    { fontSize: 22 },
  title:        { fontSize: 15, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center', flex: 1 },
  progress:     { flexDirection: 'row', gap: 5, marginBottom: 16 },
  progressBar:  { height: 3, borderRadius: 99, marginBottom: 3 },
  progressLabel:{ fontSize: 10 },
  stepWrap:     { paddingTop: 4, paddingBottom: 8 },
  stepHeading:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  stepSub:      { fontSize: 13, lineHeight: 19 },
  // Type
  typeCard:     { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1.5 },
  typeIcon:     { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeLabel:    { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  typeSub:      { fontSize: 12, lineHeight: 17 },
  // Hospital
  searchRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, borderWidth: 1 },
  searchInput:  { flex: 1, fontSize: 13 },
  hospRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 13, marginBottom: 8, borderWidth: 1 },
  hospName:     { fontSize: 13, fontWeight: '700' },
  hospSpec:     { fontSize: 11, marginTop: 1 },
  miniTag:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  emptyBox:     { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: 'center', marginTop: 10 },
  // Details
  contextChip:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 11, marginBottom: 14, borderWidth: 1 },
  contextName:  { fontSize: 13, fontWeight: '700' },
  forBtnSmall:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
  noticeBox:    { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  label:        { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  textarea:     { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top', marginBottom: 4 },
  urgRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13, borderWidth: 1.5 },
  urgLabel:     { fontSize: 13, fontWeight: '700' },
  urgSub:       { fontSize: 11, marginTop: 1 },
  radio:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  // Schedule
  dateChip:     { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, minWidth: 80, alignItems: 'center' },
  dateLabel:    { fontSize: 12, fontWeight: '600' },
  warnBox:      { borderRadius: 10, borderWidth: 1, padding: 11, marginBottom: 10 },
  slotGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  slotBtn:      { width: '30%', paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, alignItems: 'center' },
  slotText:     { fontSize: 12 },
  infoBox:      { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  infoText:     { fontSize: 12, lineHeight: 18 },
  docRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1.5 },
  docAvatarBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  docName:      { fontSize: 13, fontWeight: '700' },
  docSpec:      { fontSize: 11, marginTop: 1 },
  // Confirm
  card:         { borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1 },
  cardTitle:    { padding: 10, paddingHorizontal: 14, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, borderBottomWidth: 1 },
  cardRow:      { flexDirection: 'row', justifyContent: 'space-between', padding: 9, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  cardLabel:    { fontSize: 12 },
  cardValue:    { fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  policyCard:   { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  policyTitle:  { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  payRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13, marginBottom: 8, borderWidth: 1.5 },
  payLabel:     { fontSize: 13, fontWeight: '600' },
  paySub:       { fontSize: 11, marginTop: 1 },
  // CTA
  ctaWrap:      { flexDirection: 'row', gap: 8, paddingVertical: 12, borderTopWidth: 1 },
  backStepBtn:  { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backStepText: { fontSize: 13, fontWeight: '600' },
  ctaBtn:       { borderRadius: 14, padding: 15, alignItems: 'center' },
  ctaBtnText:   { fontSize: 15, fontWeight: '700' },
})
