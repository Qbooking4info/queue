import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import type { Hospital, Doctor } from '../data'

interface Props { navigation: any; route: any }

const STEPS = ['Time', 'Details', 'Payment']

export function BookingFlowScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const hospital: Hospital = route.params.hospital
  const doctor: Doctor = route.params.doctor

  const [step, setStep] = useState(0)
  const [slot, setSlot] = useState<string | null>(null)
  const [vtype, setVtype] = useState<'in-person' | 'virtual'>('in-person')
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('routine')
  const [reason, setReason] = useState('')

  const feeNum = parseInt(doctor.fee.replace(/[^0-9]/g, ''))
  const fee = urgency === 'emergency' ? `₦${(feeNum * 1.5).toLocaleString()}` : doctor.fee
  const canProceed = step === 0 ? !!slot : true

  const handleConfirm = () => {
    navigation.navigate('Confirmation', { hospital, doctor, slot, vtype, urgency })
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <View style={[styles.container]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.back, { color: t.textMuted }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: t.textPrimary }]}>Book appointment</Text>
        </View>

        {/* Progress */}
        <View style={styles.progress}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1 }}>
              <View style={[styles.progressBar, { backgroundColor: i <= step ? t.accent : t.cardBorder }]} />
              <Text style={[styles.progressLabel, { color: i <= step ? t.accent : t.textMuted, fontWeight: i === step ? '700' : '400' }]}>{s}</Text>
            </View>
          ))}
        </View>

        {/* Doctor summary */}
        <View style={[styles.doctorCard, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
          <View style={[styles.docAvatar, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[styles.docAvatarText, { color: t.textMuted }]}>{doctor.avatar}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docName, { color: t.textPrimary }]}>{doctor.name}</Text>
            <Text style={[styles.docSpec, { color: t.textMuted }]}>{doctor.spec} · {hospital.name}</Text>
          </View>
          <Text style={[styles.docFee, { color: t.accent }]}>{fee}</Text>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* STEP 0 – Time */}
          {step === 0 && (
            <View>
              <Text style={[styles.stepLabel, { color: t.textMuted }]}>Visit type</Text>
              <View style={styles.row3}>
                {([['routine', '🩺 Routine', 'Standard fee'], ['urgent', '⚡ Urgent', 'Standard fee'], ['emergency', '🚨 Emergency', '1.5× premium']] as const).map(([id, label, sub]) => (
                  <TouchableOpacity key={id} onPress={() => setUrgency(id)} style={[styles.urgBtn, {
                    borderColor: urgency === id ? t.accent : t.cardBorder,
                    backgroundColor: urgency === id ? t.accentBg : t.cardBg,
                  }]}>
                    <Text style={[styles.urgLabel, { color: urgency === id ? t.accent : t.textPrimary }]}>{label}</Text>
                    <Text style={[styles.urgSub, { color: t.textMuted }]}>{sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.stepLabel, { color: t.textMuted }]}>Consultation</Text>
              <View style={styles.row2}>
                {(['in-person', 'virtual'] as const).map(vt => (
                  <TouchableOpacity key={vt} onPress={() => setVtype(vt)} style={[styles.vtBtn, {
                    borderColor: vtype === vt ? t.accent : t.cardBorder,
                    backgroundColor: vtype === vt ? t.accentBg : t.cardBg,
                  }]}>
                    <Text style={[styles.vtText, { color: vtype === vt ? t.accent : t.textMuted }]}>
                      {vt === 'in-person' ? '🏥 In-person' : '💻 Virtual'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.stepLabel, { color: t.textMuted }]}>Thursday, 29 May 2025</Text>
              <View style={styles.slotGrid}>
                {hospital.slots.map(s => (
                  <TouchableOpacity key={s} onPress={() => setSlot(s)} style={[styles.slotBtn, {
                    borderColor: slot === s ? t.accent : t.cardBorder,
                    backgroundColor: slot === s ? t.accentBg : t.cardBg,
                  }]}>
                    <Text style={[styles.slotText, { color: slot === s ? t.accent : t.textMuted, fontWeight: slot === s ? '700' : '400' }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {slot && (
                <View style={[styles.waitNote, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                  <Text style={[styles.waitText, { color: t.textMuted }]}>⏱ Estimated wait after check-in: <Text style={{ color: t.textPrimary, fontWeight: '600' }}>{hospital.wait}</Text></Text>
                </View>
              )}
            </View>
          )}

          {/* STEP 1 – Details */}
          {step === 1 && (
            <View>
              <Text style={[styles.stepLabel, { color: t.textMuted }]}>Reason for visit</Text>
              <TextInput
                value={reason} onChangeText={setReason} multiline numberOfLines={4}
                placeholder="Describe your symptoms or reason for this appointment…"
                placeholderTextColor={t.textMuted}
                style={[styles.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
              />
              <Text style={[styles.stepLabel, { color: t.textMuted, marginTop: 14 }]}>Attach documents (optional)</Text>
              <View style={[styles.uploadArea, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                <Text style={{ fontSize: 22, marginBottom: 4 }}>📎</Text>
                <Text style={[styles.uploadText, { color: t.textMuted }]}>Lab results, referrals, prescriptions</Text>
                <Text style={[styles.uploadSub, { color: t.textMuted }]}>PNG · JPG · PDF – max 10 MB</Text>
              </View>
              <Text style={[styles.stepLabel, { color: t.textMuted, marginTop: 14 }]}>Booking for</Text>
              <View style={styles.row2}>
                {['Myself', 'A dependent'].map((opt, i) => (
                  <TouchableOpacity key={opt} style={[styles.vtBtn, {
                    borderColor: i === 0 ? t.accent : t.cardBorder,
                    backgroundColor: i === 0 ? t.accentBg : t.cardBg,
                  }]}>
                    <Text style={[styles.vtText, { color: i === 0 ? t.accent : t.textMuted }]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* STEP 2 – Payment */}
          {step === 2 && (
            <View>
              <View style={[styles.summaryCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[styles.summaryTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Order summary</Text>
                {[
                  { label: 'Consultation fee', value: doctor.fee },
                  { label: 'Platform fee', value: '₦500' },
                  { label: urgency === 'emergency' ? 'Emergency premium (0.5×)' : 'Virtual add-on',
                    value: urgency === 'emergency' ? `₦${(feeNum * 0.5).toLocaleString()}` : vtype === 'virtual' ? '₦1,000' : '—' },
                ].map(item => (
                  <View key={item.label} style={[styles.summaryRow, { borderBottomColor: t.cardBorder }]}>
                    <Text style={[styles.summaryLabel, { color: t.textMuted }]}>{item.label}</Text>
                    <Text style={[styles.summaryValue, { color: t.textPrimary }]}>{item.value}</Text>
                  </View>
                ))}
                <View style={styles.summaryTotal}>
                  <Text style={[styles.totalLabel, { color: t.textPrimary }]}>Total</Text>
                  <Text style={[styles.totalValue, { color: t.accent }]}>{fee}</Text>
                </View>
              </View>

              <Text style={[styles.stepLabel, { color: t.textMuted }]}>Pay with</Text>
              {[
                { label: '💳  Card ending in 4522', sel: true },
                { label: '🏦  Bank transfer', sel: false },
                { label: '📱  USSD', sel: false },
                { label: '🏥  HMO (AXA Mansard)', sel: false },
              ].map(p => (
                <View key={p.label} style={[styles.payRow, {
                  backgroundColor: p.sel ? t.accentBg : t.cardBg,
                  borderColor: p.sel ? t.accentBorder : t.cardBorder,
                }]}>
                  <Text style={[styles.payLabel, { color: p.sel ? t.accent : t.textMuted, fontWeight: p.sel ? '600' : '400' }]}>{p.label}</Text>
                  {p.sel && <Text style={{ color: t.accent }}>✓</Text>}
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>

        {/* CTA */}
        <View style={[styles.ctaWrap, { borderTopColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
          {step < 2 ? (
            <TouchableOpacity onPress={() => setStep(s => s + 1)} disabled={!canProceed}
              style={[styles.ctaBtn, { backgroundColor: canProceed ? t.accent : t.cardBorder }]}>
              <Text style={[styles.ctaBtnText, { color: canProceed ? '#fff' : t.textMuted }]}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleConfirm} style={[styles.ctaBtn, { backgroundColor: t.accent }]}>
              <Text style={[styles.ctaBtnText, { color: '#fff' }]}>Confirm & Pay</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  container:    { flex: 1, paddingHorizontal: 20 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4, marginBottom: 16 },
  back:         { fontSize: 22 },
  title:        { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  progress:     { flexDirection: 'row', gap: 5, marginBottom: 16 },
  progressBar:  { height: 3, borderRadius: 99, marginBottom: 3 },
  progressLabel:{ fontSize: 10 },
  doctorCard:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, marginBottom: 14, borderWidth: 1 },
  docAvatar:    { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  docAvatarText:{ fontSize: 11, fontWeight: '700' },
  docName:      { fontSize: 13, fontWeight: '700' },
  docSpec:      { fontSize: 11, marginTop: 1 },
  docFee:       { fontSize: 13, fontWeight: '700' },
  stepLabel:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  row3:         { flexDirection: 'row', gap: 7, marginBottom: 16 },
  row2:         { flexDirection: 'row', gap: 7, marginBottom: 16 },
  urgBtn:       { flex: 1, padding: 9, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', gap: 2 },
  urgLabel:     { fontSize: 11, fontWeight: '700' },
  urgSub:       { fontSize: 9 },
  vtBtn:        { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  vtText:       { fontSize: 12, fontWeight: '600' },
  slotGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  slotBtn:      { width: '30%', paddingVertical: 10, borderRadius: 11, borderWidth: 1.5, alignItems: 'center' },
  slotText:     { fontSize: 12 },
  waitNote:     { borderRadius: 11, padding: 10, borderWidth: 1, marginBottom: 8 },
  waitText:     { fontSize: 11 },
  textarea:     { borderRadius: 13, borderWidth: 1, padding: 12, fontSize: 13, minHeight: 90, textAlignVertical: 'top' },
  uploadArea:   { borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', padding: 18, alignItems: 'center' },
  uploadText:   { fontSize: 12 },
  uploadSub:    { fontSize: 11, marginTop: 2, opacity: 0.7 },
  summaryCard:  { borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 1 },
  summaryTitle: { padding: 10, paddingHorizontal: 14, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, borderBottomWidth: 1 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', padding: 9, paddingHorizontal: 14, borderBottomWidth: 1 },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 12, fontWeight: '500' },
  summaryTotal: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingHorizontal: 14 },
  totalLabel:   { fontSize: 13, fontWeight: '700' },
  totalValue:   { fontSize: 13, fontWeight: '800' },
  payRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, padding: 11, paddingHorizontal: 14, marginBottom: 7, borderWidth: 1 },
  payLabel:     { fontSize: 12 },
  ctaWrap:      { paddingVertical: 12, borderTopWidth: 1 },
  ctaBtn:       { borderRadius: 15, padding: 15, alignItems: 'center' },
  ctaBtnText:   { fontSize: 15, fontWeight: '700' },
})
