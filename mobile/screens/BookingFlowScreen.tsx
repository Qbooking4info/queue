import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getAvailableSlots, createAppointment, addNotification } from '../lib/api'
import type { TimeSlot } from '../types/database'
import type { DisplayHospital } from '../components/hospital/HospitalCard'

interface Props { navigation: any; route: any }

interface BookingDoctor {
  id?:              string
  name:             string
  spec:             string
  fee:              string
  avatar:           string
  consultation_fee?: number
  virtual_fee?:     number
}

const STEPS = ['Time & Date', 'Details', 'Payment']

const PAYMENT_OPTIONS = [
  { id: 'card',     icon: '💳', label: 'Debit / Credit Card',  sub: 'Visa, Mastercard, Verve' },
  { id: 'transfer', icon: '🏦', label: 'Bank Transfer',         sub: 'Direct bank payment' },
  { id: 'ussd',     icon: '📱', label: 'USSD',                  sub: '*737#, *966#, *000#' },
  { id: 'hmo',      icon: '🏥', label: 'HMO Insurance',         sub: 'NHIS, AXA Mansard, Hygeia' },
]

// Build 5 upcoming days (skip Sundays)
function getBookingDates(): { iso: string; label: string; day: string }[] {
  const dates = []
  let offset = 0
  while (dates.length < 5) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    if (d.getDay() !== 0) { // skip Sunday
      const iso = d.toISOString().split('T')[0]
      const day = d.toLocaleDateString('en-NG', { weekday: 'short' })
      const num = d.getDate()
      const mon = d.toLocaleDateString('en-NG', { month: 'short' })
      dates.push({ iso, label: offset === 0 ? 'Today' : `${day} ${num} ${mon}`, day })
    }
    offset++
  }
  return dates
}

