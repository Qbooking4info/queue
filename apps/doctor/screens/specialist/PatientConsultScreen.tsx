import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { setConsultStatus, saveConsultVitalsAndNotes, bookFollowUp } from '@queue/shared/lib/api'
import { useReducedMotion } from '@queue/shared/hooks/useReducedMotion'
import { FollowUpModal } from '@queue/shared/components/FollowUpModal'

interface Props { navigation: any; route: { params: { appointmentId: string } } }

interface PatientRow { id: string; full_name: string; phone: string | null; date_of_birth: string | null; gender: string | null; blood_group: string | null }
interface DoctorRow { full_name: string; title: string | null }
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
  investigations?:  string | null
  prescription?:    string | null
  treatment_plan?:  string | null
  queue_position:   number | null
  patient_id:       string
  patient:          PatientRow | null
  referral_reason?:  string | null
  referred_by?:      DoctorRow | null
  referring_hospital?: { name: string } | null
  referring_clinic?:   { name: string } | null
  hospital_id:       string
  doctor_id?:        string | null
  assigned_doctor_id?: string | null
}

const NOTES_MAX = 1000
const ITEM_MAX  = 200

let itemSeq = 0
function nextItemId() { return ++itemSeq }

interface TextItem { id: number; text: string }
interface InvItem  { id: number; text: string; isImaging: boolean; bodyPart: string }
interface RxItem   { id: number; drug: string; dosage: string }

const COMMON_DIAGNOSES = [
  'Malaria', 'Hypertension', 'Type 2 Diabetes Mellitus', 'Upper Respiratory Tract Infection',
  'Urinary Tract Infection', 'Typhoid Fever', 'Peptic Ulcer Disease', 'Gastroenteritis',
  'Anaemia', 'Asthma', 'Pneumonia',
]
const COMMON_LABS = [
  'Full Blood Count', 'Malaria RDT', 'Urinalysis', 'Random Blood Sugar', 'Widal Test',
  'HIV Screening', 'Genotype', 'Stool Microscopy', 'Liver Function Test', 'Renal Function Test',
]
const COMMON_IMAGING = ['X-Ray', 'Ultrasound', 'CT Scan', 'MRI', 'Echocardiogram']
const COMMON_PLANS = [
  'Admit to Ward', 'Admit for Observation', 'Refer for Specialist Review',
  'Discharge Home', 'Bed Rest Advised', 'Follow-up in 1 Week',
]

