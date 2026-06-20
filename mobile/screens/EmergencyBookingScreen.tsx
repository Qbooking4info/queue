import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getHospitals, createAppointment, addNotification } from '../lib/api'
import { toDisplayHospital } from '../lib/adapters'
import type { DisplayHospital } from '../components/hospital/HospitalCard'

interface Props { navigation: any }

const STEPS = ['Triage', 'Hospital & Doctor', 'Payment']

const URGENCY_OPTIONS = [
  {
    id: 'emergency', label: '🚨 Emergency',
    sub: 'Life-threatening — needs immediate attention',
    multiplier: 2.0, badge: '2× fee',
    color: '#FF5C5C', bg: 'rgba(255,92,92,0.1)', border: 'rgba(255,92,92,0.35)',
  },
  {
    id: 'urgent', label: '⚡ Urgent',
    sub: 'Serious but stable — seen within the hour',
    multiplier: 1.5, badge: '1.5× fee',
    color: '#FFB547', bg: 'rgba(255,181,71,0.1)', border: 'rgba(255,181,71,0.35)',
  },
] as const

type UrgencyId = typeof URGENCY_OPTIONS[number]['id']

const ARRIVAL_OPTIONS = ['Now (walk-in)', '15 min', '30 min', '45 min', '1 hr']

const SYMPTOMS = [
  'Chest pain / difficulty breathing',
  'Severe bleeding',
  'High fever (39°C+)',
  'Severe abdominal pain',
  'Head injury / loss of consciousness',
  'Allergic reaction',
  'Stroke symptoms',
  'Severe burns',
]

const PAYMENT_OPTIONS = [
  { id: 'card',     icon: '💳', label: 'Debit / Credit Card',  sub: 'Visa, Mastercard, Verve' },
  { id: 'transfer', icon: '🏦', label: 'Bank Transfer',         sub: 'Direct bank payment' },
  { id: 'ussd',     icon: '📱', label: 'USSD',                  sub: '*737#, *966#, *000#' },
  { id: 'hmo',      icon: '🏥', label: 'HMO Insurance',         sub: 'NHIS, AXA Mansard, Hygeia' },
]