export function BookingFlowScreen({ navigation, route }: Props) {
  const { theme: t }    = useTheme()
  const { user }        = useAuth()
  const hospital: DisplayHospital = route.params.hospital
  const doctor: BookingDoctor      = route.params.doctor

  const DATES = getBookingDates()

  const [step,          setStep]         = useState(0)
  const [selectedDate,  setSelectedDate] = useState(DATES[0].iso)
  const [slot,          setSlot]         = useState<TimeSlot | null>(null)
  const [vtype,         setVtype]        = useState<'in-person' | 'virtual'>('in-person')
  const [urgency,       setUrgency]      = useState<'routine' | 'urgent' | 'emergency'>('routine')
  const [reason,        setReason]       = useState('')
  const [bookingFor,    setBookingFor]   = useState<'myself' | 'dependent'>('myself')
  const [paymentMethod, setPaymentMethod] = useState<string>('card')
  const [slots,         setSlots]        = useState<TimeSlot[]>([])
  const [loadingSlots,  setLoadingSlots] = useState(false)
  const [submitting,    setSubmitting]   = useState(false)
  const [submitError,   setSubmitError]  = useState('')

  useEffect(() => {
    if (!doctor.id) return
    setSlot(null)
    setLoadingSlots(true)
    getAvailableSlots(doctor.id, selectedDate, vtype === 'virtual')
      .then(s => setSlots(s))
      .finally(() => setLoadingSlots(false))
  }, [doctor.id, selectedDate, vtype])

  const baseFee   = doctor.consultation_fee ?? (parseInt((doctor.fee ?? '0').replace(/[^0-9]/g, '')) || 0)
  const feeAmount = urgency === 'emergency' ? Math.round(baseFee * 1.5) : baseFee
  const platformFee = 500
  const virtualAddon = vtype === 'virtual' && urgency !== 'emergency' ? 1000 : 0
  const emergencyPremium = urgency === 'emergency' ? Math.round(baseFee * 0.5) : 0
  const total = feeAmount + platformFee + virtualAddon
  const feeLabel = `₦${total.toLocaleString()}`

  const canProceed = step === 0 ? !!slot : true

  function goBack() {
    if (step === 0) navigation.goBack()
    else setStep(s => s - 1)
  }

  async function handleConfirm() {
    if (!user) return
    setSubmitError('')
    setSubmitting(true)
    const result = await createAppointment({
      patientId:  user.id,
      doctorId:   doctor.id ?? '',
      hospitalId: String(hospital.id),
      slotId:     slot?.id ?? null,
      date:       slot?.slot_date ?? selectedDate,
      startTime:  slot?.start_time ?? '09:00',
      type:       vtype,
      reason,
    })
    if (result) {
      const dateLabel = slot?.slot_date ?? selectedDate
      const timeLabel = slot?.start_time ?? '—'
      await addNotification({
        userId: user.id,
        type:   'confirmed',
        title:  'Booking Confirmed',
        body:   `${result.bookingRef} · ${doctor.name} at ${hospital.name}\n${dateLabel} at ${timeLabel} · ${vtype === 'virtual' ? 'Virtual' : 'In-person'}`,
        data:   { appointment_id: result.id, booking_ref: result.bookingRef },
      })
    }
    setSubmitting(false)
    if (result) {
      navigation.navigate('Confirmation', {
        hospital, doctor, slot, vtype, urgency,
        bookingRef: result.bookingRef,
      })
    } else {
      setSubmitError('Booking failed. Please try again.')
    }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.container}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={goBack} style={s.headerBack}>
            <Text style={[s.headerBackText, { color: t.textMuted }]}>←</Text>
          </TouchableOpacity>
          <Text style={[s.title, { color: t.textPrimary }]}>Book appointment</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Progress */}
        <View style={s.progress}>
          {STEPS.map((st, i) => (
            <TouchableOpacity key={st} onPress={() => i < step && setStep(i)} style={{ flex: 1 }}>
              <View style={[s.progressBar, { backgroundColor: i <= step ? t.accent : t.cardBorder }]} />
              <Text style={[s.progressLabel, {
                color: i <= step ? t.accent : t.textMuted,
                fontWeight: i === step ? '700' : '400',
              }]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Doctor summary */}
        <View style={[s.doctorCard, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
          <View style={[s.docAvatar, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[s.docAvatarText, { color: t.textMuted }]}>{doctor.avatar}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.docName, { color: t.textPrimary }]}>{doctor.name}</Text>
            <Text style={[s.docSpec, { color: t.textMuted }]}>{doctor.spec} · {hospital.name}</Text>
          </View>
          <Text style={[s.docFee, { color: t.accent }]}>{feeLabel}</Text>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

          {/* ── STEP 0 — Time & Date ─────────────────────────────────── */}
          {step === 0 && (
            <View>
              {/* Visit type */}
              <Text style={[s.stepLabel, { color: t.textMuted }]}>Visit type</Text>
              <View style={s.row3}>
                {([
                  ['routine',   '🩺 Routine',   'Standard'],
                  ['urgent',    '⚡ Urgent',     'Standard'],
                  ['emergency', '🚨 Emergency',  '1.5× fee'],
                ] as const).map(([id, label, sub]) => (
                  <TouchableOpacity key={id} onPress={() => setUrgency(id)} style={[s.urgBtn, {
                    borderColor:     urgency === id ? t.accent : t.cardBorder,
                    backgroundColor: urgency === id ? t.accentBg : t.cardBg,
                  }]}>
                    <Text style={[s.urgLabel, { color: urgency === id ? t.accent : t.textPrimary }]}>{label}</Text>
                    <Text style={[s.urgSub,   { color: t.textMuted }]}>{sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Consultation type */}
              <Text style={[s.stepLabel, { color: t.textMuted }]}>Consultation type</Text>
              <View style={s.row2}>
                {(['in-person', 'virtual'] as const).map(vt => (
                  <TouchableOpacity key={vt} onPress={() => setVtype(vt)} style={[s.vtBtn, {
                    borderColor:     vtype === vt ? t.accent : t.cardBorder,
                    backgroundColor: vtype === vt ? t.accentBg : t.cardBg,
                  }]}>
                    <Text style={{ fontSize: 18, marginBottom: 3 }}>
                      {vt === 'in-person' ? '🏥' : '💻'}
                    </Text>
                    <Text style={[s.vtText, { color: vtype === vt ? t.accent : t.textMuted }]}>
                      {vt === 'in-person' ? 'In-person' : 'Virtual'}
                    </Text>
                    {vtype === vt && (
                      <View style={[s.vtCheck, { backgroundColor: t.accent }]}>
                        <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date selector */}
              <Text style={[s.stepLabel, { color: t.textMuted }]}>Select date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={s.dateScroll}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                {DATES.map(d => {
                  const active = selectedDate === d.iso
                  return (
                    <TouchableOpacity key={d.iso} onPress={() => setSelectedDate(d.iso)}
                      style={[s.dateChip, {
                        borderColor:     active ? t.accent : t.cardBorder,
                        backgroundColor: active ? t.accentBg : t.cardBg,
                      }]}>
                      <Text style={[s.dateChipLabel, { color: active ? t.accent : t.textPrimary }]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {/* Time slots */}
              <Text style={[s.stepLabel, { color: t.textMuted, marginTop: 14 }]}>
                Available times
              </Text>
              {loadingSlots ? (
                <ActivityIndicator color={t.accent} style={{ marginVertical: 20 }} />
              ) : slots.length > 0 ? (
                <View style={s.slotGrid}>
                  {slots.map(sl => {
                    const active = slot?.id === sl.id
                    return (
                      <TouchableOpacity key={sl.id} onPress={() => setSlot(active ? null : sl)}
                        style={[s.slotBtn, {
                          borderColor:     active ? t.accent : t.cardBorder,
                          backgroundColor: active ? t.accentBg : t.cardBg,
                        }]}>
                        <Text style={[s.slotText, {
                          color:      active ? t.accent : t.textSecondary,
                          fontWeight: active ? '700' : '400',
                        }]}>{sl.start_time}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ) : (
                <View style={[s.noSlots, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>📅</Text>
                  <Text style={[s.noSlotsText, { color: t.textMuted }]}>
                    No slots available for this date.
                  </Text>
                  <Text style={[s.noSlotsText, { color: t.textMuted, marginTop: 2 }]}>
                    Try a different date or consultation type.
                  </Text>
                </View>
              )}

              {/* Selected slot summary */}
              {slot && (
                <View style={[s.selectedSummary, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                  <Text style={{ fontSize: 16 }}>✓</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.selectedSummaryTitle, { color: t.accent }]}>Slot selected</Text>
                    <Text style={[s.selectedSummarySub, { color: t.textSecondary }]}>
                      {DATES.find(d => d.iso === selectedDate)?.label} · {slot.start_time} · {vtype === 'virtual' ? 'Virtual' : 'In-person'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── STEP 1 — Details ─────────────────────────────────────── */}
          {step === 1 && (
            <View>
              <Text style={[s.stepLabel, { color: t.textMuted }]}>Reason for visit</Text>
              <TextInput
                value={reason} onChangeText={setReason} multiline numberOfLines={4}
                placeholder="Describe your symptoms or reason for this appointment…"
                placeholderTextColor={t.textMuted}
                style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
              />

              <Text style={[s.stepLabel, { color: t.textMuted, marginTop: 16 }]}>Attach documents (optional)</Text>
              <TouchableOpacity style={[s.uploadArea, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                <Text style={{ fontSize: 24, marginBottom: 6 }}>📎</Text>
                <Text style={[s.uploadText, { color: t.textSecondary }]}>Tap to attach files</Text>
                <Text style={[s.uploadSub,  { color: t.textMuted }]}>Lab results, referrals, prescriptions · PNG, JPG, PDF – max 10 MB</Text>
              </TouchableOpacity>

              <Text style={[s.stepLabel, { color: t.textMuted, marginTop: 16 }]}>Booking for</Text>
              <View style={s.row2}>
                {(['myself', 'dependent'] as const).map(opt => (
                  <TouchableOpacity key={opt} onPress={() => setBookingFor(opt)}
                    style={[s.vtBtn, {
                      borderColor:     bookingFor === opt ? t.accent : t.cardBorder,
                      backgroundColor: bookingFor === opt ? t.accentBg : t.cardBg,
                    }]}>
                    <Text style={{ fontSize: 18, marginBottom: 3 }}>
                      {opt === 'myself' ? '🙋' : '👨‍👩‍👧'}
                    </Text>
                    <Text style={[s.vtText, { color: bookingFor === opt ? t.accent : t.textMuted }]}>
                      {opt === 'myself' ? 'Myself' : 'A dependent'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Booking summary recap */}
              <View style={[s.recapCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.recapTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Appointment summary</Text>
                {[
                  { label: 'Doctor',   value: doctor.name },
                  { label: 'Date',     value: DATES.find(d => d.iso === selectedDate)?.label ?? selectedDate },
                  { label: 'Time',     value: slot?.start_time ?? '—' },
                  { label: 'Type',     value: vtype === 'virtual' ? 'Virtual consultation' : 'In-person visit' },
                  { label: 'Urgency',  value: urgency.charAt(0).toUpperCase() + urgency.slice(1) },
                ].map(row => (
                  <View key={row.label} style={[s.recapRow, { borderBottomColor: t.cardBorder }]}>
                    <Text style={[s.recapLabel, { color: t.textMuted }]}>{row.label}</Text>
                    <Text style={[s.recapValue, { color: t.textPrimary }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── STEP 2 — Payment ─────────────────────────────────────── */}
          {step === 2 && (
            <View>
              {/* Fee breakdown */}
              <View style={[s.summaryCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.summaryTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Order summary</Text>
                {[
                  { label: 'Consultation fee',          value: `₦${baseFee.toLocaleString()}` },
                  { label: 'Platform fee',               value: `₦${platformFee.toLocaleString()}` },
                  ...(emergencyPremium > 0
                    ? [{ label: 'Emergency premium (0.5×)', value: `₦${emergencyPremium.toLocaleString()}` }]
                    : []),
                  ...(virtualAddon > 0
                    ? [{ label: 'Virtual add-on',           value: `₦${virtualAddon.toLocaleString()}` }]
                    : []),
                ].map(item => (
                  <View key={item.label} style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
                    <Text style={[s.summaryLabel, { color: t.textMuted }]}>{item.label}</Text>
                    <Text style={[s.summaryValue, { color: t.textPrimary }]}>{item.value}</Text>
                  </View>
                ))}
                <View style={s.summaryTotal}>
                  <Text style={[s.totalLabel, { color: t.textPrimary }]}>Total</Text>
                  <Text style={[s.totalValue, { color: t.accent }]}>{feeLabel}</Text>
                </View>
              </View>

              {/* Payment methods */}
              <Text style={[s.stepLabel, { color: t.textMuted }]}>Payment method</Text>
              {PAYMENT_OPTIONS.map(p => {
                const active = paymentMethod === p.id
                return (
                  <TouchableOpacity key={p.id} onPress={() => setPaymentMethod(p.id)}
                    style={[s.payRow, {
                      backgroundColor: active ? t.accentBg : t.cardBg,
                      borderColor:     active ? t.accentBorder : t.cardBorder,
                    }]}>
                    <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.payLabel, { color: active ? t.accent : t.textPrimary }]}>{p.label}</Text>
                      <Text style={[s.paySub,   { color: t.textMuted }]}>{p.sub}</Text>
                    </View>
                    <View style={[s.payRadio, {
                      borderColor:     active ? t.accent : t.cardBorder,
                      backgroundColor: active ? t.accent : 'transparent',
                    }]}>
                      {active && <Text style={{ color: '#000', fontSize: 9, fontWeight: '900' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* CTA row */}
        {!!submitError && (
          <View style={{ paddingHorizontal: 0, paddingBottom: 6 }}>
            <Text style={{ color: '#F87171', fontSize: 12, textAlign: 'center' }}>{submitError}</Text>
          </View>
        )}
        <View style={[s.ctaWrap, { borderTopColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
          {/* Back step button (hidden on step 0 — header ← handles that) */}
          {step > 0 && (
            <TouchableOpacity onPress={goBack}
              style={[s.backStepBtn, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
              <Text style={[s.backStepText, { color: t.textPrimary }]}>← Back</Text>
            </TouchableOpacity>
          )}

          {step < 2 ? (
            <TouchableOpacity onPress={() => setStep(s => s + 1)} disabled={!canProceed}
              style={[s.ctaBtn, { backgroundColor: canProceed ? t.accent : t.inputBg, flex: 1 }]}>
              <Text style={[s.ctaBtnText, { color: canProceed ? '#fff' : t.textMuted }]}>
                Continue →
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleConfirm} disabled={submitting}
              style={[s.ctaBtn, { backgroundColor: t.accent, opacity: submitting ? 0.6 : 1, flex: 1 }]}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={[s.ctaBtnText, { color: '#fff' }]}>Confirm & Pay</Text>}
            </TouchableOpacity>
          )}
        </View>

      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:               { flex: 1 },
  container:          { flex: 1, paddingHorizontal: 20 },
  // Header
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, marginBottom: 14 },
  headerBack:         { width: 32, height: 32, justifyContent: 'center' },
  headerBackText:     { fontSize: 22 },
  title:              { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  // Progress
  progress:           { flexDirection: 'row', gap: 5, marginBottom: 14 },
  progressBar:        { height: 3, borderRadius: 99, marginBottom: 3 },
  progressLabel:      { fontSize: 10 },
  // Doctor card
  doctorCard:         { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, marginBottom: 14, borderWidth: 1 },
  docAvatar:          { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  docAvatarText:      { fontSize: 11, fontWeight: '700' },
  docName:            { fontSize: 13, fontWeight: '700' },
  docSpec:            { fontSize: 11, marginTop: 1 },
  docFee:             { fontSize: 13, fontWeight: '700' },
  // Step labels
  stepLabel:          { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  // Visit type
  row3:               { flexDirection: 'row', gap: 7, marginBottom: 16 },
  urgBtn:             { flex: 1, padding: 9, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', gap: 2 },
  urgLabel:           { fontSize: 11, fontWeight: '700' },
  urgSub:             { fontSize: 9 },
  // Consultation type
  row2:               { flexDirection: 'row', gap: 8, marginBottom: 16 },
  vtBtn:              { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', gap: 3, position: 'relative' },
  vtText:             { fontSize: 12, fontWeight: '600' },
  vtCheck:            { position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // Date chips
  dateScroll:         { marginBottom: 4 },
  dateChip:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, minWidth: 80, alignItems: 'center' },
  dateChipLabel:      { fontSize: 12, fontWeight: '600' },
  // Time slots
  slotGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  slotBtn:            { width: '30%', paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, alignItems: 'center' },
  slotText:           { fontSize: 12 },
  noSlots:            { borderRadius: 12, padding: 20, borderWidth: 1, marginBottom: 14, alignItems: 'center' },
  noSlotsText:        { fontSize: 12, textAlign: 'center' },
  // Selected slot summary
  selectedSummary:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 4 },
  selectedSummaryTitle:{ fontSize: 13, fontWeight: '700' },
  selectedSummarySub: { fontSize: 11, marginTop: 1 },
  // Details step
  textarea:           { borderRadius: 13, borderWidth: 1, padding: 12, fontSize: 13, minHeight: 100, textAlignVertical: 'top' },
  uploadArea:         { borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', padding: 20, alignItems: 'center', gap: 3 },
  uploadText:         { fontSize: 13, fontWeight: '500' },
  uploadSub:          { fontSize: 11, textAlign: 'center', opacity: 0.7 },
  // Recap card
  recapCard:          { borderRadius: 14, overflow: 'hidden', borderWidth: 1, marginTop: 4 },
  recapTitle:         { padding: 10, paddingHorizontal: 14, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, borderBottomWidth: 1 },
  recapRow:           { flexDirection: 'row', justifyContent: 'space-between', padding: 9, paddingHorizontal: 14, borderBottomWidth: 1 },
  recapLabel:         { fontSize: 12 },
  recapValue:         { fontSize: 12, fontWeight: '600' },
  // Payment step
  summaryCard:        { borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 1 },
  summaryTitle:       { padding: 10, paddingHorizontal: 14, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, borderBottomWidth: 1 },
  summaryRow:         { flexDirection: 'row', justifyContent: 'space-between', padding: 9, paddingHorizontal: 14, borderBottomWidth: 1 },
  summaryLabel:       { fontSize: 12 },
  summaryValue:       { fontSize: 12, fontWeight: '500' },
  summaryTotal:       { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14 },
  totalLabel:         { fontSize: 14, fontWeight: '700' },
  totalValue:         { fontSize: 15, fontWeight: '800' },
  payRow:             { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1.5 },
  payLabel:           { fontSize: 13, fontWeight: '600' },
  paySub:             { fontSize: 11, marginTop: 1 },
  payRadio:           { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  // CTA
  ctaWrap:            { flexDirection: 'row', gap: 8, paddingVertical: 12, borderTopWidth: 1 },
  backStepBtn:        { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backStepText:       { fontSize: 13, fontWeight: '600' },
  ctaBtn:             { borderRadius: 14, padding: 15, alignItems: 'center' },
  ctaBtnText:         { fontSize: 15, fontWeight: '700' },
})