function parseTextItems(value: string | null | undefined): TextItem[] {
  const lines = (value ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  return lines.length ? lines.map(text => ({ id: nextItemId(), text })) : [{ id: nextItemId(), text: '' }]
}
function serializeTextItems(items: TextItem[]): string {
  return items.map(i => i.text.trim()).filter(Boolean).join('\n')
}

function parseInvItems(value: string | null | undefined): InvItem[] {
  const lines = (value ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return [{ id: nextItemId(), text: '', isImaging: false, bodyPart: '' }]
  return lines.map(line => {
    const sep = line.indexOf(' — ')
    if (sep === -1) return { id: nextItemId(), text: line, isImaging: false, bodyPart: '' }
    return { id: nextItemId(), text: line.slice(0, sep), isImaging: true, bodyPart: line.slice(sep + 3) }
  })
}
function serializeInvItems(items: InvItem[]): string {
  return items.map(i => {
    const name = i.text.trim()
    if (!name) return null
    return i.isImaging && i.bodyPart.trim() ? `${name} — ${i.bodyPart.trim()}` : name
  }).filter(Boolean).join('\n')
}

function parseRxItems(value: string | null | undefined): RxItem[] {
  const lines = (value ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return [{ id: nextItemId(), drug: '', dosage: '' }]
  return lines.map(line => {
    const sep = line.indexOf(' — ')
    return sep === -1
      ? { id: nextItemId(), drug: line, dosage: '' }
      : { id: nextItemId(), drug: line.slice(0, sep), dosage: line.slice(sep + 3) }
  })
}
function serializeRxItems(items: RxItem[]): string {
  return items.map(i => {
    const drug = i.drug.trim()
    if (!drug) return null
    return i.dosage.trim() ? `${drug} — ${i.dosage.trim()}` : drug
  }).filter(Boolean).join('\n')
}

// Tapping a common-option chip fills the trailing blank row instead of always
// appending, so picking one right after the screen loads (a single empty row)
// doesn't leave a stray blank item above it.
function appendOrFill<T extends { id: number; text: string }>(list: T[], item: T): T[] {
  const lastIdx = list.length - 1
  if (lastIdx >= 0 && !list[lastIdx].text.trim()) {
    const copy = [...list]
    copy[lastIdx] = { ...item, id: copy[lastIdx].id }
    return copy
  }
  return [...list, item]
}

function ChipRow({ options, onPick, theme: t }: { options: string[]; onPick: (v: string) => void; theme: any }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map(opt => (
        <TouchableOpacity key={opt} onPress={() => onPick(opt)}
          style={[st.chip, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.textPrimary }}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

function AddItemButton({ label, onPress, theme: t }: { label: string; onPress: () => void; theme: any }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.addBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
      <Ionicons name="add" size={15} color={t.accent} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>{label}</Text>
    </TouchableOpacity>
  )
}

function calcBMI(weightKg: string, heightCm: string): string | null {
  const w = parseFloat(weightKg)
  const h = parseFloat(heightCm) / 100
  if (!w || !h) return null
  return (w / (h * h)).toFixed(1)
}

function age(dob: string | null): string | null {
  if (!dob) return null
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
  const reduceMotion = useReducedMotion()

  // Indefinite loop with no stop control (WCAG 2.2.2) -- gated behind reduce-motion since
  // the dot's color already marks "in progress" without the pulse.
  useEffect(() => {
    if (reduceMotion) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [reduceMotion])

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
  const [diagItems, setDiagItems] = useState<TextItem[]>(() => parseTextItems(''))
  const [invItems,  setInvItems]  = useState<InvItem[]>(() => parseInvItems(''))
  const [rxItems,   setRxItems]   = useState<RxItem[]>(() => parseRxItems(''))
  const [planItems, setPlanItems] = useState<TextItem[]>(() => parseTextItems(''))

  const [saved,  setSaved]    = useState(false)
  const [showFollowUp, setShowFollowUp] = useState(false)

  async function fetchAppt() {
    const [{ data }, { data: vitals }] = await Promise.all([
      supabase
        .from('appointments')
        .select(`
          *, patient:users!appointments_patient_id_fkey(id, full_name, phone, date_of_birth, gender, blood_group),
          referred_by:doctors!appointments_referred_by_doctor_id_fkey(full_name, title),
          referring_hospital:hospitals!appointments_referring_hospital_id_fkey(name),
          referring_clinic:hospital_clinics!appointments_referring_clinic_id_fkey(name)
        `)
        .eq('id', appointmentId)
        .single(),
      // Vitals live in vitals_audit_log, not on appointments (denormalised
      // columns were dropped in 20260719000004_normalize_vitals.sql) -- front
      // desk can record more than once per visit, so the latest entry wins.
      supabase
        .from('vitals_audit_log')
        .select('weight_kg, height_cm, bp_systolic, bp_diastolic, blood_sugar')
        .eq('appointment_id', appointmentId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (data) {
      setAppt(data as ApptFull)
      setNotes(data.doctor_notes ?? '')
      setDiagItems(parseTextItems(data.diagnosis))
      setInvItems(parseInvItems(data.investigations))
      setRxItems(parseRxItems(data.prescription))
      setPlanItems(parseTextItems(data.treatment_plan))
    }
    if (vitals) {
      setWeight(vitals.weight_kg    != null ? String(vitals.weight_kg)    : '')
      setHeight(vitals.height_cm    != null ? String(vitals.height_cm)    : '')
      setBpSys( vitals.bp_systolic  != null ? String(vitals.bp_systolic)  : '')
      setBpDia( vitals.bp_diastolic != null ? String(vitals.bp_diastolic) : '')
      setBSugar(vitals.blood_sugar  != null ? String(vitals.blood_sugar)  : '')
    }
    setLoading(false)
  }

  // useFocusEffect (not a plain mount-only effect) so returning from the referral
  // screen re-fetches -- a referral sent from an in-progress consult completes it
  // server-side, and this screen needs to pick that status change up.
  useFocusEffect(useCallback(() => { fetchAppt() }, [appointmentId]))

  async function saveVitalsAndNotes() {
    setSaving(true)
    const { error } = await saveConsultVitalsAndNotes(
      appointmentId,
      canRecordVitals ? {
        weight_kg:    parseFloat(weight) || null,
        height_cm:    parseFloat(height) || null,
        bp_systolic:  parseInt(bpSys)    || null,
        bp_diastolic: parseInt(bpDia)    || null,
        blood_sugar:  parseFloat(bSugar) || null,
      } : null,
      {
        notes,
        diagnosis: serializeTextItems(diagItems),
        investigations: serializeInvItems(invItems),
        prescription: serializeRxItems(rxItems),
        treatmentPlan: serializeTextItems(planItems),
      },
    )

    setSaving(false)
    if (!error) {
      haptics.success()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      fetchAppt()
    } else {
      haptics.error()
      Alert.alert('Save failed', error)
    }
  }

  async function updateStatus(newStatus: 'in_progress' | 'completed') {
    setStatusUpdating(true)

    const { error } = await setConsultStatus(appointmentId, newStatus)

    setStatusUpdating(false)
    if (!error) {
      if (newStatus === 'completed') haptics.success()
      setAppt(prev => prev ? { ...prev, status: newStatus } : prev)
    } else {
      haptics.error()
      Alert.alert('Update failed', error)
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
  // Vitals only mean anything once the patient has actually been checked in --
  // Clinical Notes/Diagnosis/Save stay available regardless (out of scope here).
  const canRecordVitals = appt.status === 'checked_in' || isInProgress
  const bmi = calcBMI(weight, height)

  const isEmergency = appt.urgency === 'emergency'
  const urgencyBg  = isEmergency ? t.dangerSubtle
    : appt.urgency === 'urgent' ? 'rgba(239,159,39,0.12)' : t.accentBg
  const urgencyCol = isEmergency ? t.danger
    : appt.urgency === 'urgent' ? t.statusBusy.text : t.accent

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" style={st.backBtn}>
            <Ionicons name="arrow-back" size={22} color={t.textMuted} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: t.textPrimary }]} numberOfLines={1}>
            {patient?.full_name ?? 'Patient'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isEmergency && (
              <View style={[st.statusBadge, { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.danger }]}>
                <Ionicons name="alert-circle-outline" size={10} color={t.danger} />
                <Text style={[st.statusText, { color: t.danger }]}>EMERGENCY</Text>
              </View>
            )}
            {isInProgress ? (
              <View style={[st.statusBadge, { backgroundColor: 'rgba(255,140,66,0.14)', flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                <InProgressPulse />
                <Text style={[st.statusText, { color: '#FF8C42' }]}>In Progress</Text>
              </View>
            ) : !isEmergency && (
              <View style={[st.statusBadge, { backgroundColor: urgencyBg }]}>
                <Text style={[st.statusText, { color: urgencyCol }]}>
                  {appt.urgency ?? 'routine'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Patient Hero Card */}
          <View style={[st.heroCard, {
            backgroundColor: isEmergency ? t.dangerSubtle : t.bannerBg,
            borderColor: isEmergency ? t.danger : t.bannerBorder,
          }]}>
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
                  <Ionicons name={isVirtual ? 'videocam-outline' : 'business-outline'} size={11} color={isVirtual ? t.statusVirtual.text : t.accent} />
                  <Text style={[st.typeChip, { color: isVirtual ? t.statusVirtual.text : t.accent }]}>
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
            {appt.referred_by && (
              <View style={[st.reasonBox, { borderTopColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={st.reasonLabel}>REFERRED BY</Text>
                <Text style={st.reasonText}>
                  {[appt.referred_by.title, appt.referred_by.full_name].filter(Boolean).join(' ')}
                  {appt.referring_clinic?.name ? ` · ${appt.referring_clinic.name}` : ''}
                  {appt.referring_hospital?.name ? ` · ${appt.referring_hospital.name}` : ''}
                </Text>
                {appt.referral_reason && (
                  <Text style={[st.reasonText, { marginTop: 4, opacity: 0.85 }]}>{appt.referral_reason}</Text>
                )}
              </View>
            )}
          </View>

          {/* Refer to another clinic/hospital */}
          {!isDone && (
            <View style={st.pad}>
              <TouchableOpacity
                onPress={() => navigation.navigate('ReferPatient', {
                  appointmentId: appt.id,
                  patientName: patient?.full_name ?? 'Patient',
                  ownHospitalId: appt.hospital_id,
                  isInProgress,
                })}
                style={[st.referBtn, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Ionicons name="arrow-redo-outline" size={15} color={t.textPrimary} />
                <Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: '700' }}>
                  {isInProgress ? 'Refer & End Consultation' : 'Refer to Another Hospital'}
                </Text>
              </TouchableOpacity>

              {/* Emergency transfer -- a doctor mid-consult realizing a patient needs
                  moving somewhere with more capability than a referral note implies. */}
              <TouchableOpacity
                onPress={() => navigation.navigate('RequestAmbulance', {
                  patientId: appt.patient_id,
                  patientName: patient?.full_name ?? 'Patient',
                  patientPhone: patient?.phone ?? null,
                })}
                style={[st.referBtn, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginTop: 10 }]}>
                <Ionicons name="medkit-outline" size={15} color={t.danger} />
                <Text style={{ color: t.danger, fontSize: 13, fontWeight: '700' }}>Request Ambulance</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Actions */}
          {!isDone && (
            <View style={[st.pad, { marginBottom: 0 }]}>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                {isVirtual ? (
                  <TouchableOpacity
                    style={[st.actionBtn, { flex: 1, backgroundColor: '#0D2240', borderColor: t.infoBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                    onPress={() => {
                      haptics.heavy()
                      navigation.navigate('DoctorVideoCall', {
                        appointmentId: appt.id,
                        patientName: patient?.full_name ?? 'Patient',
                      })
                    }}
                  >
                    <Ionicons name="videocam-outline" size={16} color={t.statusVirtual.text} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: t.statusVirtual.text }}>Start Video Call</Text>
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
            <View style={st.pad}>
              <View style={[st.doneBanner, { backgroundColor: t.accentBg, borderColor: t.accentBorder, marginHorizontal: 0 }]}>
                <Ionicons name="checkmark-circle" size={20} color={t.accent} />
                <Text style={[st.doneTxt, { color: t.accent }]}>Consultation completed</Text>
              </View>
              {isVirtual && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('ConsultationPlan', { appointmentId: appt.id, patientName: patient?.full_name ?? 'Patient' })}
                  style={[st.referBtn, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <Ionicons name="document-text-outline" size={15} color={t.textPrimary} />
                  <Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: '700' }}>
                    {(appt.diagnosis || appt.investigations || appt.treatment_plan) ? 'View/Edit Consultation Plan' : 'Share Consultation Plan'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Vitals */}
          <View style={st.pad}>
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>
                VITALS
              </Text>

              {canRecordVitals ? (
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
              ) : (
                <Text style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', paddingVertical: 4 }}>
                  Vitals can be recorded once the patient is checked in.
                </Text>
              )}
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
              <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>DIAGNOSIS</Text>
              <View style={{ padding: 12, gap: 8 }}>
                {diagItems.map(item => (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      value={item.text}
                      onChangeText={v => setDiagItems(list => list.map(i => i.id === item.id ? { ...i, text: v.slice(0, ITEM_MAX) } : i))}
                      placeholder="e.g. Malaria, or an ICD-10 code…"
                      placeholderTextColor={t.textMuted}
                      style={[st.itemInput, { flex: 1, color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
                    />
                    {diagItems.length > 1 && (
                      <TouchableOpacity onPress={() => setDiagItems(list => list.filter(i => i.id !== item.id))} accessibilityLabel="Remove diagnosis" hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={t.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <ChipRow theme={t} options={COMMON_DIAGNOSES} onPick={text => setDiagItems(list => appendOrFill(list, { id: nextItemId(), text }))} />
                <AddItemButton theme={t} label="Add diagnosis" onPress={() => setDiagItems(list => [...list, { id: nextItemId(), text: '' }])} />
              </View>
            </View>

            {/* Investigations */}
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>INVESTIGATIONS</Text>
              <View style={{ padding: 12, gap: 8 }}>
                {invItems.map(item => (
                  <View key={item.id} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        value={item.text}
                        onChangeText={v => setInvItems(list => list.map(i => i.id === item.id ? { ...i, text: v.slice(0, ITEM_MAX) } : i))}
                        placeholder="Lab test or imaging study…"
                        placeholderTextColor={t.textMuted}
                        style={[st.itemInput, { flex: 1, color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
                      />
                      <TouchableOpacity
                        onPress={() => setInvItems(list => list.map(i => i.id === item.id ? { ...i, isImaging: !i.isImaging } : i))}
                        style={[st.imagingToggle, { borderColor: item.isImaging ? t.accent : t.cardBorder, backgroundColor: item.isImaging ? `${t.accent}18` : 'transparent' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: item.isImaging ? t.accent : t.textMuted }}>Imaging</Text>
                      </TouchableOpacity>
                      {invItems.length > 1 && (
                        <TouchableOpacity onPress={() => setInvItems(list => list.filter(i => i.id !== item.id))} accessibilityLabel="Remove investigation" hitSlop={8}>
                          <Ionicons name="close-circle" size={20} color={t.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {item.isImaging && (
                      <TextInput
                        value={item.bodyPart}
                        onChangeText={v => setInvItems(list => list.map(i => i.id === item.id ? { ...i, bodyPart: v.slice(0, ITEM_MAX) } : i))}
                        placeholder="Part of body, e.g. Chest, Abdomen…"
                        placeholderTextColor={t.textMuted}
                        style={[st.itemInput, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder, marginLeft: 12 }]}
                      />
                    )}
                  </View>
                ))}
                <Text style={[st.chipGroupLabel, { color: t.textMuted }]}>COMMON LABS</Text>
                <ChipRow theme={t} options={COMMON_LABS} onPick={text => setInvItems(list => appendOrFill(list, { id: nextItemId(), text, isImaging: false, bodyPart: '' }))} />
                <Text style={[st.chipGroupLabel, { color: t.textMuted }]}>COMMON IMAGING</Text>
                <ChipRow theme={t} options={COMMON_IMAGING} onPick={text => setInvItems(list => appendOrFill(list, { id: nextItemId(), text, isImaging: true, bodyPart: '' }))} />
                <AddItemButton theme={t} label="Add investigation" onPress={() => setInvItems(list => [...list, { id: nextItemId(), text: '', isImaging: false, bodyPart: '' }])} />
              </View>
            </View>

            {/* Prescription */}
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>PRESCRIPTION</Text>
              <View style={{ padding: 12, gap: 8 }}>
                {rxItems.map(item => (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      value={item.drug}
                      onChangeText={v => setRxItems(list => list.map(i => i.id === item.id ? { ...i, drug: v.slice(0, ITEM_MAX) } : i))}
                      placeholder="Medication…"
                      placeholderTextColor={t.textMuted}
                      style={[st.itemInput, { flex: 1, color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
                    />
                    <TextInput
                      value={item.dosage}
                      onChangeText={v => setRxItems(list => list.map(i => i.id === item.id ? { ...i, dosage: v.slice(0, ITEM_MAX) } : i))}
                      placeholder="Dosage / duration…"
                      placeholderTextColor={t.textMuted}
                      style={[st.itemInput, { flex: 1, color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
                    />
                    {rxItems.length > 1 && (
                      <TouchableOpacity onPress={() => setRxItems(list => list.filter(i => i.id !== item.id))} accessibilityLabel="Remove medication" hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={t.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <AddItemButton theme={t} label="Add medication" onPress={() => setRxItems(list => [...list, { id: nextItemId(), drug: '', dosage: '' }])} />
              </View>
            </View>

            {/* Other Plans */}
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>OTHER PLANS</Text>
              <View style={{ padding: 12, gap: 8 }}>
                {planItems.map(item => (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      value={item.text}
                      onChangeText={v => setPlanItems(list => list.map(i => i.id === item.id ? { ...i, text: v.slice(0, ITEM_MAX) } : i))}
                      placeholder="e.g. Admit to Ward…"
                      placeholderTextColor={t.textMuted}
                      style={[st.itemInput, { flex: 1, color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
                    />
                    {planItems.length > 1 && (
                      <TouchableOpacity onPress={() => setPlanItems(list => list.filter(i => i.id !== item.id))} accessibilityLabel="Remove plan item" hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={t.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <ChipRow theme={t} options={COMMON_PLANS} onPick={text => setPlanItems(list => appendOrFill(list, { id: nextItemId(), text }))} />
                <AddItemButton theme={t} label="Add plan item" onPress={() => setPlanItems(list => [...list, { id: nextItemId(), text: '' }])} />

                <View style={[st.divider, { backgroundColor: t.cardBorder }]} />
                <TouchableOpacity onPress={() => setShowFollowUp(true)}
                  style={[st.addBtn, { borderColor: t.infoBorder, backgroundColor: 'rgba(90,160,255,0.12)' }]}>
                  <Ionicons name="calendar-outline" size={15} color={t.info} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: t.info }}>Book Follow-up Appointment</Text>
                </TouchableOpacity>
              </View>
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

      {showFollowUp && (
        <FollowUpModal
          patientName={patient?.full_name}
          onClose={() => setShowFollowUp(false)}
          onConfirm={async d => {
            const res = await bookFollowUp(appt.id, d)
            return res.ok ? null : res.error
          }}
        />
      )}
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
  referBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
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
  itemInput:     { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  imagingToggle: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  chipGroupLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },
  chip:          { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, borderWidth: 1, paddingVertical: 10, marginTop: 2 },
  divider:       { height: 1, marginVertical: 4 },
  saveBtn:       { marginHorizontal: 0, borderRadius: 14, padding: 15, alignItems: 'center', marginBottom: 12 },
  saveTxt:       { fontSize: 15, fontWeight: '800', color: '#fff' },
})