function arrivalToTime(arrival: string): string {
  const now = new Date()
  if (arrival === '15 min') now.setMinutes(now.getMinutes() + 15)
  else if (arrival === '30 min') now.setMinutes(now.getMinutes() + 30)
  else if (arrival === '45 min') now.setMinutes(now.getMinutes() + 45)
  else if (arrival === '1 hr') now.setHours(now.getHours() + 1)
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function EmergencyBookingScreen({ navigation }: Props) {
  const { theme: t }  = useTheme()
  const { user }      = useAuth()

  const [step,              setStep]             = useState(0)
  const [urgency,           setUrgency]          = useState<UrgencyId>('emergency')
  const [symptom,           setSymptom]          = useState('')
  const [customSymptom,     setCustomSymptom]    = useState('')
  const [forDependent,      setForDependent]     = useState(false)
  const [hospitals,         setHospitals]        = useState<DisplayHospital[]>([])
  const [loadingHospitals,  setLoadingHospitals] = useState(false)
  const [selectedHospital,  setSelectedHospital] = useState<DisplayHospital | null>(null)
  const [selectedDoctor,    setSelectedDoctor]   = useState<any | null>(null)
  const [arrival,           setArrival]          = useState<string | null>(null)
  const [paymentMethod,     setPaymentMethod]    = useState('card')
  const [submitting,        setSubmitting]       = useState(false)
  const [submitError,       setSubmitError]      = useState('')

  const u = URGENCY_OPTIONS.find(o => o.id === urgency) ?? URGENCY_OPTIONS[0]
  const baseFee   = selectedDoctor?.consultation_fee ?? 15000
  const premium   = Math.round(baseFee * (u.multiplier - 1))
  const total     = baseFee + premium + 500

  // Load emergency hospitals
  const loadHospitals = useCallback(async () => {
    setLoadingHospitals(true)
    const raw = await getHospitals()
    const emergency = raw.filter(h => h.emergency_hours).map(toDisplayHospital)
    // fallback: show all hospitals if none have emergency_hours set
    setHospitals(emergency.length > 0 ? emergency : raw.map(toDisplayHospital))
    setLoadingHospitals(false)
  }, [])

  useEffect(() => { loadHospitals() }, [loadHospitals])

  const canProceed = () => {
    if (step === 0) return !!(urgency && (symptom || customSymptom.trim()))
    if (step === 1) return !!(selectedHospital && selectedDoctor && arrival)
    return true
  }

  async function handleConfirm() {
    if (!user || !selectedHospital || !selectedDoctor) return
    setSubmitError('')
    setSubmitting(true)

    const today     = new Date().toISOString().split('T')[0]
    const startTime = arrivalToTime(arrival ?? 'Now (walk-in)')
    const reason    = `EMERGENCY · ${u.label} · ${symptom || customSymptom}`

    const result = await createAppointment({
      patientId:  user.id,
      doctorId:   selectedDoctor.id,
      hospitalId: String(selectedHospital.id),
      slotId:     null,
      date:       today,
      startTime,
      type:       'in-person',
      reason,
    })

    if (result) {
      await addNotification({
        userId: user.id,
        type:   'confirmed',
        title:  '🚨 Emergency Booking Confirmed',
        body:   `${result.bookingRef} · ${selectedDoctor.full_name ?? selectedDoctor.name} at ${selectedHospital.name}\nArrival: ${arrival} · ${u.label}`,
        data:   { appointment_id: result.id, booking_ref: result.bookingRef },
      })
    }

    setSubmitting(false)

    if (result) {
      navigation.navigate('EmergencyConfirmation', {
        urgency,
        urgencyLabel: u.label,
        urgencyColor: u.color,
        symptom:      symptom || customSymptom,
        hospital:     selectedHospital,
        doctor:       selectedDoctor,
        slot:         arrival,
        total,
        bookingRef:   result.bookingRef,
      })
    } else {
      setSubmitError('Booking failed. Please try again.')
    }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => step === 0 ? navigation.goBack() : setStep(p => p - 1)} style={s.backBtn}>
          <Text style={[s.backArrow, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={s.headerTitleRow}>
            <Text style={{ fontSize: 18 }}>🚨</Text>
            <Text style={[s.headerTitle, { color: '#FF5C5C' }]}>Emergency Booking</Text>
          </View>
          <Text style={[s.headerSub, { color: t.textMuted }]}>Skip the queue · Immediate attention</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={s.progressRow}>
        {STEPS.map((st, i) => (
          <View key={st} style={{ flex: 1 }}>
            <View style={[s.progressBar, { backgroundColor: i <= step ? '#FF5C5C' : t.cardBorder }]} />
            <Text style={[s.progressLabel, { color: i <= step ? '#FF5C5C' : t.textMuted, fontWeight: i === step ? '700' : '400' }]}>
              {st}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Step 0: Triage ───────────────────────────────────── */}
      {step === 0 && (
        <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false}>
          <View style={[s.alertBanner, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.25)' }]}>
            <Text style={{ fontSize: 20 }}>⚠️</Text>
            <Text style={[s.alertText, { color: '#FF5C5C' }]}>
              If life-threatening, call <Text style={{ fontWeight: '900' }}>112</Text> immediately.
            </Text>
          </View>

          <Text style={[s.label, { color: t.textMuted }]}>How urgent is this?</Text>
          <View style={s.urgencyGrid}>
            {URGENCY_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.id} onPress={() => setUrgency(opt.id)}
                style={[s.urgencyCard, {
                  borderColor:     urgency === opt.id ? opt.color : t.cardBorder,
                  backgroundColor: urgency === opt.id ? opt.bg   : t.cardBg,
                }]}>
                <View style={s.urgencyTop}>
                  <Text style={[s.urgencyLabel, { color: urgency === opt.id ? opt.color : t.textPrimary }]}>{opt.label}</Text>
                  <View style={[s.urgencyBadge, { backgroundColor: opt.bg, borderColor: opt.border }]}>
                    <Text style={[s.urgencyBadgeText, { color: opt.color }]}>{opt.badge}</Text>
                  </View>
                </View>
                <Text style={[s.urgencySub, { color: t.textMuted }]}>{opt.sub}</Text>
                {urgency === opt.id && (
                  <View style={[s.urgencyCheck, { backgroundColor: opt.color }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.label, { color: t.textMuted }]}>What's the issue? <Text style={{ color: '#FF5C5C' }}>*</Text></Text>
          <View style={s.symptomGrid}>
            {SYMPTOMS.map(sym => (
              <TouchableOpacity key={sym} onPress={() => setSymptom(symptom === sym ? '' : sym)}
                style={[s.symptomChip, {
                  borderColor:     symptom === sym ? '#FF5C5C' : t.cardBorder,
                  backgroundColor: symptom === sym ? 'rgba(255,92,92,0.1)' : t.cardBg,
                }]}>
                <Text style={[s.symptomText, { color: symptom === sym ? '#FF5C5C' : t.textSecondary }]}>{sym}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.orDivider, { color: t.textMuted }]}>— or describe in your own words —</Text>
          <TextInput
            value={customSymptom} onChangeText={setCustomSymptom}
            placeholder="Describe symptoms…" placeholderTextColor={t.textMuted}
            multiline numberOfLines={3}
            style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
          />

          <Text style={[s.label, { color: t.textMuted }]}>Who needs care?</Text>
          <View style={s.forRow}>
            {[false, true].map(dep => (
              <TouchableOpacity key={String(dep)} onPress={() => setForDependent(dep)}
                style={[s.forBtn, {
                  borderColor:     forDependent === dep ? t.accent : t.cardBorder,
                  backgroundColor: forDependent === dep ? t.accentBg : t.cardBg,
                }]}>
                <Text style={{ fontSize: 18, marginBottom: 4 }}>{dep ? '👨‍👩‍👧' : '🙋'}</Text>
                <Text style={[s.forBtnText, { color: forDependent === dep ? t.accent : t.textMuted }]}>
                  {dep ? 'A dependent' : 'Myself'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ── Step 1: Hospital & Doctor ─────────────────────────── */}
      {step === 1 && (
        <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false}>
          <Text style={[s.label, { color: t.textMuted }]}>Select hospital</Text>
          {loadingHospitals ? (
            <ActivityIndicator color="#FF5C5C" style={{ marginTop: 20 }} />
          ) : hospitals.length === 0 ? (
            <Text style={[s.emptyText, { color: t.textMuted }]}>No hospitals available.</Text>
          ) : (
            hospitals.map(h => (
              <TouchableOpacity key={h.id}
                onPress={() => { setSelectedHospital(h); setSelectedDoctor(null) }}
                style={[s.hospitalCard, {
                  borderColor:     selectedHospital?.id === h.id ? '#FF5C5C' : t.cardBorder,
                  backgroundColor: selectedHospital?.id === h.id ? 'rgba(255,92,92,0.06)' : t.cardBg,
                }]}>
                <View style={s.hospitalTop}>
                  <View style={[s.hospitalAvatar, { backgroundColor: h.avatarBg }]}>
                    <Text style={[s.hospitalAvatarText]}>{h.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={[s.hospitalName, { color: t.textPrimary }]} numberOfLines={1}>{h.name}</Text>
                      {h.verified && <Text style={{ fontSize: 11, color: '#00E87A' }}>✓</Text>}
                    </View>
                    <Text style={[s.hospitalSpec, { color: t.textMuted }]}>{h.specialty}</Text>
                  </View>
                  {selectedHospital?.id === h.id && (
                    <View style={[s.selectedCheck, { backgroundColor: '#FF5C5C' }]}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>
                    </View>
                  )}
                </View>
                <View style={s.hospitalMeta}>
                  {[
                    { icon: '🚨', label: 'Emergency', color: '#FF5C5C' },
                    { icon: '⏱', label: h.wait,      color: t.textSecondary },
                    { icon: '📍', label: h.distance,  color: t.textSecondary },
                  ].map(m => (
                    <View key={m.label} style={[s.metaChip, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                      <Text style={{ fontSize: 11 }}>{m.icon}</Text>
                      <Text style={[s.metaText, { color: m.color, fontWeight: m.color === '#FF5C5C' ? '700' : '400' }]}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))
          )}

          {/* Doctor selection */}
          {selectedHospital && (selectedHospital.doctors ?? []).length > 0 && (
            <>
              <Text style={[s.label, { color: t.textMuted }]}>Select doctor</Text>
              {(selectedHospital.doctors as any[]).map((d: any) => {
                const name = d.full_name ?? d.name ?? 'Doctor'
                const spec = d.specialty?.name ?? d.spec ?? 'Specialist'
                const fee  = d.consultation_fee ? `₦${Number(d.consultation_fee).toLocaleString()}` : '₦15,000'
                const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                const active = selectedDoctor?.id === d.id
                return (
                  <TouchableOpacity key={d.id} onPress={() => setSelectedDoctor(d)}
                    style={[s.doctorCard, {
                      borderColor:     active ? '#FF5C5C' : t.cardBorder,
                      backgroundColor: active ? 'rgba(255,92,92,0.05)' : t.cardBg,
                    }]}>
                    <View style={[s.doctorAvatar, { backgroundColor: t.inputBg, borderColor: active ? '#FF5C5C' : t.cardBorder }]}>
                      <Text style={[s.doctorAvatarText, { color: t.textMuted }]}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.doctorName, { color: t.textPrimary }]}>{name}</Text>
                      <Text style={[s.doctorSpec, { color: t.textMuted }]}>{spec}</Text>
                    </View>
                    <Text style={[s.doctorFee, { color: active ? '#FF5C5C' : t.accent }]}>{fee}</Text>
                    {active && (
                      <View style={[s.selectedCheck, { backgroundColor: '#FF5C5C' }]}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </>
          )}

          {/* Arrival time */}
          {selectedHospital && selectedDoctor && (
            <>
              <Text style={[s.label, { color: t.textMuted }]}>When can you arrive?</Text>
              <View style={s.slotRow}>
                {ARRIVAL_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt} onPress={() => setArrival(opt)}
                    style={[s.slotChip, {
                      borderColor:     arrival === opt ? '#FF5C5C' : t.cardBorder,
                      backgroundColor: arrival === opt ? 'rgba(255,92,92,0.1)' : t.cardBg,
                    }]}>
                    <Text style={[s.slotText, { color: arrival === opt ? '#FF5C5C' : t.textMuted, fontWeight: arrival === opt ? '700' : '400' }]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ── Step 2: Payment ───────────────────────────────────── */}
      {step === 2 && (
        <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={[s.summaryCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[s.summaryHeading, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Booking summary</Text>
            {[
              { label: 'Hospital',       value: selectedHospital?.name ?? '—' },
              { label: 'Doctor',         value: selectedDoctor?.full_name ?? selectedDoctor?.name ?? '—' },
              { label: 'Arrival',        value: arrival ?? '—' },
              { label: 'Urgency',        value: u.label },
              { label: 'Condition',      value: symptom || customSymptom || '—' },
              { label: 'Queue priority', value: '🔝 Top of queue' },
            ].map(row => (
              <View key={row.label} style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
                <Text style={[s.summaryLabel, { color: t.textMuted }]}>{row.label}</Text>
                <Text style={[s.summaryValue, { color: t.textPrimary }]} numberOfLines={2}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Fee breakdown */}
          <View style={[s.summaryCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[s.summaryHeading, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Fee breakdown</Text>
            <View style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
              <Text style={[s.summaryLabel, { color: t.textMuted }]}>Base consultation</Text>
              <Text style={[s.summaryValue, { color: t.textPrimary }]}>₦{baseFee.toLocaleString()}</Text>
            </View>
            <View style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
              <Text style={[s.summaryLabel, { color: t.textMuted }]}>Emergency premium ({u.badge})</Text>
              <Text style={[s.summaryValue, { color: u.color }]}>+₦{premium.toLocaleString()}</Text>
            </View>
            <View style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
              <Text style={[s.summaryLabel, { color: t.textMuted }]}>Platform fee</Text>
              <Text style={[s.summaryValue, { color: t.textPrimary }]}>₦500</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={[s.totalLabel, { color: t.textPrimary }]}>Total</Text>
              <Text style={[s.totalValue, { color: u.color }]}>₦{total.toLocaleString()}</Text>
            </View>
          </View>

          {/* Payment method */}
          <Text style={[s.label, { color: t.textMuted }]}>Payment method</Text>
          {PAYMENT_OPTIONS.map(p => {
            const active = paymentMethod === p.id
            return (
              <TouchableOpacity key={p.id} onPress={() => setPaymentMethod(p.id)}
                style={[s.payRow, {
                  backgroundColor: active ? 'rgba(255,92,92,0.08)' : t.cardBg,
                  borderColor:     active ? 'rgba(255,92,92,0.4)'  : t.cardBorder,
                }]}>
                <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.payLabel, { color: active ? '#FF5C5C' : t.textPrimary }]}>{p.label}</Text>
                  <Text style={[s.paySub,   { color: t.textMuted }]}>{p.sub}</Text>
                </View>
                <View style={[s.payRadio, { borderColor: active ? '#FF5C5C' : t.cardBorder, backgroundColor: active ? '#FF5C5C' : 'transparent' }]}>
                  {active && <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>✓</Text>}
                </View>
              </TouchableOpacity>
            )
          })}

          <View style={[s.noteBox, { backgroundColor: 'rgba(255,181,71,0.08)', borderColor: 'rgba(255,181,71,0.3)' }]}>
            <Text style={[s.noteText, { color: '#FFB547' }]}>
              ⚡ Emergency bookings are placed at the top of the doctor's queue immediately after payment.
            </Text>
          </View>
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* CTA */}
      {!!submitError && (
        <Text style={{ color: '#F87171', fontSize: 12, textAlign: 'center', paddingBottom: 6 }}>{submitError}</Text>
      )}
      <View style={[s.cta, { borderTopColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
        {step > 0 && (
          <TouchableOpacity onPress={() => setStep(p => p - 1)}
            style={[s.backStepBtn, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
            <Text style={[s.backStepText, { color: t.textPrimary }]}>← Back</Text>
          </TouchableOpacity>
        )}
        {step < 2 ? (
          <TouchableOpacity onPress={() => setStep(p => p + 1)} disabled={!canProceed()}
            style={[s.nextBtn, { backgroundColor: canProceed() ? '#FF5C5C' : t.inputBg, flex: 1 }]}>
            <Text style={[s.nextBtnText, { color: canProceed() ? '#fff' : t.textMuted }]}>Continue →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleConfirm} disabled={submitting}
            style={[s.nextBtn, { backgroundColor: '#FF5C5C', flex: 1, opacity: submitting ? 0.6 : 1 }]}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={[s.nextBtnText, { color: '#fff' }]}>🚨  Confirm & Pay</Text>}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:              { flex: 1 },
  header:            { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  backBtn:           { padding: 4, marginTop: 2 },
  backArrow:         { fontSize: 22 },
  headerTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle:       { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  headerSub:         { fontSize: 11, marginTop: 2 },
  progressRow:       { flexDirection: 'row', gap: 5, paddingHorizontal: 20, marginBottom: 4 },
  progressBar:       { height: 3, borderRadius: 99, marginBottom: 3 },
  progressLabel:     { fontSize: 9 },
  stepScroll:        { flex: 1, paddingHorizontal: 20 },
  label:             { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 16 },
  emptyText:         { fontSize: 13, textAlign: 'center', marginTop: 20 },
  // Alert
  alertBanner:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 13, marginTop: 12, marginBottom: 4, borderWidth: 1 },
  alertText:         { fontSize: 12, flex: 1, lineHeight: 17, fontWeight: '500' },
  // Urgency
  urgencyGrid:       { gap: 8, marginBottom: 4 },
  urgencyCard:       { borderRadius: 16, padding: 14, borderWidth: 1.5, position: 'relative' },
  urgencyTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  urgencyLabel:      { fontSize: 14, fontWeight: '700' },
  urgencyBadge:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  urgencyBadgeText:  { fontSize: 10, fontWeight: '700' },
  urgencySub:        { fontSize: 11, lineHeight: 16 },
  urgencyCheck:      { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Symptoms
  symptomGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  symptomChip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  symptomText:       { fontSize: 11, fontWeight: '500' },
  orDivider:         { fontSize: 11, textAlign: 'center', marginVertical: 12 },
  textarea:          { borderRadius: 13, borderWidth: 1, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  forRow:            { flexDirection: 'row', gap: 8 },
  forBtn:            { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 4 },
  forBtnText:        { fontSize: 13, fontWeight: '600' },
  // Hospital
  hospitalCard:      { borderRadius: 18, padding: 14, borderWidth: 1.5, marginBottom: 10 },
  hospitalTop:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  hospitalAvatar:    { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hospitalAvatarText:{ fontSize: 12, fontWeight: '800', color: '#00E87A' },
  hospitalName:      { fontSize: 14, fontWeight: '700' },
  hospitalSpec:      { fontSize: 11, marginTop: 1 },
  selectedCheck:     { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hospitalMeta:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  metaText:          { fontSize: 11 },
  // Doctor
  doctorCard:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1.5 },
  doctorAvatar:      { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  doctorAvatarText:  { fontSize: 11, fontWeight: '700' },
  doctorName:        { fontSize: 13, fontWeight: '700' },
  doctorSpec:        { fontSize: 11, marginTop: 1 },
  doctorFee:         { fontSize: 12, fontWeight: '700' },
  // Arrival
  slotRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  slotChip:          { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  slotText:          { fontSize: 12 },
  // Payment / Summary
  summaryCard:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  summaryHeading:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  summaryLabel:      { fontSize: 12, flexShrink: 0 },
  summaryValue:      { fontSize: 12, fontWeight: '500', textAlign: 'right', flex: 1 },
  totalRow:          { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14 },
  totalLabel:        { fontSize: 14, fontWeight: '700' },
  totalValue:        { fontSize: 15, fontWeight: '800' },
  payRow:            { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1.5 },
  payLabel:          { fontSize: 13, fontWeight: '600' },
  paySub:            { fontSize: 11, marginTop: 1 },
  payRadio:          { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  noteBox:           { borderRadius: 12, padding: 13, borderWidth: 1, marginTop: 4 },
  noteText:          { fontSize: 12, lineHeight: 18 },
  // CTA
  cta:               { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 20, borderTopWidth: 1 },
  backStepBtn:       { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backStepText:      { fontSize: 13, fontWeight: '600' },
  nextBtn:           { padding: 15, borderRadius: 14, alignItems: 'center' },
  nextBtnText:       { fontSize: 15, fontWeight: '700' },
})
