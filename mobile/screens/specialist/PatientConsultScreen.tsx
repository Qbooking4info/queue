import { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'

interface Props { navigation: any; route: { params: { appointmentId: string } } }

interface PatientRow { id: string; full_name: string; phone: string | null; date_of_birth: string | null; gender: string | null; blood_group: string | null }
interface ApptFull {
  id:               string
  appointment_date: string
  start_time:       string
  type:             string
  status:           string
  reason:           string | null
  urgency:          string | null
  symptom_description: string | null
  doctor_notes:     string | null
  diagnosis:        string | null
  queue_position:   number | null
  patient_id:       string
  patient:          PatientRow | null
  vitals_weight_kg?:    number | null
  vitals_height_cm?:    number | null
  vitals_bp_systolic?:  number | null
  vitals_bp_diastolic?: number | null
  vitals_blood_sugar?:  number | null
  vitals_bmi?:          number | null
}

const NOTES_MAX = 1000
const DIAG_MAX  = 500

function calcBMI(weightKg: string, heightCm: string): string | null {
  const w = parseFloat(weightKg)
  const h = parseFloat(heightCm) / 100
  if (!w || !h) return null
  return (w / (h * h)).toFixed(1)
}

function age(dob: string | null): string {
  if (!dob) return '—'
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000)) + ' yrs'
}

