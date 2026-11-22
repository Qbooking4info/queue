import { useState, useEffect, useRef, useCallback } from 'react'
import { View, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useFocusEffect } from '@react-navigation/native'
import { FollowUpModal } from '@queue/shared/components/FollowUpModal'
import { startConversation } from '@queue/shared/lib/chat'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { setConsultStatus, saveConsultVitalsAndNotes, bookFollowUp } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Stat, StatStrip,
  Journey, Btn, BottomBar, IconBtn, Empty, Initials, Mono, Pill, Notice,
} from '@queue/shared/components/q'

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
  queue_position:   number | null
  booking_ref:      string | null
  consult_started_at: string | null
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
const DIAG_MAX  = 500
const STEPS = ['Checked in', 'Called', 'In consult', 'Done']

function calcBMI(weightKg: string, heightCm: string): string | null {
  const w = parseFloat(weightKg)
  const h = parseFloat(heightCm) / 100
  if (!w || !h) return null
  return (w / (h * h)).toFixed(1)
}

function age(dob: string | null): string | null {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  const y = Math.floor(diff / (365.25 * 24 * 3600 * 1000))
  return y >= 0 && y < 130 ? String(y) : null
}

/** mm:ss since the consult was started, ticking. */
function useElapsed(startedAt: string | null): string | null {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  if (!startedAt) return null
  const ms = Date.now() - Date.parse(startedAt)
  if (!Number.isFinite(ms) || ms < 0) return null
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function PatientConsultScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { appointmentId } = route.params
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [appt,    setAppt]    = useState<ApptFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [vitalsAt, setVitalsAt] = useState<string | null>(null)

  const [weight, setWeight]   = useState('')
  const [height, setHeight]   = useState('')
  const [bpSys,  setBpSys]    = useState('')
  const [bpDia,  setBpDia]    = useState('')
  const [bSugar, setBSugar]   = useState('')
  const [notes,  setNotes]    = useState('')
  const [diag,   setDiag]     = useState('')
  const [saved,  setSaved]    = useState(false)
  const dirty = useRef(false)

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
        .select('weight_kg, height_cm, bp_systolic, bp_diastolic, blood_sugar, recorded_at')
        .eq('appointment_id', appointmentId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (data) {
      setAppt(data as ApptFull)
      // Only adopt the server's copy while the doctor has not typed over it --
      // a refocus mid-sentence used to wipe what they were writing.
      if (!dirty.current) {
        setNotes(data.doctor_notes ?? '')
        setDiag(data.diagnosis ?? '')
      }
    }
    if (vitals) {
      setWeight(vitals.weight_kg    != null ? String(vitals.weight_kg)    : '')
      setHeight(vitals.height_cm    != null ? String(vitals.height_cm)    : '')
      setBpSys( vitals.bp_systolic  != null ? String(vitals.bp_systolic)  : '')
      setBpDia( vitals.bp_diastolic != null ? String(vitals.bp_diastolic) : '')
      setBSugar(vitals.blood_sugar  != null ? String(vitals.blood_sugar)  : '')
      setVitalsAt((vitals as any).recorded_at ?? null)
    }
    setLoading(false)
  }

  // useFocusEffect (not a plain mount-only effect) so returning from the referral
  // screen re-fetches -- a referral sent from an in-progress consult completes it
  // server-side, and this screen needs to pick that status change up.
  useFocusEffect(useCallback(() => { fetchAppt() }, [appointmentId]))

  const elapsed = useElapsed(appt?.status === 'in_progress' ? appt?.consult_started_at ?? null : null)

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
      { notes, diagnosis: diag },
    )
    setSaving(false)
    if (!error) {
      haptics.success()
      dirty.current = false
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
      fetchAppt()
    } else {
      haptics.error()
      Alert.alert('Update failed', error)
    }
  }

  if (loading) {
    return (
      <Screen>
        <AppBar title="Consultation" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} size="large" />
        </View>
      </Screen>
    )
  }

  if (!appt) {
    return (
      <Screen>
        <AppBar title="Consultation" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 12 }}>
          <Empty icon="document-outline" title="Appointment not found"
            body="It may have been cancelled or moved." action="Go back" onAction={() => navigation.goBack()} />
        </Card>
      </Screen>
    )
  }

  const patient     = appt.patient
  const isVirtual   = appt.type === 'virtual'
  const canStart    = ['pending', 'confirmed', 'checked_in'].includes(appt.status) && !isVirtual
  const isInProgress = appt.status === 'in_progress'
  const isDone      = appt.status === 'completed'
  // Vitals only mean anything once the patient has actually been checked in.
  const canRecordVitals = appt.status === 'checked_in' || isInProgress
  const bmi = calcBMI(weight, height)
  const isEmergency = appt.urgency === 'emergency'

  const step = isDone ? 3 : isInProgress ? 2 : appt.status === 'checked_in' ? 1 : 0
  const subline = [
    age(patient?.date_of_birth ?? null),
    patient?.gender,
    patient?.blood_group ? `blood ${patient.blood_group}` : null,
    isEmergency ? 'brought forward' : null,
  ].filter(Boolean).join(' · ')

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar
          title={appt.queue_position != null ? `Number ${appt.queue_position}` : (patient?.full_name ?? 'Consultation')}
          sub={appt.booking_ref ?? undefined}
          onBack={() => navigation.goBack()}
          right={patient?.id
            ? <IconBtn name="chatbubble-outline" label="Message patient" onPress={async () => {
                const r = await startConversation('patient', patient.id, appt.id)
                if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
                else { haptics.error(); Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error) }
              }} />
            : undefined} />

        <Body>
          <Card style={{ marginTop: 12 }}>
            <Row
              leading={<Initials name={patient?.full_name} size={44} tint={isEmergency ? '#7F1D1D' : '#7C2D12'} />}
              title={patient?.full_name ?? 'Patient'}
              titleColor={isEmergency ? t.q.red : undefined}
              sub={subline || null}
              pill={isEmergency ? 'Emergency' : isVirtual ? 'Video' : 'In person'}
              pillTone={isEmergency ? 'red' : isVirtual ? 'teal' : 'neutral'}
              pillSolid={isEmergency}
              right={<Mono size={12} color={t.q.ink60}>{appt.start_time?.slice(0, 5)}</Mono>} />
            {!!patient?.phone && (
              <>
                <Hair />
                <Row compact icon="call-outline" title={patient.phone} sub="Patient's phone" />
              </>
            )}
            <Hair />
            <Row compact icon="person-outline" title="Full patient record"
              sub="Vitals history, allergies, medications" chevron
              onPress={() => navigation.navigate('PatientDetails', { appointmentId: appt.id })} />
          </Card>

          <Journey label="This visit" steps={STEPS} activeIndex={step} />

          {!!appt.referred_by && (
            <>
              <SectionHead title="Referred to you" />
              <Card>
                <Row
                  icon="arrow-redo-outline" iconTone="teal"
                  title={[appt.referred_by.title, appt.referred_by.full_name].filter(Boolean).join(' ')}
                  sub={[appt.referring_clinic?.name, appt.referring_hospital?.name].filter(Boolean).join(' · ') || null} />
                {!!appt.referral_reason && (
                  <>
                    <Hair />
                    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink }}>{appt.referral_reason}</Text>
                    </View>
                  </>
                )}
              </Card>
            </>
          )}

          {!!(appt.reason || appt.symptom_description) && (
            <>
              <SectionHead title="Reason for visit" />
              <Card>
                <View style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
                  {!!appt.reason && <Text style={{ fontSize: 14, lineHeight: 20, color: t.q.ink }}>{appt.reason}</Text>}
                  {!!appt.symptom_description && (
                    <>
                      <CardLabel>Symptoms</CardLabel>
                      <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink70 }}>{appt.symptom_description}</Text>
                    </>
                  )}
                </View>
              </Card>
            </>
          )}

          <SectionHead title={vitalsAt
            ? `Vitals · recorded ${new Date(vitalsAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}`
            : 'Vitals'} />
          {canRecordVitals ? (
            <Card>
              <StatStrip>
                <Stat label="BP" value={bpSys && bpDia ? `${bpSys}/${bpDia}` : '—'} unit={bpSys && bpDia ? 'mmHg' : undefined} />
                <Stat label="Blood sugar" value={bSugar || '—'} unit={bSugar ? 'mg/dL' : undefined} />
                <Stat label="BMI" value={bmi ?? '—'} note={weight ? `${weight} kg` : 'no weight'} last />
              </StatStrip>
              <Hair inset={0} />
              <View style={{ padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <VitalField label="Weight (kg)" value={weight} onChange={v => { dirty.current = true; setWeight(v) }} keyboardType="decimal-pad" />
                  <VitalField label="Height (cm)" value={height} onChange={v => { dirty.current = true; setHeight(v) }} keyboardType="decimal-pad" />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <VitalField label="BP systolic" value={bpSys} onChange={v => { dirty.current = true; setBpSys(v) }} keyboardType="number-pad" />
                  <VitalField label="BP diastolic" value={bpDia} onChange={v => { dirty.current = true; setBpDia(v) }} keyboardType="number-pad" />
                </View>
                <VitalField label="Blood sugar (mg/dL)" value={bSugar} onChange={v => { dirty.current = true; setBSugar(v) }} keyboardType="decimal-pad" />
              </View>
            </Card>
          ) : (
            <Notice tone="neutral" icon="information-circle-outline">
              Vitals can be recorded once the patient is checked in at the front desk.
            </Notice>
          )}

          <SectionHead title="Clinical notes" />
          <Card>
            <View style={{ padding: 14, gap: 12 }}>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <CardLabel style={{ flex: 1 }}>Findings and plan</CardLabel>
                  <Mono size={11} color={t.q.ink60}>{notes.length}/{NOTES_MAX}</Mono>
                </View>
                <TextInput
                  value={notes}
                  onChangeText={v => { dirty.current = true; setNotes(v.slice(0, NOTES_MAX)) }}
                  placeholder="Observations, findings, treatment plan…"
                  placeholderTextColor={t.q.ink60}
                  multiline textAlignVertical="top" maxLength={NOTES_MAX}
                  accessibilityLabel="Findings and plan"
                  style={{
                    minHeight: 120, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                    backgroundColor: t.q.field, padding: 12, fontSize: 14, lineHeight: 20, color: t.q.ink,
                  }} />
              </View>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <CardLabel style={{ flex: 1 }}>Diagnosis</CardLabel>
                  <Mono size={11} color={t.q.ink60}>{diag.length}/{DIAG_MAX}</Mono>
                </View>
                <TextInput
                  value={diag}
                  onChangeText={v => { dirty.current = true; setDiag(v.slice(0, DIAG_MAX)) }}
                  placeholder="ICD-10 code or description…"
                  placeholderTextColor={t.q.ink60}
                  multiline textAlignVertical="top" maxLength={DIAG_MAX}
                  accessibilityLabel="Diagnosis"
                  style={{
                    minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                    backgroundColor: t.q.field, padding: 12, fontSize: 14, lineHeight: 20, color: t.q.ink,
                  }} />
              </View>
              <Btn label={saved ? 'Saved' : 'Save notes'} icon={saved ? 'checkmark' : undefined}
                loading={saving} onPress={saveVitalsAndNotes} />
            </View>
          </Card>

          {!isDone && (
            <>
              <SectionHead title="During this consultation" />
              <Card>
                {isVirtual && (
                  <>
                    <Row icon="videocam-outline" iconTone="teal" title="Start video call"
                      sub="Opens the consultation room" chevron
                      onPress={() => {
                        haptics.heavy()
                        navigation.navigate('DoctorVideoCall', { appointmentId: appt.id, patientName: patient?.full_name ?? 'Patient' })
                      }} />
                    <Hair />
                  </>
                )}
                <Row icon="arrow-redo-outline" title={isInProgress ? 'Refer & end consultation' : 'Refer patient'}
                  sub="To another clinic or hospital" chevron
                  onPress={() => navigation.navigate('ReferPatient', {
                    appointmentId: appt.id,
                    patientName: patient?.full_name ?? 'Patient',
                    ownHospitalId: appt.hospital_id,
                    isInProgress,
                  })} />
                <Hair />
                <Row icon="medkit-outline" iconTone="red" title="Request ambulance"
                  sub="Transfer out of this clinic" titleColor={t.q.red} chevron
                  onPress={() => navigation.navigate('RequestAmbulance', {
                    patientId: appt.patient_id,
                    patientName: patient?.full_name ?? 'Patient',
                    patientPhone: patient?.phone ?? null,
                  })} />
                <Hair />
                <Row icon="calendar-outline" title="Book follow-up"
                  sub="Their next visit at this hospital" chevron
                  onPress={() => setShowFollowUp(true)} />
                <Hair />
                <Row icon="checkbox-outline" iconTone="teal" title="Care plan"
                  sub="Daily tasks the patient follows at home" chevron
                  onPress={() => navigation.navigate('CarePlanCompose', {
                    patientId: appt.patient_id,
                    patientName: patient?.full_name,
                  })} />
              </Card>
            </>
          )}

          {isDone && (
            <>
              <Notice tone="green" icon="checkmark-circle">
                Consultation completed. The patient sees the plan you send in My care.
              </Notice>
              <Card>
                <Row icon="document-text-outline" iconTone="teal" title="Consultation plan"
                  sub="Diagnosis, prescriptions, tests and follow-up" chevron
                  onPress={() => navigation.navigate('ConsultationPlan', { appointmentId, patientName: patient?.full_name })} />
                <Hair />
                <Row icon="checkbox-outline" title="Care plan"
                  sub="Daily tasks the patient follows at home" chevron
                  onPress={() => navigation.navigate('CarePlanCompose', { patientId: appt.patient_id, patientName: patient?.full_name })} />
              </Card>
            </>
          )}
        </Body>

        {!isDone && (
          <BottomBar meta={<>
            <Mono size={12} weight="600" color={isInProgress ? t.q.primary : t.q.ink60}>
              {isInProgress ? `In consult${elapsed ? ` · ${elapsed}` : ''}` : 'Not started'}
            </Mono>
            {isEmergency && (
              <>
                <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
                <Pill label="Emergency" tone="red" solid />
              </>
            )}
          </>}>
            {canStart && (
              <Btn grow label="Start consultation" icon="play" loading={statusUpdating}
                onPress={() => { haptics.heavy(); updateStatus('in_progress') }} />
            )}
            {isInProgress && (
              <Btn grow label="Complete consultation" icon="checkmark" loading={statusUpdating}
                onPress={() => Alert.alert('Complete consultation?', 'Mark this appointment as completed?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Complete', onPress: () => updateStatus('completed') },
                ])} />
            )}
            {isInProgress && (
              <Btn label="Plan" variant="secondary"
                onPress={() => navigation.navigate('ConsultationPlan', { appointmentId, patientName: patient?.full_name })} />
            )}
            {!canStart && !isInProgress && (
              <Btn grow label="Waiting for check-in" variant="secondary" disabled onPress={() => {}} />
            )}
          </BottomBar>
        )}
      </Screen>

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

function VitalField({ label, value, onChange, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void; keyboardType?: any
}) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: t.q.ink70 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} keyboardType={keyboardType ?? 'default'}
        placeholder="—" placeholderTextColor={t.q.ink60} accessibilityLabel={label}
        style={{
          minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: t.q.line,
          backgroundColor: t.q.field, paddingHorizontal: 12, fontSize: 16, fontWeight: '600', color: t.q.ink,
        }} />
    </View>
  )
}
