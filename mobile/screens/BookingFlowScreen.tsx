import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import {
  getHospitals, getDailyBookingCount,
  createAppointment, createHospitalAppointment, addNotification,
  getClinicsForHospital, rescheduleAppointment,
  getHospitalHours, isOpenNow,
} from '../lib/api'
import { toDisplayHospital } from '../lib/adapters'
import { Avatar } from '../components/ui/Avatar'
import type { DisplayHospital } from '../components/hospital/HospitalCard'
import type { Clinic } from '../lib/api'

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

function getBookingDates(n = 8) {
  const dates: { iso: string; label: string }[] = []
  let offset = 0
  while (dates.length < n) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    if (d.getDay() !== 0) {
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
  { id: 'card',     icon: '💳', label: 'Debit / Credit Card',  sub: 'Visa, Mastercard, Verve'   },
  { id: 'transfer', icon: '🏦', label: 'Bank Transfer',        sub: 'Direct bank payment'       },
  { id: 'ussd',     icon: '📱', label: 'USSD',                 sub: '*737#, *966#, *000#'       },
  { id: 'hmo',      icon: '🏥', label: 'HMO / Insurance',      sub: 'NHIS, AXA Mansard, Hygeia' },
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
  const [DATES] = useState(() => getBookingDates(8))

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
  const [selectedDate, setSelectedDate] = useState(DATES[0].iso)

  // Force today the moment urgency becomes emergency — an emergency booking can't be for
  // a future date, even if the patient had already picked one before switching urgency.
  useEffect(() => {
    if (isEmergency) setSelectedDate(DATES[0].iso)
  }, [isEmergency])
  const [opdSlot,      setOpdSlot]      = useState<typeof ALL_OPD_SLOTS[0] | null>(null)
  const [preferredDoc, setPreferredDoc] = useState<any | null>(null)
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

  // Forces opdSlots to re-filter periodically — otherwise a slot that was valid when this
  // screen first rendered can keep showing as bookable long after it's actually passed if
  // the user just sits on the schedule step without triggering any other re-render.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────
  const opdSlots       = getAvailableOpdSlots(selectedDate)
  const virtualDoctors = (hospital?.doctors ?? []).filter((d: any) => d.accepts_virtual)
  const isManual       = hospital?.approval_mode === 'manual' || (selectedClinic != null && !selectedClinic.is_opd)
  const baseFee        = bookingType === 'virtual'
    ? (preferredDoc?.virtual_fee ?? preferredDoc?.consultation_fee ?? 0)
    : (hospital?.opd_fee ?? 0)
  const emergencyExtra = urgency === 'emergency' ? Math.round(baseFee * 0.5) : 0
  const totalFee       = baseFee + emergencyExtra + 500

  // Once emergency is flagged at a multi-clinic hospital, only the hospital's designated
  // Emergency Department clinic is selectable — every other clinic (specialist or OPD) is
  // hidden so patients can't accidentally route a life-threatening visit through a normal
  // referral queue.
  const emergencyClinic    = clinics.find(c => c.is_emergency) ?? null
  const visibleClinics     = isEmergency ? (emergencyClinic ? [emergencyClinic] : []) : clinics
  const noEmergencyClinic  = isEmergency && hospital?.clinic_model === 'multi' && !loadingClinics && !emergencyClinic

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

  // Daily limit check when entering schedule
  useEffect(() => {
    if (step !== STEP_SCHEDULE || !hospital) return
    setCheckingLim(true)
    Promise.all(
      DATES.map(d =>
        getDailyBookingCount(String(hospital.id), d.iso).then(count => ({
          date: d.iso,
          full: urgency !== 'emergency' && hospital.daily_booking_limit != null && count >= hospital.daily_booking_limit,
        }))
      )
    ).then(results => {
      const map: Record<string, boolean> = {}
      results.forEach(r => { map[r.date] = r.full })
      setDateFullMap(map)
      setCheckingLim(false)
    })
  }, [step, bookingType, hospital?.id])

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
    if (hospital.daily_booking_limit && urgency !== 'emergency') {
      const freshCount = await getDailyBookingCount(String(hospital.id), selectedDate, selectedClinic?.id)
      if (freshCount >= hospital.daily_booking_limit) {
        setSubmitError('This time slot is now full. Please choose a different time.')
        setSubmitting(false)
        return
      }
    }

    let result: { id: string; bookingRef: string; approvalStatus: string } | null = null

    // Specialist clinic forces manual approval regardless of hospital setting — except for
    // emergencies, which must never wait on review even if routed to a non-OPD clinic.
    const clinicApprovalMode = isEmergency
      ? 'auto'
      : (selectedClinic && !selectedClinic.is_opd)
        ? 'manual'
        : (hospital.approval_mode ?? 'auto')

    const arrivalTime = opdSlot?.time ?? '09:00'

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
      })
    } else if (bookingType === 'physical' || !preferredDoc) {
      result = await createHospitalAppointment({
        patientId:          user.id,
        hospitalId:         String(hospital.id),
        date:               selectedDate,
        startTime:          arrivalTime,
        reason,
        urgency,
        type:               bookingType === 'virtual' ? 'virtual' : 'in-person',
        approvalMode:       clinicApprovalMode,
        clinicId:           selectedClinic?.id,
        symptomDescription: referralNote || undefined,
      })
    } else {
      // Virtual with preferred doctor — queue-based, no DB slot needed
      result = await createAppointment({
        patientId:    user.id,
        doctorId:     preferredDoc.id,
        hospitalId:   String(hospital.id),
        slotId:       null,
        date:         selectedDate,
        startTime:    arrivalTime,
        type:         'virtual',
        reason,
        urgency,
        approvalMode: hospital.approval_mode ?? 'auto',
      })
    }

    setSubmitting(false)

    if (result) {
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
      const errMsg = (result as any)?.error
      setSubmitError(errMsg ? `Booking failed: ${errMsg}` : 'Booking failed. Please try again.')
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
            <Text style={[s.backArrow, { color: t.textMuted }]}>←</Text>
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
                  icon: '🏥',
                  iconBg: t.accentBg,
                  label: 'Physical Visit',
                  desc:  'Visit the hospital in person. A doctor will be assigned when you arrive at the clinic.',
                },
                {
                  type: 'virtual' as const,
                  icon: '💻',
                  iconBg: 'rgba(55,138,221,0.12)',
                  label: 'Virtual Consultation',
                  desc:  'Video or phone call with a doctor. You can choose a preferred doctor if available.',
                },
              ]).map(opt => (
                <TouchableOpacity key={opt.type}
                  onPress={() => { setBookingType(opt.type); setPreferredDoc(null); setStep(STEP_HOSPITAL) }}
                  style={[s.typeCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <View style={[s.typeIcon, { backgroundColor: opt.iconBg }]}>
                    <Text style={{ fontSize: 26 }}>{opt.icon}</Text>
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
                  ? '💻 Showing hospitals that offer virtual consultations'
                  : '🏥 All hospitals available for in-person visits'}
              </Text>

              <View style={[s.searchRow, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                <Text style={{ fontSize: 14, color: t.textMuted }}>🔍</Text>
                <TextInput
                  value={searchText} onChangeText={setSearchText}
                  placeholder="Search hospitals…"
                  placeholderTextColor={t.textMuted}
                  style={[s.searchInput, { color: t.textPrimary }]}
                />
                {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}>
                    <Text style={{ color: t.textMuted, fontSize: 14 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {loadingHosp ? (
                <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />
              ) : hospitalList.length === 0 ? (
                <View style={[s.emptyBox, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                  <Text style={{ fontSize: 28, marginBottom: 8 }}>🏥</Text>
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
                        {h.verified && <Text style={{ fontSize: 11, color: t.accent }}>✓</Text>}
                      </View>
                      <Text style={[s.hospSpec, { color: t.textMuted }]} numberOfLines={1}>{h.specialty}</Text>
                      <View style={{ flexDirection: 'row', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                        {h.virtual && (
                          <View style={[s.miniTag, { backgroundColor: 'rgba(55,138,221,0.1)', borderColor: 'rgba(55,138,221,0.2)' }]}>
                            <Text style={{ fontSize: 9, color: '#85B7EB' }}>💻 Virtual</Text>
                          </View>
                        )}
                        {h.approval_mode === 'manual' && (
                          <View style={[s.miniTag, { backgroundColor: 'rgba(239,159,39,0.1)', borderColor: 'rgba(239,159,39,0.2)' }]}>
                            <Text style={{ fontSize: 9, color: '#EF9F27' }}>📋 Manual review</Text>
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
                <Text style={{ fontSize: 16 }}>{bookingType === 'virtual' ? '💻' : '🏥'}</Text>
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

              {isManual && (
                <View style={[s.noticeBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                  <Text style={{ fontSize: 12, color: '#EF9F27', lineHeight: 18 }}>
                    📋 <Text style={{ fontWeight: '700' }}>Manual approval:</Text> This hospital reviews each booking. Please describe your symptoms clearly so they can assess your case.
                  </Text>
                </View>
              )}

              <Text style={[s.label, { color: t.textMuted }]}>Reason for visit *</Text>
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
                  ['routine',   '🩺', 'Routine',   'Regular check-up or follow-up'],
                  ['emergency', '🚨', 'Emergency', 'Severe symptoms requiring prompt care (1.5× fee)'],
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
                      <Text style={{ fontSize: 20 }}>{icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.urgLabel, { color: active ? activeColor : t.textPrimary }]}>{label}</Text>
                        <Text style={[s.urgSub,   { color: t.textMuted }]}>{sub}</Text>
                      </View>
                      <View style={[s.radio, {
                        borderColor:     active ? activeColor : t.cardBorder,
                        backgroundColor: active ? activeColor : 'transparent',
                      }]}>
                        {active && <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>✓</Text>}
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
                      🚨 <Text style={{ fontWeight: '800' }}>{hospital?.name} is closed right now.</Text> Emergency
                      bookings can only be for today, so please go back and choose a hospital that's currently open.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#FF5C5C', lineHeight: 18 }}>
                      🚨 Emergency bookings are for <Text style={{ fontWeight: '800' }}>today only</Text> — you won't
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
                        {'💡 '}<Text style={{ fontWeight: '700' }}>Not sure where to go?</Text>{' Book OPD — our front desk will direct you to the right specialist.'}
                      </Text>
                    </View>
                  )}

                  {noEmergencyClinic && (
                    <View style={[s.noticeBox, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.35)', marginBottom: 12 }]}>
                      <Text style={{ fontSize: 12, color: '#FF5C5C', lineHeight: 18 }}>
                        🚨 <Text style={{ fontWeight: '800' }}>{hospital?.name} hasn't set up an Emergency Department.</Text> Please
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
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#FF5C5C' }}>🚨 Emergency</Text>
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
                            {active && <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>✓</Text>}
                          </View>
                        </TouchableOpacity>
                      )
                    })
                  )}

                  {selectedClinic && !selectedClinic.is_opd && !isEmergency && (
                    <>
                      <View style={[s.noticeBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)', marginTop: 4 }]}>
                        <Text style={{ fontSize: 12, color: '#EF9F27', lineHeight: 18 }}>
                          {'📋 '}<Text style={{ fontWeight: '700' }}>Specialist clinic</Text>{' — the hospital will review your booking. A referral note helps them approve faster.'}
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
                      🚨 Emergency bookings are today only — no other dates available.
                    </Text>
                  )}
                  {dateFullMap[selectedDate] && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <Text style={{ fontSize: 12, color: '#EF9F27' }}>⚠️ This date is fully booked. Please pick another day.</Text>
                    </View>
                  )}

                  <Text style={[s.label, { color: t.textMuted, marginTop: 14 }]}>Preferred arrival window</Text>
                  {opdSlots.length === 0 && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <Text style={{ fontSize: 12, color: '#EF9F27' }}>⚠️ No available slots for today. Please choose another date.</Text>
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
                      🏥 A doctor will be assigned by the front desk when you arrive. Your selected window is a preferred arrival time.
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
                      💻 <Text style={{ fontWeight: '700' }}>Virtual queue — how it works:</Text>{'\n'}
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
                          <Text style={{ fontSize: 18 }}>🎲</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.docName, { color: !preferredDoc ? t.accent : t.textPrimary }]}>No preference</Text>
                          <Text style={[s.docSpec, { color: t.textMuted }]}>Hospital assigns the next available doctor</Text>
                        </View>
                        <View style={[s.radio, {
                          borderColor:     !preferredDoc ? t.accent : t.cardBorder,
                          backgroundColor: !preferredDoc ? t.accent : 'transparent',
                        }]}>
                          {!preferredDoc && <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>✓</Text>}
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
                              {active && <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>✓</Text>}
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
                      🚨 Emergency bookings are today only — no other dates available.
                    </Text>
                  )}
                  {dateFullMap[selectedDate] && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <Text style={{ fontSize: 12, color: '#EF9F27' }}>⚠️ This date is fully booked. Please pick another day.</Text>
                    </View>
                  )}

                  {/* Arrival window */}
                  <Text style={[s.label, { color: t.textMuted, marginTop: 14 }]}>Preferred call window</Text>
                  {opdSlots.length === 0 && (
                    <View style={[s.warnBox, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.25)' }]}>
                      <Text style={{ fontSize: 12, color: '#EF9F27' }}>⚠️ No available windows for today. Please choose another date.</Text>
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
                      📞 The doctor will call you during your selected window when it's your turn. Make sure your phone is on.
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
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF9F27', marginBottom: 4 }}>📋 Pending hospital review</Text>
                  <Text style={{ fontSize: 12, color: '#EF9F27', lineHeight: 18 }}>
                    Payment is held until the hospital approves your request. Rejected bookings receive a full refund.
                  </Text>
                </View>
              )}

              {/* Summary */}
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.cardTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Booking summary</Text>
                {[
                  { label: 'Hospital', value: hospital?.name ?? '—' },
                  ...(selectedClinic ? [{ label: 'Clinic', value: selectedClinic.name + (!selectedClinic.is_opd ? ' (pending review)' : '') }] : []),
                  { label: 'Type',     value: bookingType === 'virtual' ? '💻 Virtual consultation' : '🏥 Physical visit' },
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
                  ...(emergencyExtra > 0 ? [{ label: 'Emergency premium (0.5×)', value: `₦${emergencyExtra.toLocaleString()}` }] : []),
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
                  { icon: '✅', text: 'Cancel >24 hrs before appointment → Full refund' },
                  { icon: '⚠️', text: 'Cancel within 24 hrs → 50% refund' },
                  { icon: '🔁', text: 'No-show → 48-hour window to reschedule free' },
                  { icon: '❌', text: 'Booking rejected by hospital → Full refund' },
                ].map((p, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
                    <Text style={{ fontSize: 13 }}>{p.icon}</Text>
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
                    <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.payLabel, { color: active ? t.accent : t.textPrimary }]}>{p.label}</Text>
                      <Text style={[s.paySub,   { color: t.textMuted }]}>{p.sub}</Text>
                    </View>
                    <View style={[s.radio, {
                      borderColor:     active ? t.accent : t.cardBorder,
                      backgroundColor: active ? t.accent : 'transparent',
                    }]}>
                      {active && <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>✓</Text>}
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
              <Text style={[s.backStepText, { color: t.textPrimary }]}>← Back</Text>
            </TouchableOpacity>
          )}

          {/* Type step: no CTA — tapping a card advances */}
          {step !== STEP_TYPE && step < STEP_CONFIRM && (
            <TouchableOpacity onPress={() => setStep(s => s + 1)} disabled={!canAdvance()}
              style={[s.ctaBtn, { backgroundColor: canAdvance() ? t.accent : t.inputBg, flex: 1 }]}>
              <Text style={[s.ctaBtnText, { color: canAdvance() ? '#fff' : t.textMuted }]}>
                Continue →
              </Text>
            </TouchableOpacity>
          )}

          {step === STEP_CONFIRM && (
            <TouchableOpacity onPress={handleConfirm} disabled={submitting}
              style={[s.ctaBtn, { backgroundColor: t.accent, opacity: submitting ? 0.6 : 1, flex: 1 }]}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={[s.ctaBtnText, { color: '#fff' }]}>
                    {isManual ? 'Submit for Review' : 'Confirm & Pay'}
                  </Text>}
            </TouchableOpacity>
          )}
        </View>
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