function fmt12(time: string): string {
  if (!time) return '—'
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

function InProgressPulse() {
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return (
    <Animated.View style={{ transform: [{ scale: pulse }], width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF8C42' }} />
  )
}

export function PatientConsultScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { appointmentId } = route.params
  const [appt,    setAppt]    = useState<ApptFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  const [weight, setWeight]   = useState('')
  const [height, setHeight]   = useState('')
  const [bpSys,  setBpSys]    = useState('')
  const [bpDia,  setBpDia]    = useState('')
  const [bSugar, setBSugar]   = useState('')
  const [notes,  setNotes]    = useState('')
  const [diag,   setDiag]     = useState('')

  const [saved,  setSaved]    = useState(false)

  async function fetchAppt() {
    const { data } = await (supabase as any)
      .from('appointments')
      .select('*, patient:users!appointments_patient_id_fkey(id, full_name, phone, date_of_birth, gender, blood_group)')
      .eq('id', appointmentId)
      .single()

    if (data) {
      setAppt(data as ApptFull)
      setWeight(data.vitals_weight_kg    != null ? String(data.vitals_weight_kg)    : '')
      setHeight(data.vitals_height_cm    != null ? String(data.vitals_height_cm)    : '')
      setBpSys( data.vitals_bp_systolic  != null ? String(data.vitals_bp_systolic)  : '')
      setBpDia( data.vitals_bp_diastolic != null ? String(data.vitals_bp_diastolic) : '')
      setBSugar(data.vitals_blood_sugar  != null ? String(data.vitals_blood_sugar)  : '')
      setNotes( data.doctor_notes ?? '')
      setDiag(  data.diagnosis   ?? '')
    }
    setLoading(false)
  }

  useEffect(() => { fetchAppt() }, [appointmentId])

  async function saveVitalsAndNotes() {
    setSaving(true)
    const bmi = calcBMI(weight, height)
    const { error } = await (supabase as any)
      .from('appointments')
      .update({
        vitals_weight_kg:    parseFloat(weight)  || null,
        vitals_height_cm:    parseFloat(height)  || null,
        vitals_bp_systolic:  parseInt(bpSys)     || null,
        vitals_bp_diastolic: parseInt(bpDia)     || null,
        vitals_blood_sugar:  parseFloat(bSugar)  || null,
        vitals_bmi:          bmi ? parseFloat(bmi) : null,
        doctor_notes:        notes || null,
        diagnosis:           diag  || null,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', appointmentId)

    setSaving(false)
    if (!error) {
      haptics.success()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      fetchAppt()
    } else {
      haptics.error()
      Alert.alert('Save failed', error.message)
    }
  }

  async function updateStatus(newStatus: string) {
    setStatusUpdating(true)
    const { error } = await (supabase as any)
      .from('appointments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', appointmentId)

    setStatusUpdating(false)
    if (!error) {
      if (newStatus === 'completed') haptics.success()
      setAppt(prev => prev ? { ...prev, status: newStatus } : prev)
    } else {
      haptics.error()
      Alert.alert('Update failed', error.message)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
        <View style={st.center}><ActivityIndicator color={t.accent} size="large" /></View>
      </SafeAreaView>
    )
  }

  if (!appt) {
    return (
      <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
        <View style={st.center}>
          <Text style={{ color: t.textMuted }}>Appointment not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const patient    = appt.patient
  const isVirtual  = appt.type === 'virtual'
  const canStart   = ['pending','confirmed','checked_in'].includes(appt.status) && !isVirtual
  const canComplete = appt.status === 'in_progress'
  const isDone      = appt.status === 'completed'
  const isInProgress = appt.status === 'in_progress'
  const bmi = calcBMI(weight, height)

  const urgencyBg  = appt.urgency === 'emergency' ? 'rgba(255,92,92,0.12)'
    : appt.urgency === 'urgent' ? 'rgba(239,159,39,0.12)' : t.accentBg
  const urgencyCol = appt.urgency === 'emergency' ? '#FF5C5C'
    : appt.urgency === 'urgent' ? '#EF9F27' : t.accent

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Ionicons name="arrow-back" size={22} color={t.textMuted} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: t.textPrimary }]} numberOfLines={1}>
            {patient?.full_name ?? 'Patient'}
          </Text>
          {isInProgress ? (
            <View style={[st.statusBadge, { backgroundColor: 'rgba(255,140,66,0.14)', flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
              <InProgressPulse />
              <Text style={[st.statusText, { color: '#FF8C42' }]}>In Progress</Text>
            </View>
          ) : (
            <View style={[st.statusBadge, { backgroundColor: urgencyBg }]}>
              <Text style={[st.statusText, { color: urgencyCol }]}>
                {appt.urgency ?? 'routine'}
              </Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Patient Hero Card */}
          <View style={[st.heroCard, { backgroundColor: t.bannerBg, borderColor: t.bannerBorder }]}>
            <View style={st.patientRow}>
              <View style={[st.avatarLg, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                <Text style={[st.avatarText, { color: t.accent }]}>
                  {patient?.full_name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.heroName}>{patient?.full_name ?? '—'}</Text>
                <Text style={[st.heroSub, { color: 'rgba(255,255,255,0.55)' }]}>
                  {[
                    patient?.gender ?? null,
                    age(patient?.date_of_birth ?? null),
                    patient?.blood_group ? `Blood: ${patient.blood_group}` : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                {patient?.phone && (
                  <Text style={[st.heroSub, { color: 'rgba(255,255,255,0.4)', marginTop: 2 }]}>{patient.phone}</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={isVirtual ? 'videocam-outline' : 'business-outline'} size={11} color={isVirtual ? '#85B7EB' : t.accent} />
                  <Text style={[st.typeChip, { color: isVirtual ? '#85B7EB' : t.accent }]}>
                    {isVirtual ? 'Virtual' : 'In-person'}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  {fmt12(appt.start_time)}
                </Text>
              </View>
            </View>

            {appt.reason && (
              <View style={[st.reasonBox, { borderTopColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={st.reasonLabel}>REASON FOR VISIT</Text>
                <Text style={st.reasonText}>{appt.reason}</Text>
              </View>
            )}
            {appt.symptom_description && (
              <View style={[st.reasonBox, { borderTopColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={st.reasonLabel}>SYMPTOMS</Text>
                <Text style={st.reasonText}>{appt.symptom_description}</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          {!isDone && (
            <View style={[st.pad, { marginBottom: 0 }]}>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                {isVirtual ? (
                  <TouchableOpacity
                    style={[st.actionBtn, { flex: 1, backgroundColor: '#0D2240', borderColor: 'rgba(91,158,255,0.35)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                    onPress={() => {
                      haptics.heavy()
                      navigation.navigate('DoctorVideoCall', {
                        appointmentId: appt.id,
                        patientName: patient?.full_name ?? 'Patient',
                      })
                    }}
                  >
                    <Ionicons name="videocam-outline" size={16} color="#85B7EB" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#85B7EB' }}>Start Video Call</Text>
                  </TouchableOpacity>
                ) : canStart ? (
                  <TouchableOpacity
                    style={[st.actionBtn, { flex: 1, backgroundColor: t.accentBg, borderColor: t.accentBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                    onPress={() => { haptics.heavy(); updateStatus('in_progress') }}
                    disabled={statusUpdating}
                  >
                    {statusUpdating ? (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>…</Text>
                    ) : (
                      <>
                        <Ionicons name="play" size={14} color={t.accent} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>Start Consultation</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}

                {canComplete && (
                  <TouchableOpacity
                    style={[st.actionBtn, { flex: 1, backgroundColor: t.accentBg, borderColor: t.accentBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                    onPress={() => Alert.alert(
                      'Complete consultation?',
                      'Mark this appointment as completed?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Complete', onPress: () => updateStatus('completed') },
                      ]
                    )}
                    disabled={statusUpdating}
                  >
                    {statusUpdating ? (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>…</Text>
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={14} color={t.accent} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>Complete</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {isDone && (
            <View style={[st.doneBanner, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
              <Ionicons name="checkmark-circle" size={20} color={t.accent} />
              <Text style={[st.doneTxt, { color: t.accent }]}>Consultation completed</Text>
            </View>
          )}

          {/* Vitals */}
          <View style={st.pad}>
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>
                VITALS
              </Text>

              <View style={st.vitalsGrid}>
                <VitalInput label="Weight (kg)" value={weight} onChange={setWeight} theme={t} keyboardType="decimal-pad" />
                <VitalInput label="Height (cm)" value={height} onChange={setHeight} theme={t} keyboardType="decimal-pad" />
                <VitalInput label="BP Systolic"  value={bpSys}  onChange={setBpSys}  theme={t} keyboardType="number-pad" />
                <VitalInput label="BP Diastolic" value={bpDia}  onChange={setBpDia}  theme={t} keyboardType="number-pad" />
                <VitalInput label="Blood Sugar (mg/dL)" value={bSugar} onChange={setBSugar} theme={t} keyboardType="decimal-pad" />
                <View style={[st.vitalBox, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                  <Text style={[st.vitalLabel, { color: t.accent }]}>BMI</Text>
                  <Text style={[st.vitalValue, { color: t.accent, fontSize: 20 }]}>{bmi ?? '—'}</Text>
                </View>
              </View>
            </View>

            {/* Clinical Notes */}
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <View style={st.sectionHeader}>
                <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomWidth: 0 }]}>
                  CLINICAL NOTES
                </Text>
                <Text style={{ fontSize: 10, color: t.textMuted }}>
                  {notes.length}/{NOTES_MAX}
                </Text>
              </View>
              <TextInput
                value={notes}
                onChangeText={v => setNotes(v.slice(0, NOTES_MAX))}
                placeholder="Enter clinical observations, findings, treatment plan…"
                placeholderTextColor={t.textMuted}
                multiline
                numberOfLines={5}
                style={[st.notesInput, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
                textAlignVertical="top"
                maxLength={NOTES_MAX}
              />
            </View>

            {/* Diagnosis */}
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <View style={st.sectionHeader}>
                <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomWidth: 0 }]}>
                  DIAGNOSIS
                </Text>
                <Text style={{ fontSize: 10, color: t.textMuted }}>
                  {diag.length}/{DIAG_MAX}
                </Text>
              </View>
              <TextInput
                value={diag}
                onChangeText={v => setDiag(v.slice(0, DIAG_MAX))}
                placeholder="ICD-10 code or diagnosis description…"
                placeholderTextColor={t.textMuted}
                multiline
                numberOfLines={3}
                style={[st.notesInput, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
                textAlignVertical="top"
                maxLength={DIAG_MAX}
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              onPress={saveVitalsAndNotes}
              disabled={saving}
              style={[st.saveBtn, { backgroundColor: t.accent, opacity: saving ? 0.6 : 1 }]}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : saved
                  ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={st.saveTxt}>Saved</Text>
                    </View>
                  : <Text style={st.saveTxt}>Save Vitals & Notes</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

function VitalInput({
  label, value, onChange, theme: t, keyboardType,
}: {
  label: string; value: string; onChange: (v: string) => void; theme: any; keyboardType?: any
}) {
  return (
    <View style={[st.vitalBox, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
      <Text style={[st.vitalLabel, { color: t.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
        placeholder="—"
        placeholderTextColor={t.textMuted}
        style={[st.vitalInput, { color: t.textPrimary }]}
      />
    </View>
  )
}

const st = StyleSheet.create({
  safe:          { flex: 1 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  backBtn:       { padding: 4 },
  backArrow:     { fontSize: 22 },
  headerTitle:   { flex: 1, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusText:    { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  heroCard:      { marginHorizontal: 16, borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 12 },
  patientRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatarLg:      { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarText:    { fontSize: 18, fontWeight: '800' },
  heroName:      { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroSub:       { fontSize: 12, marginTop: 2, lineHeight: 17 },
  typeChip:      { fontSize: 11, fontWeight: '700' },
  reasonBox:     { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  reasonLabel:   { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 4 },
  reasonText:    { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 19 },
  pad:           { paddingHorizontal: 16, marginBottom: 0 },
  actionBtn:     { padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  doneBanner:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 12 },
  doneTxt:       { fontSize: 14, fontWeight: '700' },
  section:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  sectionTitle:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  vitalsGrid:    { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 8 },
  vitalBox:      { width: '47%', borderRadius: 12, borderWidth: 1, padding: 12 },
  vitalLabel:    { fontSize: 10, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  vitalValue:    { fontSize: 18, fontWeight: '800' },
  vitalInput:    { fontSize: 18, fontWeight: '700', padding: 0 },
  notesInput:    { margin: 12, borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 13, lineHeight: 20, minHeight: 90 },
  saveBtn:       { marginHorizontal: 0, borderRadius: 14, padding: 15, alignItems: 'center', marginBottom: 12 },
  saveTxt:       { fontSize: 15, fontWeight: '800', color: '#fff' },
})
