import { useState } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'
import { recordVitals, type ConsultVitals } from '../../lib/api'

// Front desk recording vitals at check-in, before the doctor ever sees the
// patient -- the doctor's own consult screen records vitals too, but only
// once they've already started the consult. This is what actually gives the
// doctor's live vitals-peek widget something to show for a patient who's
// still just waiting.
interface Props {
  appointmentId: string
  patientName: string
  onClose: () => void
  onSaved: () => void
}

export function VitalsEntryModal({ appointmentId, patientName, onClose, onSaved }: Props) {
  const { theme: t } = useTheme()
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [bpSys, setBpSys] = useState('')
  const [bpDia, setBpDia] = useState('')
  const [sugar, setSugar] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    const vitals: ConsultVitals = {
      weight_kg: weight ? parseFloat(weight) : null,
      height_cm: height ? parseFloat(height) : null,
      bp_systolic: bpSys ? parseInt(bpSys) : null,
      bp_diastolic: bpDia ? parseInt(bpDia) : null,
      blood_sugar: sugar ? parseFloat(sugar) : null,
    }
    const { error: err } = await recordVitals(appointmentId, vitals)
    setSaving(false)
    if (err) { haptics.error(); setError(err); return }
    haptics.success()
    onSaved()
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[st.title, { color: t.textPrimary }]}>Record Vitals</Text>
          <Text style={[st.sub, { color: t.textMuted }]}>{patientName}</Text>

          <View style={st.row}>
            <Field label="Weight (kg)" value={weight} onChangeText={setWeight} theme={t} />
            <Field label="Height (cm)" value={height} onChangeText={setHeight} theme={t} />
          </View>
          <View style={st.row}>
            <Field label="BP Systolic" value={bpSys} onChangeText={setBpSys} theme={t} />
            <Field label="BP Diastolic" value={bpDia} onChangeText={setBpDia} theme={t} />
          </View>
          <Field label="Blood Sugar (mg/dL)" value={sugar} onChangeText={setSugar} theme={t} />

          {!!error && <Text style={{ fontSize: 12, color: '#FF5C5C', marginTop: 10 }}>{error}</Text>}

          <View style={st.buttonRow}>
            <TouchableOpacity onPress={onClose} disabled={saving} style={[st.button, { borderColor: t.cardBorder }]}>
              <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} style={[st.button, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
              {saving ? <ActivityIndicator size="small" color={t.accent} /> : <Text style={{ color: t.accent, fontWeight: '800', fontSize: 14 }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Field({ label, value, onChangeText, theme: t }: { label: string; value: string; onChangeText: (v: string) => void; theme: any }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[st.label, { color: t.textMuted }]}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={t.textMuted}
        style={[st.input, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
      />
    </View>
  )
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 20 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  button: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
})
