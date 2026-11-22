import { useState, useEffect } from 'react'
import { EntityAvatar } from '@queue/shared/components/ui/EntityAvatar'
import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, DetailRow,
  Journey, Notice, Pill, Btn, BottomBar, Mono, NUMS, type PillTone,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { getOrCreateConversation, startConversation } from '@queue/shared/lib/chat'
import { haptics } from '@queue/shared/lib/haptics'
import { QueuePositionPicker } from '@queue/shared/components/QueuePositionPicker'
import { cancelAppointment, getHospitalById, selfCheckIn } from '@queue/shared/lib/api'
import * as ExpoLocation from 'expo-location'
import { payForAppointment } from '@queue/shared/lib/payments'
import { getPaymentForAppointment, shareReceipt, type ReceiptPayment } from '@queue/shared/lib/receipt'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { supabase } from '@queue/shared/lib/supabase'
import { fmtDate, fmt12, arrivalWindow, todayLocalDate } from '@queue/shared/lib/format'
import { addToGoogleCalendar } from '@queue/shared/lib/calendar'

interface Props { navigation: any; route: any }

export function AppointmentDetailScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { user }     = useAuth()
  const rawParam = route?.params?.appointment
  if (!rawParam) {
    // No appointment data passed — go back rather than show fake placeholder data
    navigation?.goBack?.()
    return null
  }
  const raw = rawParam
  const [cancelled,          setCancelled]          = useState(false)
  const [cancelling,         setCancelling]         = useState(false)
  const [checkingIn,         setCheckingIn]         = useState(false)
  const [checkedIn,          setCheckedIn]          = useState(false)
  const [refundPct,          setRefundPct]          = useState(100)
  const [payment,            setPayment]            = useState<ReceiptPayment | null>(null)
  const [savingReceipt,      setSavingReceipt]      = useState(false)
  useEffect(() => { getPaymentForAppointment(raw.id).then(setPayment).catch(() => {}) }, [raw.id])

  async function downloadReceipt() {
    if (!payment) return
    setSavingReceipt(true)
    haptics.tap()
    try {
      await shareReceipt({
        payment, patientName: user?.full_name ?? 'Patient', patientCode: (user as any)?.patient_code,
        doctorName: raw.doctor?.full_name, hospitalName: raw.hospital?.name,
        visitDate: raw.appointment_date, visitTime: raw.start_time, visitType: raw.type,
      })
      haptics.success()
    } catch {
      haptics.error()
      Alert.alert('Receipt', 'Could not create the receipt. Please try again.')
    } finally { setSavingReceipt(false) }
  }
  const [openingChat,        setOpeningChat]        = useState(false)
  const chatDoctorId: string | null = raw.doctor_id ?? raw.doctor?.id ?? null

  async function messageDoctor() {
    const patientId = (raw as any).patient_id ?? user?.id
    if (!chatDoctorId || !patientId) return
    setOpeningChat(true)
    haptics.tap()
    const r = await getOrCreateConversation({ patientId, doctorId: chatDoctorId, appointmentId: raw.id })
    setOpeningChat(false)
    if (r.ok) navigation.navigate('Chat', { conversationId: r.data.id, role: 'patient' })
    else {
      haptics.error()
      Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error)
    }
  }

  const chatHospitalId: string | null = raw.hospital_id ?? (raw.hospital?.id ? String(raw.hospital.id) : null)
  async function messageHospital() {
    if (!chatHospitalId) return
    setOpeningChat(true)
    haptics.tap()
    const r = await startConversation('hospital', chatHospitalId, raw.id)
    setOpeningChat(false)
    if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
    else {
      haptics.error()
      Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error)
    }
  }
  const [rescheduleLoading,  setRescheduleLoading]  = useState(false)
  const [queuePosition,      setQueuePosition]      = useState<number | null>(raw.queue_position ?? null)
  const [showQueuePicker,    setShowQueuePicker]    = useState(false)

  const approvalStatus  = (raw as any).approval_status ?? 'auto_approved'
  const bookingMode     = (raw as any).booking_mode ?? 'doctor'
  const isPendingReview = approvalStatus === 'pending_approval'
  const isRejected      = approvalStatus === 'rejected'

  // Null-safe normalisation — doctor may be null for physical/hospital-mode bookings
  const doctorObj    = raw.doctor ?? null
  const doctorName   = doctorObj?.full_name ?? null
  const doctorAvatar = doctorName
    ? doctorName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : null
  const doctorSpec   = (doctorObj as any)?.specialty?.name ?? (raw.spec ?? null)
  const doctorRating = doctorObj?.avg_rating ?? (raw.rating ?? 0)

  const clinicObj  = (raw as any).clinic ?? null
  const clinicName = clinicObj?.name ?? null
  const isOpdClinic = clinicObj?.is_opd ?? true

  const appt = {
    id:             (raw as any).booking_ref ?? raw.id,
    patientName:    (raw as any).patient?.full_name ?? null,
    doctor:         doctorName,
    doctorAvatar,
    spec:           doctorSpec,
    hospital:       raw.hospital?.name ?? raw.hospital ?? 'Hospital',
    clinic:         clinicName,
    date:           raw.appointment_date ?? raw.date,
    time:           raw.start_time ?? raw.time,
    // The close of the arrival window, where the booked slot had one.
    endTime:        (raw as any).end_time ?? null,
    status:         raw.status,
    type:           raw.type,
    payment:        (() => {
      // MM2: raw.payment field doesn't exist — derive from hospital/doctor fee
      const fee = raw.type === 'virtual'
        ? (raw.doctor?.virtual_fee ?? raw.doctor?.consultation_fee ?? null)
        : (raw.hospital?.opd_fee ?? null)
      return fee != null ? `₦${Number(fee).toLocaleString()}` : '—'
    })(),
    rating:         doctorRating,
    queue_position: raw.queue_position,
    estimated_wait: raw.estimated_wait,
    urgency:             (raw as any).urgency ?? 'routine',
    paymentMethod:       (raw as any).payment_method ?? null,
    rescheduleCount:     (raw as any).reschedule_count ?? 0,
  }

  // Vitals live in vitals_audit_log, not on appointments (the denormalised
  // appointments.vitals_* columns this used to read were dropped in migration
  // 20260719000004 -- this section showed nothing for any patient until now).
  const [liveVitals, setLiveVitals] = useState<{
    weight_kg: number | null; height_cm: number | null
    bp_systolic: number | null; bp_diastolic: number | null
    blood_sugar: number | null; bmi: number | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vitals_audit_log')
      .select('weight_kg, height_cm, bp_systolic, bp_diastolic, blood_sugar, bmi')
      .eq('appointment_id', raw.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setLiveVitals(data as any) })
    return () => { cancelled = true }
  }, [raw.id])

  const hasVitals = !!liveVitals && (liveVitals.weight_kg != null || liveVitals.height_cm != null
    || liveVitals.bp_systolic != null || liveVitals.blood_sugar != null)
  const isEmergency = appt.urgency === 'emergency'

  const isVirtual   = appt.type === 'virtual'
  const isInPerson  = !isVirtual
  const isUpcoming  = ['confirmed', 'pending', 'checked_in', 'in_progress'].includes(appt.status)
  const isConfirmed = ['confirmed', 'checked_in'].includes(appt.status)
  // Separate from isConfirmed (which also gates the in-person queue banner
  // below, a different concern): a virtual call already 'in_progress' --
  // started by the doctor, or left stuck after a disconnect -- has no other
  // way back in without this, since isConfirmed alone would hide the Join
  // banner the instant the doctor starts the call.
  const canJoinVirtual = isVirtual && ['confirmed', 'checked_in', 'in_progress'].includes(appt.status)
  const isMissed    = appt.status === 'no_show'
  const canReschedule = (isUpcoming || isMissed) && appt.rescheduleCount < 1
  const showPass    = isUpcoming && !cancelled && !isPendingReview && !isRejected

  const statusColor = {
    confirmed:   { bg: t.accentBg,  text: t.accent,    border: t.accentBorder },
    pending:     { bg: '#FEF8E7',   text: '#633806',   border: 'rgba(196,127,0,0.3)' },
    completed:   { bg: t.inputBg,   text: t.textMuted, border: t.cardBorder },
    cancelled:   { bg: '#FCEBEB',   text: '#791F1F',   border: 'rgba(163,45,45,0.3)' },
    checked_in:  { bg: '#E8F4FE',   text: '#1A5A8C',   border: 'rgba(26,90,140,0.3)' },
    in_progress: { bg: '#FEF0E6',   text: '#7A3A00',   border: 'rgba(122,58,0,0.3)' },
    no_show:     { bg: '#FCEBEB',   text: '#791F1F',   border: 'rgba(163,45,45,0.3)' },
  }[cancelled ? 'cancelled' : appt.status as string] ?? { bg: t.accentBg, text: t.accent, border: t.accentBorder }

  const displayStatus = isPendingReview ? 'Pending Review'
    : isRejected ? 'Rejected'
    : cancelled ? 'Cancelled'
    : isMissed ? 'Missed'
    : appt.status.charAt(0).toUpperCase() + appt.status.slice(1)

  // The pill's tone in the handoff's vocabulary. The old screen carried a
  // hand-mixed colour per status; these are the same five tones every other
  // screen uses, so one status cannot read two ways in two places.
  const statusTone: PillTone = isPendingReview ? 'amber'
    : isRejected ? 'red'
    : cancelled || appt.status === 'cancelled' ? 'neutral'
    : isMissed ? 'red'
    : appt.status === 'completed' ? 'neutral'
    : appt.status === 'checked_in' || appt.status === 'in_progress' ? 'teal'
    : 'green'

  const displayStatusColor = isPendingReview
    ? { bg: 'rgba(239,159,39,0.12)', text: t.statusBusy.text, border: 'rgba(239,159,39,0.3)' }
    : isRejected
    ? { bg: '#FCEBEB', text: '#791F1F', border: 'rgba(163,45,45,0.3)' }
    : statusColor

  // Paid-ness lives in its own table, so an appointment row cannot answer it.
  // undefined means "not known yet" and must never render as unpaid.
  const [isPaid, setIsPaid] = useState<boolean | undefined>(undefined)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    let cancelledQuery = false
    supabase.from('payments').select('id').eq('appointment_id', raw.id).eq('status', 'success')
      .limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelledQuery) setIsPaid(!!data) })
    return () => { cancelledQuery = true }
  }, [raw.id])

  async function payNow() {
    setPaying(true)
    const outcome = await payForAppointment(raw.id)
    setPaying(false)
    if (outcome.status === 'success') {
      setIsPaid(true)
      Alert.alert('Paid', 'Your booking is paid and your arrival window is held.')
    } else if (outcome.status === 'disabled') {
      Alert.alert('Pay at the desk', outcome.reason ?? 'Online payment is not available for this booking.')
    } else if (outcome.status === 'error') {
      Alert.alert('Payment failed', outcome.message ?? 'Please try again in a moment.')
    }
  }


  /**
   * "I have arrived." Only offered where the hospital has turned self
   * check-in on; the server re-checks that, that this is today's booking, and
   * that the phone is actually at the hospital before issuing a number.
   */
  const handleSelfCheckIn = async () => {
    setCheckingIn(true)
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        haptics.error()
        Alert.alert('Location needed',
          'We check you are at the hospital before giving you a number. Allow location, or check in at the front desk.')
        return
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
      const res = await selfCheckIn(raw.id, { lat: pos.coords.latitude, lng: pos.coords.longitude })
      if (!res.ok) {
        haptics.error()
        Alert.alert('Not checked in', res.error)
        return
      }
      haptics.success()
      setCheckedIn(true)
      if (res.queuePosition != null) setQueuePosition(res.queuePosition)
      Alert.alert(
        res.queuePosition != null ? `You are number ${res.queuePosition}` : 'You are checked in',
        res.estimatedWait != null
          ? `About ${res.estimatedWait} minutes. Your number is on this screen.`
          : 'Your number will appear here in a moment.',
      )
    } catch {
      haptics.error()
      Alert.alert('Not checked in', 'We could not get your location. Please check in at the front desk.')
    } finally {
      setCheckingIn(false)
    }
  }

  const handleCancel = async () => {
    // Show what is refundable *before* the patient confirms (v3.1: "cancel shows refund
    // first"). Same policy as cancelAppointment(): >24 h before = 100 %, otherwise 50 %.
    const { data: paid } = await supabase.from('payments').select('amount')
      .eq('appointment_id', raw.id).eq('status', 'success').maybeSingle()
    const hoursUntil = (new Date(`${raw.appointment_date}T${raw.start_time}`).getTime() - Date.now()) / 3.6e6
    const pct = hoursUntil > 24 ? 100 : 50
    const amount = Number((paid as any)?.amount ?? 0)
    const message = amount > 0
      ? `You paid ₦${amount.toLocaleString()}. Under the cancellation policy ₦${Math.round(amount * pct / 100).toLocaleString()} (${pct}%) is refundable` +
        `${pct < 100 ? ' because the visit is less than 24 hours away' : ''}. Contact Queue Support from Profile to receive it.\n\nCancelling frees your slot for another patient.`
      : 'Nothing has been charged for this booking, so there is nothing to refund.\n\nCancelling frees your slot for another patient.'
    Alert.alert(
      'Cancel appointment?',
      message,
      [
        { text: 'Keep appointment', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true)
            const datetime = `${raw.appointment_date}T${raw.start_time}`
            const result = await cancelAppointment(raw.id, 'Patient requested cancellation', datetime)
            setCancelling(false)
            if (result.success) {
              setRefundPct(result.refundPct)
              setCancelled(true)
              haptics.success()
            } else {
              Alert.alert('Cancel failed', result.error ?? 'Could not cancel appointment. Please try again.')
            }
          },
        },
      ]
    )
  }

  const handleReschedule = async () => {
    if (!raw.hospital) return
    setRescheduleLoading(true)
    // MH6: fetch full hospital object (raw.hospital may be partial)
    const hospitalId = String(raw.hospital?.id ?? raw.hospital)
    const fullHospital = await getHospitalById(hospitalId)
    setRescheduleLoading(false)
    const displayH = fullHospital ? toDisplayHospital(fullHospital) : toDisplayHospital(raw.hospital)
    navigation.navigate('BookingFlow', {
      hospital:    displayH,
      bookingType: raw.type === 'virtual' ? 'virtual' : 'physical',
      reschedule: {
        originalId: raw.id,
        doctorId:   raw.doctor_id ?? raw.doctor?.id ?? null,
        clinicId:   (raw as any).clinic_id ?? null,
        reason:     raw.reason ?? '',
      },
    })
  }

  // Where this visit stands on the rail every screen shares. A rejected or
  // cancelled booking has no place on it -- those get their own treatment
  // below rather than a dot that pretends the journey continues.
  const journeyIndex =
    appt.status === 'completed' ? 5
    : appt.status === 'in_progress' ? 4
    : appt.status === 'checked_in' ? (queuePosition != null ? 3 : 2)
    : isPaid === false ? 1
    : isPaid === true ? 2
    : 1
  const journeyBlock = isPaid === false ? 1 : undefined

  return (
    <Screen>
      <AppBar
        title="Appointment"
        sub={appt.id}
        onBack={() => navigation.goBack()}
        right={<View style={{ paddingRight: 10, justifyContent: 'center' }}>
          <Pill label={displayStatus} tone={statusTone} />
        </View>}
      />

      <Body>
        {/* ── Rejected ───────────────────────────────────────────────
            The handoff gives this its own screen. It is the same visit, so it
            stays here -- but it replaces the rail rather than sitting under
            it, because there is no journey left to show. */}
        {isRejected ? (
          <>
            <Card pad style={{ backgroundColor: t.q.redBg, borderColor: 'transparent' }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="close-circle" size={20} color={t.q.red} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.q.red }}>Booking rejected</Text>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink70 }}>
                    Nothing was charged for this booking.
                  </Text>
                </View>
              </View>
            </Card>

            {!!(raw as any).approval_note && (
              <>
                <SectionHead title="The hospital's note" />
                <Card pad>
                  <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink }}>
                    {(raw as any).approval_note}
                  </Text>
                </Card>
              </>
            )}

            <SectionHead title="What you can do" />
            <Card>
              {raw.hospital && (
                <>
                  <Row
                    icon="business-outline"
                    title="Book a general outpatient visit"
                    sub="No referral needed — the doctor refers you on if you need a specialist"
                    chevron
                    onPress={() => navigation.navigate('BookingFlow', {
                      hospital: toDisplayHospital(raw.hospital),
                      bookingType: 'physical',
                    })}
                  />
                  <Hair />
                </>
              )}
              {chatHospitalId && (
                <>
                  <Row
                    icon="chatbubble-outline"
                    title="Message the hospital"
                    sub="Front desk: directions, payments, paperwork"
                    chevron
                    onPress={messageHospital}
                  />
                  <Hair />
                </>
              )}
              <Row
                icon="document-text-outline"
                title="Try again with a referral letter"
                sub="A specialist clinic usually needs one"
                chevron
                onPress={() => raw.hospital && navigation.navigate('BookingFlow', {
                  hospital: toDisplayHospital(raw.hospital),
                  bookingType: 'physical',
                })}
              />
            </Card>
          </>
        ) : cancelled || appt.status === 'cancelled' ? (
          <Notice tone="neutral" icon="close-circle-outline">
            This appointment was cancelled. Nothing was charged for it, so there is nothing to refund.
          </Notice>
        ) : (
          <Journey
            steps={['Booked', 'Paid', 'Checked in', 'In the queue', 'Called', 'Seen']}
            activeIndex={journeyIndex}
            blockingIndex={journeyBlock}
          />
        )}

        {isPendingReview && !isRejected && (
          <Notice tone="amber" icon="hourglass-outline">
            {isOpdClinic
              ? 'The hospital is reviewing this booking. Your queue pass appears here once it is approved.'
              : 'A desk officer is checking your referral or reason for this specialist clinic. You will be told either way.'}
          </Notice>
        )}

        {isPaid === false && !isPendingReview && !isRejected && isUpcoming && (
          <Notice tone="red" icon="alert-circle-outline">
            Not paid yet. Unpaid bookings are released, so pay to keep your arrival window.
          </Notice>
        )}

        {isEmergency && !cancelled && (
          <Notice tone="red">
            Emergency booking. {appt.status === 'checked_in' || appt.status === 'in_progress'
              ? 'You are at the front of today’s queue.'
              : 'You go to the front of the queue once you are checked in.'}
          </Notice>
        )}

        {canJoinVirtual && !cancelled && (
          <Card style={{ marginTop: 8 }}>
            <Row
              icon="videocam-outline"
              tint
              title="Your video room is ready"
              sub="Tap to join the consultation"
              right={<Btn label="Join" small onPress={() => navigation.navigate('VideoCall', {
                appointmentId: raw.id,
                doctorName: appt.doctor ?? 'your doctor',
              })} />}
            />
          </Card>
        )}

        {/* "I have arrived." Shown only where the hospital has opted into self
            check-in, on the day, and before they are in the queue -- so the
            button is never offered when the server would refuse it. */}
        {isInPerson && isConfirmed && !cancelled && !checkedIn
          && raw.status !== 'checked_in' && raw.status !== 'in_progress'
          && raw.appointment_date === todayLocalDate()
          && (raw.hospital as { allow_self_check_in?: boolean | null } | null)?.allow_self_check_in && (
          <>
            <SectionHead title="At the hospital?" />
            <Card>
              <View style={{ padding: 14, gap: 10 }}>
                <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink70 }}>
                  Check in from here once you have arrived and we will give you your number. We confirm
                  you are at {appt.hospital} first.
                </Text>
                <Btn label="I have arrived" icon="hand-left-outline"
                  loading={checkingIn} onPress={handleSelfCheckIn} />
              </View>
            </Card>
          </>
        )}

        {/* Live queue figures, once there are any. Tapping opens the full
            live-queue screen rather than burying the queue inside this one. */}
        {isInPerson && isConfirmed && !cancelled && (
          <>
            <SectionHead title="In the queue" />
            <Card>
              <Row
                leading={
                  <View style={{ flexDirection: 'row', gap: 18 }}>
                    <View>
                      <Text style={{ fontSize: 11, color: t.q.ink60 }}>Your number</Text>
                      <Text style={[{ fontSize: 26, fontWeight: '800', color: t.q.ink }, NUMS]}>
                        {queuePosition ?? '—'}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 11, color: t.q.ink60 }}>Est. wait</Text>
                      <Text style={[{ fontSize: 26, fontWeight: '800', color: t.q.primary }, NUMS]}>
                        {appt.estimated_wait ? `${appt.estimated_wait}m` : '—'}
                      </Text>
                    </View>
                  </View>
                }
                title=""
                tint
                chevron
                onPress={() => navigation.navigate('LiveQueue', { appointmentId: raw.id })}
              />
              {raw.status === 'checked_in' && (
                <>
                  <Hair />
                  <Row
                    icon="swap-vertical-outline"
                    title="Running late?"
                    sub="Move yourself further down today’s queue"
                    chevron
                    onPress={() => setShowQueuePicker(true)}
                  />
                </>
              )}
            </Card>
          </>
        )}

        <SectionHead title="Visit" />
        <Card>
          <DetailRow label="Hospital" value={appt.hospital} />
          {!!appt.clinic && <DetailRow label="Clinic" value={appt.clinic + (isOpdClinic ? ' (general)' : '')} />}
          {/* A window where the slot gave one ("09:00 - 09:30"), a single time
              where it did not. Arriving at the top of a half-hour window is
              what spreads a waiting room out. */}
          <DetailRow
            label="Arrive"
            value={(appt as any).endTime
              ? `${fmtDate(appt.date)} · ${arrivalWindow({ start_time: appt.time, end_time: (appt as any).endTime })}`
              : `${fmtDate(appt.date)} · ${fmt12(appt.time)}`} />
          <DetailRow label="Type" value={isVirtual ? 'Video consultation' : 'In person'} />
          {!!appt.spec && <DetailRow label="Specialty" value={appt.spec} />}
          <DetailRow label="Reference" value={appt.id} mono last />
        </Card>

        {appt.doctor ? (
          <>
            <SectionHead title="Your doctor" />
            <Card>
              <Row
                leading={<EntityAvatar size={44} kind="doctor" label={appt.doctor ?? undefined} />}
                title={appt.doctor}
                sub={[appt.spec, doctorObj?.years_experience ? `${doctorObj.years_experience} years` : null]
                  .filter(Boolean).join(' · ') || 'Your doctor'}
                right={chatDoctorId && !cancelled && raw.status !== 'cancelled'
                  ? <Btn label={openingChat ? 'Opening…' : 'Message'} variant="secondary" small onPress={messageDoctor} />
                  : undefined}
              />
            </Card>
          </>
        ) : isInPerson ? (
          <>
            <SectionHead title="Your doctor" />
            <Card>
              <Row
                icon="business-outline"
                iconTone="neutral"
                title="Assigned when you arrive"
                sub="The front desk allocates you to an available doctor"
              />
            </Card>
          </>
        ) : null}

        {hasVitals && liveVitals && (
          <>
            <SectionHead title="Vitals from this visit" />
            <Card>
              {liveVitals.weight_kg != null && <DetailRow label="Weight" value={`${liveVitals.weight_kg} kg`} mono />}
              {liveVitals.height_cm != null && <DetailRow label="Height" value={`${liveVitals.height_cm} cm`} mono />}
              {liveVitals.bmi != null && <DetailRow label="BMI" value={String(liveVitals.bmi)} mono />}
              {liveVitals.bp_systolic != null && liveVitals.bp_diastolic != null && (
                <DetailRow label="Blood pressure" value={`${liveVitals.bp_systolic}/${liveVitals.bp_diastolic}`} mono />
              )}
              {liveVitals.blood_sugar != null && <DetailRow label="Blood sugar" value={`${liveVitals.blood_sugar} mg/dL`} mono last />}
            </Card>
          </>
        )}

        {appt.status === 'completed' && ((raw as any).diagnosis || (raw as any).investigations || (raw as any).prescription || (raw as any).treatment_plan) && (
          <>
            <SectionHead title="What the doctor recorded" />
            <Card pad>
              {([
                ['Diagnosis', (raw as any).diagnosis],
                ['Investigations', (raw as any).investigations],
                ['Prescription', (raw as any).prescription],
                ['Plan', (raw as any).treatment_plan],
              ] as const).filter(([, v]) => !!v).map(([label, value]) => (
                <View key={label} style={{ paddingVertical: 8 }}>
                  <CardLabel>{label}</CardLabel>
                  <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink, marginTop: 4 }}>{value}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {isUpcoming && !cancelled && (
          <>
            <SectionHead title="How to prepare" />
            <Card pad>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink70 }}>
                {isVirtual
                  ? 'Find a quiet, well-lit place with a steady connection. Headphones help. Have your recent results to hand.'
                  : 'Arrive ten minutes early with a valid ID, your HMO card if you have one, any recent results or referral letter, and a list of the medicines you take now.'}
              </Text>
            </Card>
          </>
        )}

        <SectionHead title="Payment" />
        <Card>
          <DetailRow label="Fee" value={appt.payment} mono />
          {!!appt.paymentMethod && <DetailRow label="Method" value={appt.paymentMethod} />}
          <DetailRow label="Status" value={isPaid === true ? 'Paid' : isPaid === false ? 'Not paid yet' : 'Checking…'} last />
        </Card>

        <View style={{ height: 12 }} />

        <Card>
          {chatHospitalId && !cancelled && (
            <>
              <Row
                icon="business-outline"
                title={openingChat ? 'Opening chat…' : 'Message the hospital'}
                sub="Front desk: directions, payments, paperwork"
                chevron
                onPress={messageHospital}
              />
              <Hair />
            </>
          )}
          {!cancelled && !['cancelled', 'completed', 'no_show'].includes(raw.status) && !!raw.appointment_date && (
            <>
              <Row
                icon="calendar-outline"
                title="Add to Google Calendar"
                sub="Get a reminder on your phone"
                chevron
                onPress={() => { haptics.tap(); addToGoogleCalendar({
                  title: `${raw.type === 'virtual' ? 'Video visit' : 'Hospital visit'}${raw.doctor?.full_name ? ` with ${raw.doctor.full_name}` : ''}`,
                  date: raw.appointment_date,
                  time: raw.start_time,
                  location: raw.type === 'virtual' ? 'Queue app (video)' : (raw.hospital?.name ?? undefined),
                  details: `Booking ${(raw as any).booking_ref ?? ''} · Queue`,
                }).catch(() => {}) }}
              />
              <Hair />
            </>
          )}
          {payment && (
            <>
              <Row
                icon="receipt-outline"
                title={savingReceipt ? 'Preparing receipt…' : 'Download receipt'}
                sub={`PDF · ₦${Number(payment.amount).toLocaleString('en-NG')} paid`}
                chevron
                onPress={downloadReceipt}
              />
              <Hair />
            </>
          )}
          {appt.status === 'completed' && appt.doctor && (
            <Row
              icon="star-outline"
              title={`Rate ${appt.doctor}`}
              sub="Help other patients choose"
              chevron
              onPress={() => {
                Alert.alert(
                  `Rate ${appt.doctor}`,
                  'How would you rate this consultation?',
                  [1, 2, 3, 4, 5].map(stars => ({
                    text: `${stars} star${stars === 1 ? '' : 's'}`,
                    onPress: async () => {
                      if (!user || !doctorObj?.id) return
                      const { error } = await supabase.from('reviews').insert({
                        appointment_id: raw.id,
                        patient_id: user.id,
                        doctor_id: doctorObj.id,
                        rating: stars,
                        body: '',
                      })
                      if (error) {
                        Alert.alert('Could not submit rating',
                          error.code === '23505' ? 'You have already rated this consultation.' : 'Please try again in a moment.')
                        return
                      }
                      Alert.alert('Thank you', 'Your rating has been submitted.')
                    },
                  })),
                )
              }}
            />
          )}
        </Card>

        {isMissed && (
          <Notice tone="red">
            {canReschedule
              ? 'This appointment was marked as missed. You can reschedule it once, free.'
              : 'This appointment was marked as missed, and the free reschedule is used. Book a new appointment to continue.'}
          </Notice>
        )}
      </Body>

      {/* ── The bar. One primary action, chosen by what the visit needs
          next: pay it, reschedule it, or nothing at all. ───────────── */}
      {isRejected ? (
        raw.hospital ? (
          <BottomBar>
            <Btn grow label="Book OPD appointment" onPress={() => navigation.navigate('BookingFlow', {
              hospital: toDisplayHospital(raw.hospital),
              bookingType: 'physical',
            })} />
          </BottomBar>
        ) : null
      ) : isPendingReview && !cancelled ? (
        <BottomBar>
          <Btn grow variant="danger" label="Withdraw request" loading={cancelling}
            onPress={() => { haptics.tap(); handleCancel() }} />
        </BottomBar>
      ) : isMissed ? (
        <BottomBar>
          {canReschedule ? (
            <Btn grow label="Reschedule" icon="calendar-outline" loading={rescheduleLoading}
              onPress={() => { haptics.tap(); handleReschedule() }} />
          ) : raw.hospital ? (
            <Btn grow label="Book a new appointment" onPress={() => { haptics.tap(); navigation.navigate('BookingFlow', {
              hospital: toDisplayHospital(raw.hospital),
              bookingType: raw.type === 'virtual' ? 'virtual' : 'physical',
            }) }} />
          ) : null}
        </BottomBar>
      ) : isUpcoming && !cancelled ? (
        <BottomBar meta={
          <>
            <Mono size={12} color={t.q.ink60}>{appt.payment}</Mono>
            <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
            <Mono size={12}>{isPaid === true ? 'paid' : isPaid === false ? 'due' : 'checking'}</Mono>
          </>
        }>
          <Btn label="Cancel" variant="secondary" loading={cancelling}
            onPress={() => { haptics.tap(); handleCancel() }} />
          {isPaid === false ? (
            <Btn grow label="Pay now" loading={paying} onPress={payNow} />
          ) : canReschedule ? (
            <Btn grow label="Reschedule" icon="calendar-outline" loading={rescheduleLoading}
              onPress={() => { haptics.tap(); handleReschedule() }} />
          ) : (
            <Btn grow label="Queue pass" icon="qr-code-outline"
              onPress={() => navigation.navigate('QueuePass', { appointmentId: raw.id })} />
          )}
        </BottomBar>
      ) : null}

      {showQueuePicker && (
        <QueuePositionPicker
          appointmentId={raw.id}
          onClose={() => setShowQueuePicker(false)}
          onMoved={(newPosition) => { setQueuePosition(newPosition); setShowQueuePicker(false) }}
        />
      )}
    </Screen>
  )
}
