import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Clipboard, ActivityIndicator } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { Avatar } from '@queue/shared/components/ui/Avatar'
import { Stars } from '@queue/shared/components/ui/Stars'
import { QueuePositionPicker } from '@queue/shared/components/QueuePositionPicker'
import { cancelAppointment, getHospitalById } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { supabase } from '@queue/shared/lib/supabase'
import { fmtDate, fmt12 } from '@queue/shared/lib/format'

interface Props { navigation: any; route: any }

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <View style={[st.infoRow, { borderBottomColor: t.cardBorder }]}>
      <Text style={[st.infoLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[st.infoValue, { color: accent ? t.accent : t.textPrimary }]}>{value}</Text>
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>{title}</Text>
      {children}
    </View>
  )
}

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
  const [copied,             setCopied]             = useState(false)
  const [refundPct,          setRefundPct]          = useState(100)
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

  const displayStatusColor = isPendingReview
    ? { bg: 'rgba(239,159,39,0.12)', text: t.statusBusy.text, border: 'rgba(239,159,39,0.3)' }
    : isRejected
    ? { bg: '#FCEBEB', text: '#791F1F', border: 'rgba(163,45,45,0.3)' }
    : statusColor

  function copyRef() {
    Clipboard.setString(appt.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCancel = () => {
    Alert.alert(
      'Cancel appointment?',
      'Nothing has been charged for this booking — payment is made at the hospital, so there is nothing to refund.\n\nCancelling frees your slot for another patient.',
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

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={t.textMuted} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: t.textPrimary }]}>Appointment</Text>
        <View style={[st.statusBadge, { backgroundColor: displayStatusColor.bg, borderColor: displayStatusColor.border }]}>
          <Text style={[st.statusText, { color: displayStatusColor.text }]}>{displayStatus}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>

        {/* ─── Hospital Check-in Pass ─── */}
        {showPass && (
          <View style={[st.passCard, {
            backgroundColor: t.bannerBg,
            borderColor: isVirtual ? 'rgba(91,158,255,0.35)' : t.accentBorder,
          }]}>
            <View style={[st.passHeader, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Ionicons name={isVirtual ? 'videocam-outline' : 'business-outline'} size={13} color={isVirtual ? t.statusVirtual.text : t.accent} />
              <Text style={[st.passTitle, { color: isVirtual ? t.statusVirtual.text : t.accent }]}>
                {isVirtual ? 'VIRTUAL CONSULTATION PASS' : 'HOSPITAL CHECK-IN PASS'}
              </Text>
            </View>

            {/* Big booking ref */}
            <TouchableOpacity onPress={copyRef} style={st.passRefWrap} activeOpacity={0.7}>
              <Text style={[st.passRef, { color: isVirtual ? t.statusVirtual.text : t.accent }]}>{appt.id}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {copied && <Ionicons name="checkmark" size={10} color={t.accent} />}
                <Text style={[st.passCopy, { color: copied ? t.accent : 'rgba(255,255,255,0.35)' }]}>
                  {copied ? 'Copied' : 'Tap to copy'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[st.passDivider, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />

            {/* Pass info */}
            {[
              { label: 'Patient',  value: appt.patientName ?? 'You' },
              { label: 'Hospital', value: appt.hospital },
              { label: 'Date',     value: `${fmtDate(appt.date)}  ·  ${fmt12(appt.time)}` },
              appt.doctor ? { label: 'Doctor', value: appt.doctor } : null,
            ].filter(Boolean).map(row => row && (
              <View key={row.label} style={st.passRow}>
                <Text style={st.passRowLabel}>{row.label}</Text>
                <Text style={st.passRowValue} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}

            <View style={[st.passDivider, { backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 10 }]} />

            <View style={st.passFooter}>
              <Ionicons name={isVirtual ? 'videocam-outline' : 'location-outline'} size={14} color="rgba(255,255,255,0.55)" />
              <Text style={[st.passFooterText, { color: 'rgba(255,255,255,0.55)' }]}>
                {isVirtual
                  ? 'Share this ID if asked by your doctor during the session'
                  : 'Show this ID at the hospital reception desk for check-in'}
              </Text>
            </View>
          </View>
        )}

        {/* Pending review notice */}
        {isPendingReview && (
          <View style={[st.pendingCard, { borderColor: 'rgba(239,159,39,0.3)', backgroundColor: 'rgba(239,159,39,0.07)' }]}>
            <Ionicons name="hourglass-outline" size={18} color={t.statusBusy.text} />
            <View style={{ flex: 1 }}>
              <Text style={[st.pendingTitle, { color: t.statusBusy.text }]}>Awaiting hospital approval</Text>
              {appt.clinic && !isOpdClinic && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: t.statusBusy.text, fontWeight: '700' }}>Clinic:</Text>
                  <Text style={{ fontSize: 11, color: 'rgba(239,159,39,0.85)' }}>{appt.clinic}</Text>
                </View>
              )}
              <Text style={[st.pendingSub, { color: 'rgba(239,159,39,0.65)' }]}>
                {isOpdClinic
                  ? 'The hospital is reviewing your booking. Your check-in pass will appear here once approved.'
                  : 'A desk officer will verify your referral or reason and approve or decline your specialist booking. You\'ll be notified of the outcome.'}
              </Text>
            </View>
          </View>
        )}

        {/* Rejection card */}
        {isRejected && (
          <View style={[st.pendingCard, { borderColor: 'rgba(163,45,45,0.4)', backgroundColor: 'rgba(239,68,68,0.06)' }]}>
            <Ionicons name="close-circle" size={20} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={[st.pendingTitle, { color: '#DC2626', marginBottom: 6 }]}>Booking Rejected</Text>
              {(raw as any).approval_note ? (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(220,38,38,0.6)', marginBottom: 3 }}>
                    Hospital's note:
                  </Text>
                  <Text style={{ fontSize: 12, color: '#DC2626', lineHeight: 18 }}>
                    {(raw as any).approval_note}
                  </Text>
                </View>
              ) : null}
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(220,38,38,0.6)', marginBottom: 6 }}>
                What you can do:
              </Text>
              {[
                { icon: 'business-outline' as const,      text: 'Book OPD — the desk officer will refer you to the right specialist' },
                { icon: 'document-text-outline' as const, text: 'Resubmit with a referral letter or additional medical details' },
                { icon: 'call-outline' as const,          text: 'Contact the hospital directly for more information' },
              ].map(tip => (
                <View key={tip.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <Ionicons name={tip.icon} size={12} color="#DC2626" style={{ marginTop: 3 }} />
                  <Text style={{ fontSize: 11, color: '#DC2626', lineHeight: 18, flex: 1 }}>{tip.text}</Text>
                </View>
              ))}
              {raw.hospital && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('BookingFlow', {
                    hospital:    toDisplayHospital(raw.hospital),
                    bookingType: 'physical',
                  })}
                  style={[st.opdBtn, { borderColor: 'rgba(163,45,45,0.4)', backgroundColor: 'rgba(239,68,68,0.1)', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>Book OPD Appointment</Text>
                  <Ionicons name="arrow-forward" size={14} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Hero card */}
        <View style={[st.heroCard, { backgroundColor: t.bannerBg, borderColor: t.bannerBorder }]}>
          {/* Booking ID */}
          <View style={st.bookingIdRow}>
            <Text style={[st.bookingIdLabel, { color: t.accent }]}>BOOKING ID</Text>
            <Text style={[st.bookingId, { color: t.accent }]}>{appt.id}</Text>
          </View>

          {/* Doctor / placeholder */}
          <View style={st.doctorRow}>
            {appt.doctor ? (
              <Avatar initials={appt.doctorAvatar ?? 'DR'} bg="#1A3A28" size={52} />
            ) : (
              <View style={[st.doctorAvatarPlaceholder, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' }]}>
                <Ionicons name={isVirtual ? 'videocam-outline' : 'walk-outline'} size={22} color="rgba(255,255,255,0.5)" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={st.doctorName}>
                {appt.doctor ?? (isVirtual ? 'Doctor to be assigned' : 'Assigned at clinic')}
              </Text>
              <Text style={[st.doctorSpec, { color: 'rgba(255,255,255,0.55)' }]}>
                {appt.spec ?? (isVirtual ? 'Virtual consultation' : 'In-person visit')}
              </Text>
              {appt.doctor && appt.rating > 0 && <Stars rating={appt.rating} />}
            </View>
            {isVirtual ? (
              <View style={[st.typePill, { backgroundColor: 'rgba(91,158,255,0.15)', borderColor: 'rgba(91,158,255,0.3)' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="videocam-outline" size={11} color={t.statusVirtual.text} />
                  <Text style={[st.typePillText, { color: t.statusVirtual.text }]}>Virtual</Text>
                </View>
              </View>
            ) : (
              <View style={[st.typePill, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="walk-outline" size={11} color={t.accent} />
                  <Text style={[st.typePillText, { color: t.accent }]}>In-person</Text>
                </View>
              </View>
            )}
          </View>

          {/* Date / time chips */}
          <View style={st.chipsRow}>
            {([
              { icon: 'calendar-outline' as const, val: fmtDate(appt.date) },
              { icon: 'time-outline' as const,     val: fmt12(appt.time) },
              { icon: 'location-outline' as const, val: appt.hospital },
            ] as const).map(c => (
              <View key={c.val} style={[st.chip, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' }]}>
                <Ionicons name={c.icon} size={12} color="rgba(255,255,255,0.5)" style={{ marginRight: 3 }} />
                <Text style={st.chipText} numberOfLines={1}>{c.val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Emergency banner */}
        {isEmergency && !cancelled && (
          <View style={[st.joinBanner, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.4)' }]}>
            <Ionicons name="alert-circle-outline" size={22} color={t.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[st.joinTitle, { color: t.danger }]}>Emergency booking</Text>
              <Text style={[st.joinSub, { color: 'rgba(255,92,92,0.7)' }]}>
                {appt.status === 'checked_in' || appt.status === 'in_progress'
                  ? "You've been placed at the front of today's queue."
                  : 'You will be prioritized to the front of the queue once checked in.'}
              </Text>
            </View>
          </View>
        )}

        {/* Virtual join banner */}
        {isVirtual && isConfirmed && !cancelled && (
          <TouchableOpacity
            style={[st.joinBanner, { backgroundColor: '#0D2240', borderColor: 'rgba(91,158,255,0.35)' }]}
            onPress={() => navigation.navigate('VideoCall', {
              appointmentId: raw.id,
              doctorName:    appt.doctor ?? 'your doctor',
            })}
          >
            <Ionicons name="videocam-outline" size={22} color={t.statusVirtual.text} />
            <View style={{ flex: 1 }}>
              <Text style={[st.joinTitle, { color: t.statusVirtual.text }]}>Virtual consultation</Text>
              <Text style={[st.joinSub, { color: 'rgba(133,183,235,0.6)' }]}>Tap to join your video room</Text>
            </View>
            <View style={[st.joinBtn, { backgroundColor: '#1A7FC1' }]}>
              <Text style={st.joinBtnText}>Join</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Queue position (in-person upcoming, confirmed) -- tappable to voluntarily
            move later once actually checked in (not just confirmed/waiting to arrive) */}
        {isInPerson && isConfirmed && !cancelled && (
          <TouchableOpacity
            activeOpacity={raw.status === 'checked_in' ? 0.7 : 1}
            onPress={() => { if (raw.status === 'checked_in') setShowQueuePicker(true) }}
            style={[st.queueCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={st.queueLeft}>
              <Text style={[st.queueNum, { color: t.accent }]}>{queuePosition ?? '—'}</Text>
              <Text style={[st.queueLabel, { color: t.textMuted }]}>Queue position</Text>
            </View>
            <View style={[st.queueDivider, { backgroundColor: t.cardBorder }]} />
            <View style={st.queueRight}>
              <Text style={[st.queueNum, { color: t.textPrimary }]}>
                {appt.estimated_wait ? `~${appt.estimated_wait} min` : '—'}
              </Text>
              <Text style={[st.queueLabel, { color: t.textMuted }]}>Est. wait after check-in</Text>
            </View>
            {raw.status === 'checked_in' && (
              <Ionicons name="swap-vertical-outline" size={16} color={t.textMuted} style={{ position: 'absolute', top: 10, right: 10 }} />
            )}
          </TouchableOpacity>
        )}

        <View style={st.pad}>
          {/* Appointment details */}
          <Section title="Appointment details">
            <InfoRow label="Date"      value={fmtDate(appt.date)} />
            <InfoRow label="Time"      value={fmt12(appt.time)} />
            <InfoRow label="Type"      value={isVirtual ? 'Virtual consultation' : 'In-person visit'} />
            {appt.spec && <InfoRow label="Specialty" value={appt.spec} />}
            <InfoRow label="Hospital"  value={appt.hospital} />
            {appt.clinic && <InfoRow label="Clinic" value={appt.clinic + (isOpdClinic ? ' (General)' : '')} />}
            <InfoRow label="Fee"       value={appt.payment} accent />
          </Section>

          {/* Vitals — recorded by hospital staff during this visit */}
          {hasVitals && liveVitals && (
            <Section title="Vitals recorded during visit">
              {liveVitals.weight_kg != null && <InfoRow label="Weight" value={`${liveVitals.weight_kg} kg`} />}
              {liveVitals.height_cm != null && <InfoRow label="Height" value={`${liveVitals.height_cm} cm`} />}
              {liveVitals.bmi != null && <InfoRow label="BMI" value={String(liveVitals.bmi)} accent />}
              {liveVitals.bp_systolic != null && liveVitals.bp_diastolic != null && (
                <InfoRow label="Blood Pressure" value={`${liveVitals.bp_systolic}/${liveVitals.bp_diastolic}`} />
              )}
              {liveVitals.blood_sugar != null && <InfoRow label="Blood Sugar" value={`${liveVitals.blood_sugar} mg/dL`} />}
            </Section>
          )}

          {/* Doctor info — only show if a doctor was assigned */}
          {appt.doctor ? (
            <Section title="Your doctor">
              <View style={[st.doctorCard, { borderBottomColor: t.cardBorder }]}>
                <Avatar initials={appt.doctorAvatar ?? 'DR'} bg="#1A3A28" size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.dcName, { color: t.textPrimary }]}>{appt.doctor}</Text>
                  <Text style={[st.dcSpec, { color: t.textMuted }]}>{appt.spec} · {appt.hospital}</Text>
                  {appt.rating > 0 && <Stars rating={appt.rating} />}
                </View>
              </View>
              <InfoRow label="Experience"    value={doctorObj?.years_experience ? `${doctorObj.years_experience} years` : '—'} />
              <InfoRow label="Consultations" value={doctorObj?.review_count ? `${doctorObj.review_count}+ consultations` : '—'} />
            </Section>
          ) : isInPerson ? (
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Your doctor</Text>
              <View style={st.noDoctorRow}>
                <Ionicons name="business-outline" size={28} color={t.textMuted} style={{ opacity: 0.5 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.noDoctorTitle, { color: t.textPrimary }]}>Doctor assigned at check-in</Text>
                  <Text style={[st.noDoctorSub, { color: t.textMuted }]}>
                    When you arrive, the front desk will allocate you to an available doctor.
                    Present your check-in pass ID above.
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* How to prepare */}
          {isUpcoming && !cancelled && (
            <Section title="How to prepare">
              {(isVirtual ? [
                'Ensure stable internet connection before your session',
                'Use headphones for clearer audio',
                'Have your previous test results ready to share',
                'Find a quiet, well-lit space for the call',
              ] : [
                'Arrive 10 minutes before your appointment time',
                'Bring a valid ID and your HMO card if applicable',
                'Bring any previous test results or referral letters',
                'Bring a list of medications you currently take',
              ]).map(tip => (
                <View key={tip} style={[st.tipRow, { borderBottomColor: t.cardBorder, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }]}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={t.accent} style={{ marginTop: 2 }} />
                  <Text style={[st.tipText, { color: t.textSecondary, flex: 1 }]}>{tip}</Text>
                </View>
              ))}
            </Section>
          )}

          {/* Payment */}
          <Section title="Payment">
            <InfoRow label="Consultation fee" value={appt.payment} accent />
            {appt.paymentMethod && <InfoRow label="Payment method" value={appt.paymentMethod} />}
          </Section>

          {/* Actions */}
          {isUpcoming && !cancelled && !isPendingReview && !isRejected && (
            <View style={st.actions}>
              {canReschedule && (
                <TouchableOpacity onPress={() => { haptics.tap(); handleReschedule() }} disabled={rescheduleLoading}
                  style={[st.rescheduleBtn, { borderColor: t.cardBorder, backgroundColor: t.cardBg, opacity: rescheduleLoading ? 0.5 : 1 }]}>
                  {rescheduleLoading
                    ? <ActivityIndicator size="small" color={t.textPrimary} />
                    : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="calendar-outline" size={15} color={t.textPrimary} />
                        <Text style={[st.rescheduleTxt, { color: t.textPrimary }]}>Reschedule</Text>
                      </View>
                  }
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { haptics.tap(); handleCancel() }} disabled={cancelling}
                style={[st.cancelBtn, { borderColor: 'rgba(255,92,92,0.3)', backgroundColor: 'rgba(255,92,92,0.08)', opacity: cancelling ? 0.5 : 1 }]}>
                {cancelling
                  ? <ActivityIndicator size="small" color={t.danger} />
                  : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="close" size={13} color={t.danger} />
                      <Text style={[st.cancelTxt, { color: t.danger }]}>Cancel</Text>
                    </View>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* Missed appointment (no_show) — reschedule once for free, or book fresh if already used */}
          {isMissed && (
            <View style={[st.refundNote, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.2)', marginBottom: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: canReschedule || raw.hospital ? 10 : 0 }}>
                <Ionicons name="alert-circle-outline" size={14} color={t.danger} style={{ marginTop: 1 }} />
                <Text style={[st.refundText, { color: t.danger, flex: 1 }]}>
                  {canReschedule
                    ? 'This appointment was marked as missed. You can reschedule it once for free.'
                    : "This appointment was marked as missed and you've already used your free reschedule. Book a new appointment to continue."}
                </Text>
              </View>
              {canReschedule ? (
                <TouchableOpacity onPress={() => { haptics.tap(); handleReschedule() }} disabled={rescheduleLoading}
                  style={[st.rescheduleBtn, { borderColor: 'rgba(255,92,92,0.3)', backgroundColor: t.cardBg, opacity: rescheduleLoading ? 0.5 : 1 }]}>
                  {rescheduleLoading
                    ? <ActivityIndicator size="small" color={t.textPrimary} />
                    : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="calendar-outline" size={15} color={t.textPrimary} />
                        <Text style={[st.rescheduleTxt, { color: t.textPrimary }]}>Reschedule</Text>
                      </View>
                  }
                </TouchableOpacity>
              ) : raw.hospital ? (
                <TouchableOpacity
                  onPress={() => { haptics.tap(); navigation.navigate('BookingFlow', {
                    hospital:    toDisplayHospital(raw.hospital),
                    bookingType: raw.type === 'virtual' ? 'virtual' : 'physical',
                  }) }}
                  style={[st.rescheduleBtn, { borderColor: 'rgba(255,92,92,0.3)', backgroundColor: t.cardBg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="add-circle-outline" size={15} color={t.textPrimary} />
                    <Text style={[st.rescheduleTxt, { color: t.textPrimary }]}>Book a New Appointment</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {isPendingReview && !cancelled && !isRejected && (
            <TouchableOpacity onPress={() => { haptics.tap(); handleCancel() }} disabled={cancelling}
              style={[st.cancelBtn, { borderColor: 'rgba(255,92,92,0.3)', backgroundColor: 'rgba(255,92,92,0.08)', marginBottom: 12, opacity: cancelling ? 0.5 : 1 }]}>
              {cancelling
                ? <ActivityIndicator size="small" color={t.danger} />
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="close" size={13} color={t.danger} />
                    <Text style={[st.cancelTxt, { color: t.danger }]}>Withdraw booking request</Text>
                  </View>
              }
            </TouchableOpacity>
          )}

          {/* Completed — rate & rebook */}
          {appt.status === 'completed' && appt.doctor && (
            <View style={st.actions}>
              <TouchableOpacity
                onPress={() => {
                  // MM10: Rate Doctor flow
                  Alert.alert(
                    `Rate Dr. ${appt.doctor!.split(' ').pop()}`,
                    'How would you rate this consultation?',
                    [1, 2, 3, 4, 5].map(stars => ({
                      text: `${stars} Star${stars === 1 ? '' : 's'}`,
                      onPress: async () => {
                        if (!user || !doctorObj?.id) return
                        await supabase.from('reviews').insert({
                          appointment_id: raw.id,
                          patient_id:     user.id,
                          doctor_id:      doctorObj.id,
                          rating:         stars,
                          body:           '',
                        })
                        Alert.alert('Thank you!', 'Your rating has been submitted.')
                      },
                    }))
                  )
                }}
                style={[st.rescheduleBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
                <Ionicons name="star" size={14} color={t.accent} />
                <Text style={[st.rescheduleTxt, { color: t.accent }]}>
                  Rate Dr. {appt.doctor.split(' ').pop()}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Cancelled refund note */}
          {cancelled && (
            <View style={[st.refundNote, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.2)', flexDirection: 'row', alignItems: 'flex-start', gap: 6 }]}>
              <Ionicons name="checkmark-circle" size={14} color={t.danger} style={{ marginTop: 1 }} />
              <Text style={[st.refundText, { color: t.danger, flex: 1 }]}>
                Appointment cancelled. Nothing was charged for this booking, so there is nothing to refund.
              </Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      {showQueuePicker && (
        <QueuePositionPicker
          appointmentId={raw.id}
          onClose={() => setShowQueuePicker(false)}
          onMoved={(newPosition) => { setQueuePosition(newPosition); setShowQueuePicker(false) }}
        />
      )}
    </SafeAreaView>
  )
}

const DEFAULT_APPT = {
  id: 'QUE-00421',
  hospital: 'Lagos Island General',
  doctor: null,
  spec: 'Cardiology',
  date: 'Thu, 29 May',
  time: '9:00 AM',
  status: 'confirmed',
  type: 'in-person',
  payment: '₦15,500',
  rating: 0,
}

const st = StyleSheet.create({
  safe:               { flex: 1 },
  header:             { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  backBtn:            { padding: 4 },
  backArrow:          { fontSize: 22 },
  headerTitle:        { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  statusBadge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  statusText:         { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  // Check-in pass
  passCard:           { marginHorizontal: 20, borderRadius: 20, borderWidth: 1.5, marginBottom: 12, overflow: 'hidden' },
  passHeader:         { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  passTitle:          { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  passRefWrap:        { alignItems: 'center', paddingVertical: 18 },
  passRef:            { fontSize: 32, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  passCopy:           { fontSize: 10, marginTop: 5, fontWeight: '600' },
  passDivider:        { height: 1, marginHorizontal: 16 },
  passRow:            { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, gap: 12 },
  passRowLabel:       { fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 },
  passRowValue:       { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'right', flex: 1 },
  passFooter:         { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingTop: 10 },
  passFooterText:     { fontSize: 11, flex: 1, lineHeight: 16 },
  // Pending notice
  pendingCard:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 20, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  pendingIcon:        { fontSize: 20 },
  pendingTitle:       { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  pendingSub:         { fontSize: 11, lineHeight: 16 },
  // Hero
  heroCard:           { marginHorizontal: 20, borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 12 },
  bookingIdRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  bookingIdLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  bookingId:          { fontSize: 11, fontWeight: '700' },
  doctorRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  doctorAvatarPlaceholder: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  doctorName:         { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  doctorSpec:         { fontSize: 12, marginTop: 1, marginBottom: 4 },
  typePill:           { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  typePillText:       { fontSize: 10, fontWeight: '700' },
  chipsRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:               { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, maxWidth: '100%' },
  chipIcon:           { fontSize: 12 },
  chipText:           { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500', flexShrink: 1 },
  // Virtual join
  joinBanner:         { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 12 },
  joinTitle:          { fontSize: 13, fontWeight: '700' },
  joinSub:            { fontSize: 11, marginTop: 2 },
  joinBtn:            { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  joinBtnText:        { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Queue
  queueCard:          { flexDirection: 'row', marginHorizontal: 20, borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  queueLeft:          { flex: 1, alignItems: 'center', padding: 14 },
  queueRight:         { flex: 1, alignItems: 'center', padding: 14 },
  queueDivider:       { width: 1 },
  queueNum:           { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  queueLabel:         { fontSize: 10, marginTop: 2, textAlign: 'center' },
  // Pad
  pad:                { paddingHorizontal: 20 },
  // Section
  section:            { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  sectionTitle:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  // Rows
  infoRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  infoLabel:          { fontSize: 12, flexShrink: 0 },
  infoValue:          { fontSize: 12, fontWeight: '600', textAlign: 'right', flex: 1 },
  // No-doctor placeholder
  noDoctorRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  noDoctorTitle:      { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  noDoctorSub:        { fontSize: 11, lineHeight: 17 },
  // Doctor card
  doctorCard:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1 },
  dcName:             { fontSize: 14, fontWeight: '700' },
  dcSpec:             { fontSize: 11, marginTop: 1, marginBottom: 4 },
  // Tips
  tipRow:             { padding: 11, paddingHorizontal: 14, borderBottomWidth: 1 },
  tipText:            { fontSize: 12, lineHeight: 18 },
  // Actions
  actions:            { flexDirection: 'row', gap: 10, marginBottom: 12 },
  rescheduleBtn:      { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center', borderWidth: 1 },
  rescheduleTxt:      { fontSize: 13, fontWeight: '600' },
  cancelBtn:          { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center', borderWidth: 1 },
  cancelTxt:          { fontSize: 13, fontWeight: '600' },
  // Refund
  refundNote:         { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  refundText:         { fontSize: 12, lineHeight: 18 },
  // Rejection
  opdBtn:             { borderRadius: 10, borderWidth: 1, padding: 11, alignItems: 'center' },
})
