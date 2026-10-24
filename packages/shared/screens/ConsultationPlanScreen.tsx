import { useState, useCallback } from 'react'
import {
  View, ScrollView, TextInput, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '../components/ui/Typography'
import { Card, Header, PrimaryButton, SectionTitle } from '../components/ui/v3'
import { useTheme } from '../contexts/ThemeContext'
import { Alert } from '../contexts/AlertContext'
import { supabase } from '../lib/supabase'
import { haptics } from '../lib/haptics'
import { saveConsultationPlan } from '../lib/api'

interface Props {
  navigation: any
  route: { params: { appointmentId: string; patientName?: string } }
}

const FIELD_MAX = 800

/**
 * The one screen where a doctor writes structured clinical documentation --
 * diagnosis, investigations, treatment -- and the patient gets to see it.
 * Reached after ending a virtual call, or later from a completed virtual
 * appointment to add or edit it. Every field is optional: a doctor can save
 * with only one filled in, or leave all three blank and come back later.
 *
 * Shared across the doctor app for both hospital-linked and direct
 * (independent) bookings -- same screen, same fields, same route
 * (POST /api/appointments/[id]/plan), regardless of how the patient booked.
 */
export function ConsultationPlanScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { appointmentId, patientName } = route.params

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [diagnosis,      setDiagnosis]      = useState('')
  const [investigations, setInvestigations] = useState('')
  const [treatmentPlan,  setTreatmentPlan]  = useState('')

  // Re-read on focus rather than once on mount: the doctor can leave to check
  // something and come back, and a stale copy would silently overwrite whatever
  // was saved in between.
  useFocusEffect(useCallback(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('appointments')
        .select('diagnosis, investigations, treatment_plan')
        .eq('id', appointmentId)
        .single()
      if (cancelled) return
      if (data) {
        setDiagnosis((data as any).diagnosis ?? '')
        setInvestigations((data as any).investigations ?? '')
        setTreatmentPlan((data as any).treatment_plan ?? '')
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [appointmentId]))

  const empty = !diagnosis.trim() && !investigations.trim() && !treatmentPlan.trim()

  async function handleSave() {
    if (empty) {
      Alert.alert('Nothing to save', 'Fill in at least one field, or skip for now.')
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
    Alert.alert('Shared with patient', 'They can now see this on their appointment.')
    navigation.goBack()
  }

  function Field({
    label, hint, value, onChangeText, minHeight = 96,
  }: { label: string; hint: string; value: string; onChangeText: (v: string) => void; minHeight?: number }) {
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={[s.label, { color: t.textPrimary }]}>{label}</Text>
          <Text style={[s.counter, { color: t.textMuted }]}>{value.length}/{FIELD_MAX}</Text>
        </View>
        <TextInput
          value={value}
          onChangeText={v => onChangeText(v.slice(0, FIELD_MAX))}
          placeholder={hint}
          placeholderTextColor={t.textMuted}
          multiline
          textAlignVertical="top"
          style={[s.input, {
            minHeight,
            backgroundColor: t.cardBg,
            borderColor: t.cardBorder,
            color: t.textPrimary,
          }]}
        />
      </View>
    )
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <Header title="Consultation summary" subtitle={patientName} onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header
        title="Consultation summary"
        subtitle={patientName ? `For ${patientName}` : undefined}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={{ gap: 18 }}>
            <SectionTitle title="What the patient will see" />
            <Field
              label="Diagnosis"
              hint="e.g. Uncomplicated malaria"
              value={diagnosis}
              onChangeText={setDiagnosis}
              minHeight={72}
            />
            <Field
              label="Investigations"
              hint="Tests to run, and where"
              value={investigations}
              onChangeText={setInvestigations}
            />
            <Field
              label="Treatment plan"
              hint="Medication, dosage, duration, follow-up"
              value={treatmentPlan}
              onChangeText={setTreatmentPlan}
              minHeight={120}
            />
          </Card>

          <Text style={[s.note, { color: t.textMuted }]}>
            Every field is optional. This appears on the patient&apos;s appointment as soon
            as you save, and you can come back and edit it later.
          </Text>

          <View style={{ gap: 10 }}>
            <PrimaryButton
              label={saving ? 'Saving…' : 'Save and share'}
              onPress={handleSave}
              loading={saving}
              disabled={saving || empty}
            />
            <PrimaryButton
              label="Skip for now"
              variant="ghost"
              onPress={() => navigation.goBack()}
              disabled={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  label:   { fontSize: 15, fontWeight: '700' },
  counter: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 21,
  },
  note: { fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
})
