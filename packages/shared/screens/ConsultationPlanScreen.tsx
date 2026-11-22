import { useState, useCallback } from 'react'
import { View, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '../components/ui/Typography'
import { useTheme } from '../contexts/ThemeContext'
import { Alert } from '../contexts/AlertContext'
import { supabase } from '../lib/supabase'
import { haptics } from '../lib/haptics'
import { saveConsultationPlan } from '../lib/api'
import {
  getPrescriptions, getTestOrders, addPrescription, addTestOrder,
  cancelPrescription, cancelTestOrder, prescriptionLine,
  type Prescription, type TestOrder, type OrderScope,
} from '../lib/clinical-orders'
import {
  Screen, AppBar, Body, Card, CardLabel, Hair, SectionHead, Btn, BottomBar,
  Mono, Notice, Row, Field, Chip, Empty, IconBtn,
} from '../components/q'

interface Props {
  navigation: any
  route: { params: { appointmentId: string; patientName?: string } }
}

const FIELD_MAX = 800

/**
 * What the doctor sends the patient at the end of a consultation: the
 * diagnosis, the drugs, the tests, and a plan in words.
 *
 * Drugs and tests are rows now (prescriptions, test_orders -- 20261121000005)
 * rather than prose inside treatment_plan. That is the difference between a
 * patient reading a paragraph and a patient seeing a list they can tick off,
 * a pharmacy being able to mark something dispensed, and a laboratory result
 * having an order to attach itself to.
 *
 * The three free-text fields stay. Not everything a clinician needs to say
 * fits a row, and "investigations" still carries the reasoning that the test
 * list cannot.
 */
export function ConsultationPlanScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { appointmentId, patientName } = route.params

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [diagnosis,      setDiagnosis]      = useState('')
  const [investigations, setInvestigations] = useState('')
  const [treatmentPlan,  setTreatmentPlan]  = useState('')

  const [scope, setScope] = useState<OrderScope | null>(null)
  const [drugs, setDrugs] = useState<Prescription[]>([])
  const [tests, setTests] = useState<TestOrder[]>([])
  const [busy, setBusy] = useState(false)

  // Add-a-drug form
  const [showDrug, setShowDrug] = useState(false)
  const [drugName, setDrugName] = useState('')
  const [dose, setDose] = useState('')
  const [frequency, setFrequency] = useState('')
  const [durationDays, setDurationDays] = useState('')

  // Order-a-test form
  const [showTest, setShowTest] = useState(false)
  const [testName, setTestName] = useState('')
  const [testUrgency, setTestUrgency] = useState<'routine' | 'urgent' | 'stat'>('routine')

  // Re-read on focus rather than once on mount: the doctor can leave to check
  // something and come back, and a stale copy would silently overwrite whatever
  // was saved in between.
  useFocusEffect(useCallback(() => {
    let cancelled = false
    ;(async () => {
      const [{ data }, rx, orders] = await Promise.all([
        supabase
          .from('appointments')
          .select('diagnosis, investigations, treatment_plan, patient_id, hospital_id, doctor_id')
          .eq('id', appointmentId)
          .single(),
        getPrescriptions(appointmentId),
        getTestOrders(appointmentId),
      ])
      if (cancelled) return
      if (data) {
        setDiagnosis((data as any).diagnosis ?? '')
        setInvestigations((data as any).investigations ?? '')
        setTreatmentPlan((data as any).treatment_plan ?? '')
        setScope({
          appointmentId,
          patientId:  (data as any).patient_id ?? null,
          hospitalId: (data as any).hospital_id ?? null,
          doctorId:   (data as any).doctor_id ?? null,
        })
      }
      setDrugs(rx)
      setTests(orders)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [appointmentId]))

  async function reloadOrders() {
    const [rx, orders] = await Promise.all([getPrescriptions(appointmentId), getTestOrders(appointmentId)])
    setDrugs(rx); setTests(orders)
  }

  const empty = !diagnosis.trim() && !investigations.trim() && !treatmentPlan.trim()
    && drugs.length === 0 && tests.length === 0

  async function handleSave() {
    if (empty) {
      Alert.alert('Nothing to send', 'Write a diagnosis, add a drug or order a test first.')
      return
    }
    haptics.tap()
    setSaving(true)
    const { error } = await saveConsultationPlan(appointmentId, {
      diagnosis:      diagnosis.trim()      || undefined,
      investigations: investigations.trim() || undefined,
      treatmentPlan:  treatmentPlan.trim()  || undefined,
    })
    setSaving(false)
    if (error) { Alert.alert('Could not save', error); return }
    haptics.success()
    Alert.alert('Shared with patient', 'They can see this in My care now.')
    navigation.goBack()
  }

  async function saveDrug() {
    if (!scope || !drugName.trim()) return
    setBusy(true)
    const err = await addPrescription(scope, {
      drugName,
      dose,
      frequency,
      durationDays: durationDays ? Number(durationDays.replace(/\D/g, '')) || null : null,
    })
    setBusy(false)
    if (err) { haptics.error(); Alert.alert('Could not add it', err); return }
    haptics.success()
    setDrugName(''); setDose(''); setFrequency(''); setDurationDays(''); setShowDrug(false)
    reloadOrders()
  }

  async function saveTest() {
    if (!scope || !testName.trim()) return
    setBusy(true)
    const err = await addTestOrder(scope, { testName, urgency: testUrgency })
    setBusy(false)
    if (err) { haptics.error(); Alert.alert('Could not order it', err); return }
    haptics.success()
    setTestName(''); setTestUrgency('routine'); setShowTest(false)
    reloadOrders()
  }

  if (loading) {
    return (
      <Screen>
        <AppBar title="Consultation plan" sub={patientName} onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  function PlanField({ label, hint, value, onChangeText, minHeight = 96 }: {
    label: string; hint: string; value: string; onChangeText: (v: string) => void; minHeight?: number
  }) {
    return (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <CardLabel style={{ flex: 1 }}>{label}</CardLabel>
          <Mono size={11} color={t.q.ink60}>{value.length}/{FIELD_MAX}</Mono>
        </View>
        <TextInput
          value={value}
          onChangeText={v => onChangeText(v.slice(0, FIELD_MAX))}
          placeholder={hint}
          placeholderTextColor={t.q.ink60}
          accessibilityLabel={label}
          multiline
          textAlignVertical="top"
          style={{
            minHeight, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
            backgroundColor: t.q.field, padding: 12, fontSize: 14, lineHeight: 20, color: t.q.ink,
          }} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <Screen>
        <AppBar title="Consultation plan"
          sub={patientName ? `For ${patientName}` : undefined}
          onBack={() => navigation.goBack()} />

        <Body keyboardShouldPersistTaps="handled">
          <SectionHead title="Diagnosis" />
          <Card>
            <View style={{ padding: 14 }}>
              <PlanField label="Diagnosis" hint="e.g. Uncomplicated malaria"
                value={diagnosis} onChangeText={setDiagnosis} minHeight={72} />
            </View>
          </Card>

          {/* ── Prescriptions ── */}
          <SectionHead title={drugs.length ? `Prescriptions · ${drugs.length}` : 'Prescriptions'}
            action={showDrug ? 'Close' : 'Add a drug'} onAction={() => setShowDrug(v => !v)} />
          <Card>
            {drugs.length === 0 && !showDrug ? (
              <Empty icon="medkit-outline" title="Nothing prescribed yet"
                body="Add each drug separately — the patient sees them as a list, and a pharmacy can mark one dispensed." />
            ) : drugs.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <Hair />}
                <Row
                  compact
                  icon="medkit-outline"
                  iconTone={p.status === 'cancelled' ? 'neutral' : 'teal'}
                  dim={p.status === 'cancelled'}
                  title={p.drug_name}
                  sub={prescriptionLine(p) || null}
                  pill={p.status === 'dispensed' ? 'Dispensed' : p.status === 'cancelled' ? 'Cancelled' : undefined}
                  pillTone={p.status === 'dispensed' ? 'green' : 'neutral'}
                  right={p.status === 'prescribed'
                    ? <IconBtn name="close" label={`Cancel ${p.drug_name}`} color={t.q.red}
                        onPress={async () => { await cancelPrescription(p.id); reloadOrders() }} />
                    : undefined} />
              </View>
            ))}
            {showDrug && (
              <>
                {drugs.length > 0 && <Hair />}
                <View style={{ padding: 14, gap: 12 }}>
                  <Field label="Drug" value={drugName} onChangeText={setDrugName} placeholder="e.g. Aspirin" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Dose" value={dose} onChangeText={setDose} placeholder="75 mg" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="How often" value={frequency} onChangeText={setFrequency} placeholder="Once daily" />
                    </View>
                  </View>
                  <Field label="For how many days" value={durationDays} onChangeText={setDurationDays}
                    keyboardType="number-pad" placeholder="30" />
                  <Btn label="Add to the prescription" loading={busy} disabled={!drugName.trim()} onPress={saveDrug} />
                </View>
              </>
            )}
          </Card>

          {/* ── Tests ── */}
          <SectionHead title={tests.length ? `Tests · ${tests.length}` : 'Tests'}
            action={showTest ? 'Close' : 'Order a test'} onAction={() => setShowTest(v => !v)} />
          <Card>
            {tests.length === 0 && !showTest ? (
              <Empty icon="flask-outline" title="Nothing ordered yet"
                body="An ordered test is one the laboratory can see and attach a result to." />
            ) : tests.map((o, i) => (
              <View key={o.id}>
                {i > 0 && <Hair />}
                <Row
                  compact
                  icon="flask-outline"
                  iconTone={o.status === 'resulted' ? 'green' : o.status === 'cancelled' ? 'neutral' : 'teal'}
                  dim={o.status === 'cancelled'}
                  title={o.test_name}
                  sub={o.urgency === 'routine' ? null : o.urgency === 'stat' ? 'Immediately' : 'Urgent'}
                  pill={o.status === 'resulted' ? 'Resulted'
                    : o.status === 'collected' ? 'Collected'
                    : o.status === 'cancelled' ? 'Cancelled' : 'Ordered'}
                  pillTone={o.status === 'resulted' ? 'green' : o.status === 'cancelled' ? 'neutral' : 'teal'}
                  right={o.status === 'ordered'
                    ? <IconBtn name="close" label={`Cancel ${o.test_name}`} color={t.q.red}
                        onPress={async () => { await cancelTestOrder(o.id); reloadOrders() }} />
                    : undefined} />
              </View>
            ))}
            {showTest && (
              <>
                {tests.length > 0 && <Hair />}
                <View style={{ padding: 14, gap: 12 }}>
                  <Field label="Test" value={testName} onChangeText={setTestName} placeholder="e.g. Full blood count" />
                  <View style={{ gap: 8 }}>
                    <CardLabel>How soon</CardLabel>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([['routine', 'Routine'], ['urgent', 'Urgent'], ['stat', 'Immediately']] as const).map(([k, label]) => (
                        <Chip key={k} label={label} on={testUrgency === k}
                          onPress={() => { haptics.tap(); setTestUrgency(k) }} />
                      ))}
                    </View>
                  </View>
                  <Btn label="Order it" loading={busy} disabled={!testName.trim()} onPress={saveTest} />
                </View>
              </>
            )}
          </Card>

          <SectionHead title="In your own words" />
          <Card>
            <View style={{ padding: 14, gap: 16 }}>
              <PlanField label="Investigations" hint="What you are looking for, and why"
                value={investigations} onChangeText={setInvestigations} />
              <Hair inset={0} />
              <PlanField label="Treatment plan" hint="Anything the lists above do not say"
                value={treatmentPlan} onChangeText={setTreatmentPlan} minHeight={128} />
            </View>
          </Card>

          <Notice tone="neutral" icon="eye-outline">
            Drugs and tests are saved the moment you add them. The written fields are sent when you tap
            below, and you can come back and edit them later.
          </Notice>

          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Btn label="Skip for now" variant="ghost" disabled={saving} onPress={() => navigation.goBack()} />
          </View>
        </Body>

        <BottomBar meta={
          <Mono size={12} weight="600" color={t.q.ink70}>
            {drugs.length} drug{drugs.length === 1 ? '' : 's'} · {tests.length} test{tests.length === 1 ? '' : 's'}
          </Mono>
        }>
          <Btn grow label="Send to patient" loading={saving} disabled={saving || empty} onPress={handleSave} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
