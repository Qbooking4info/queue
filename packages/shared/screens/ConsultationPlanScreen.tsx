import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
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
 * appointment's own screen to add/edit it. Every field is optional: a doctor
 * can save with only one filled in, or tap "Skip for now" to leave it blank
 * entirely and come back later.
 *
 * Shared across the doctors app for both hospital-linked and direct
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

  async function handleSave() {
    setSaving(true)
    const { error } = await saveConsultationPlan(appointmentId, {
      diagnosis: diagnosis.trim(),
      investigations: investigations.trim(),
      treatmentPlan: treatmentPlan.trim(),
    })
    setSaving(false)
    if (error) {
      haptics.error()
      Alert.alert('Could not save', error)
      return
    }
    haptics.success()
    navigation.goBack()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" style={st.backBtn}>
            <Ionicons name="arrow-back" size={22} color={t.textMuted} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: t.textPrimary }]} numberOfLines={1}>
              Consultation Plan
            </Text>
            {patientName && (
              <Text style={[st.headerSub, { color: t.textMuted }]} numberOfLines={1}>{patientName}</Text>
            )}
          </View>
        </View>

        {loading ? (
          <View style={st.center}><ActivityIndicator color={t.accent} size="large" /></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={st.pad}>
              <Text style={[st.intro, { color: t.textMuted }]}>
                Shared with the patient in their app once saved. Leave anything blank that doesn't apply.
              </Text>

              <PlanField label="Diagnosis" value={diagnosis} onChange={setDiagnosis} theme={t}
                placeholder="What this visit concluded…" />
              <PlanField label="Investigations" value={investigations} onChange={setInvestigations} theme={t}
                placeholder="Tests or scans recommended, if any…" />
              <PlanField label="Treatment" value={treatmentPlan} onChange={setTreatmentPlan} theme={t}
                placeholder="Medication, dosage, or care instructions…" />

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={[st.saveBtn, { backgroundColor: t.accent, opacity: saving ? 0.6 : 1 }]}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveTxt}>Save & Share with Patient</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.goBack()} style={st.skipBtn} disabled={saving}>
                <Text style={[st.skipTxt, { color: t.textMuted }]}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

function PlanField({
  label, value, onChange, theme: t, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; theme: any; placeholder: string
}) {
  return (
    <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <View style={st.sectionHeader}>
        <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomWidth: 0 }]}>{label.toUpperCase()}</Text>
        <Text style={{ fontSize: 10, color: t.textMuted }}>{value.length}/{FIELD_MAX}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={v => onChange(v.slice(0, FIELD_MAX))}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        multiline
        numberOfLines={4}
        style={[st.input, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
        textAlignVertical="top"
        maxLength={FIELD_MAX}
      />
    </View>
  )
}

const st = StyleSheet.create({
  safe:          { flex: 1 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  backBtn:       { padding: 4 },
  headerTitle:   { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  headerSub:     { fontSize: 12, marginTop: 1 },
  pad:           { paddingHorizontal: 16 },
  intro:         { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  section:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14 },
  sectionTitle:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  input:         { margin: 12, marginTop: 0, borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 13, lineHeight: 20, minHeight: 80 },
  saveBtn:       { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  saveTxt:       { fontSize: 15, fontWeight: '800', color: '#fff' },
  skipBtn:       { alignItems: 'center', padding: 10, marginBottom: 12 },
  skipTxt:       { fontSize: 13, fontWeight: '600' },
})
