import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'
import { requestAmbulanceForPatient, triageForSymptom } from '@queue/shared/lib/ambulance-api'

const SYMPTOMS = [
  'Chest pain / difficulty breathing', 'Severe bleeding', 'High fever (39°C+)',
  'Severe abdominal pain', 'Head injury / loss of consciousness',
  'Allergic reaction', 'Stroke symptoms', 'Severe burns',
]

interface Props {
  navigation: any
  route: { params: { patientId: string; patientName: string; patientPhone?: string | null } }
}

/**
 * A doctor mid-consult realizing a patient needs emergency transfer -- the
 * patient is already known (unlike the front desk/hospital-admin version of
 * this screen, which has to look one up), so this skips straight to
 * condition and pickup.
 */
export function RequestAmbulanceScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { patientId, patientName, patientPhone } = route.params

  const [symptom, setSymptom] = useState('')
  const [customSymptom, setCustomSymptom] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bookingRef, setBookingRef] = useState('')

  async function useCurrentLocation() {
    setLocating(true); setError('')
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
      if (status !== 'granted') { setError('Location permission denied.'); return }
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    } catch {
      setError('Could not get a location fix.')
    } finally {
      setLocating(false)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!symptom && !customSymptom.trim()) { setError('Select or describe the condition.'); return }
    if (!coords) { setError('Capture the pickup location first.'); return }

    setSubmitting(true)
    try {
      const { triageLevel, requiredTier } = triageForSymptom(symptom || customSymptom)
      const { request } = await requestAmbulanceForPatient({
        requestType: 'emergency',
        triageLevel,
        requiredTier,
        lat: coords.lat,
        lng: coords.lng,
        contactPhone: patientPhone ?? undefined,
        symptomDescription: symptom || customSymptom,
        patientId,
      })
      haptics.success()
      setBookingRef(request.booking_ref)
    } catch (err) {
      haptics.error()
      setError(err instanceof Error ? err.message : 'Could not request an ambulance.')
    } finally {
      setSubmitting(false)
    }
  }

  if (bookingRef) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="checkmark-circle" size={72} color={t.accentDark} style={{ marginBottom: 20 }} />
          <Text style={[s.doneTitle, { color: t.textPrimary }]}>Ambulance requested</Text>
          <Text style={[s.doneSub, { color: t.textMuted }]}>Booking ref {bookingRef}. Dispatch is finding the nearest available unit.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.doneBtn, { backgroundColor: t.accent }]}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.title, { color: t.textPrimary }]}>Request Ambulance</Text>
          </View>
          <Text style={[s.sub, { color: t.textMuted }]}>For {patientName}</Text>

          {error ? (
            <View style={[s.errorBanner, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
              <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text>
            </View>
          ) : null}

          <Text style={[s.label, { color: t.textMuted }]}>CONDITION</Text>
          <View style={s.chipRow}>
            {SYMPTOMS.map(sym => (
              <TouchableOpacity key={sym} onPress={() => setSymptom(symptom === sym ? '' : sym)}
                style={[s.chip, { borderColor: symptom === sym ? t.danger : t.cardBorder, backgroundColor: symptom === sym ? t.dangerSubtle : t.cardBg }]}>
                <Text style={{ color: symptom === sym ? t.danger : t.textSecondary, fontSize: 11.5 }}>{sym}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={customSymptom} onChangeText={setCustomSymptom} placeholder="Or describe the condition / reason for transfer…"
            placeholderTextColor={t.textMuted} multiline numberOfLines={3}
            style={[s.input, { color: t.textPrimary, borderColor: t.inputBorder, backgroundColor: t.inputBg, minHeight: 70, textAlignVertical: 'top', marginTop: 8 }]} />

          <Text style={[s.label, { color: t.textMuted }]}>PICKUP LOCATION</Text>
          <TouchableOpacity onPress={useCurrentLocation} disabled={locating}
            style={[s.locBtn, { borderColor: coords ? t.accent : t.cardBorder }]}>
            {locating ? <ActivityIndicator size="small" color={t.accent} />
              : <Ionicons name={coords ? 'checkmark-circle' : 'locate-outline'} size={16} color={coords ? t.accent : t.textMuted} />}
            <Text style={{ color: coords ? t.accent : t.textMuted, fontSize: 13, fontWeight: '600' }}>
              {locating ? 'Getting location…' : coords ? 'Location captured' : 'Use this device\'s current location'}
            </Text>
          </TouchableOpacity>

          <View style={[s.noteBox, { backgroundColor: 'rgba(255,181,71,0.08)', borderColor: 'rgba(255,181,71,0.3)' }]}>
            <Text style={{ color: '#FFB547', fontSize: 12, lineHeight: 17 }}>
              Dispatch matches the nearest available unit and decides the receiving hospital based on
              condition and bed capacity.
            </Text>
          </View>

          <Button label="Request ambulance" onPress={handleSubmit} loading={submitting} variant="danger" style={{ marginTop: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 12.5, marginLeft: 34, marginBottom: 18 },
  errorBanner: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4, marginBottom: 8 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  locBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 13 },
  noteBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 16 },
  doneTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  doneSub: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 24 },
  doneBtn: { paddingHorizontal: 30, paddingVertical: 14, borderRadius: 14 },
  doneBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
