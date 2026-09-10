import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'
import { requestAmbulanceForPatient, triageForSymptom } from '@queue/shared/lib/ambulance-api'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

const SYMPTOMS = [
  'Chest pain / difficulty breathing', 'Severe bleeding', 'High fever (39°C+)',
  'Severe abdominal pain', 'Head injury / loss of consciousness',
  'Allergic reaction', 'Stroke symptoms', 'Severe burns',
]

interface FoundPatient { id: string; full_name: string; phone: string; patient_number: string }
interface Props { navigation: any }

/**
 * "Hospital admins/front desk/doctors can also use ambulance page or option
 * to request for patient." -- front desk arranging pickup for a caller, or a
 * doctor mid-consult ordering an emergency transfer. Reuses the same lookup
 * endpoint WalkInBookingScreen already uses (a patient registered at this
 * hospital, or record it as an unregistered walk-in) and the same
 * symptom -> triage mapping the patient app's own emergency screen uses, so
 * the two flows can't silently disagree on how urgent something is.
 */
export function RequestAmbulanceScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()

  const [patientName,  setPatientName]  = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [lookupQuery,  setLookupQuery]  = useState('')
  const [foundPatient, setFoundPatient] = useState<FoundPatient | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const [symptom, setSymptom] = useState('')
  const [customSymptom, setCustomSymptom] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bookingRef, setBookingRef] = useState('')

  async function handleLookup() {
    if (!lookupQuery.trim()) return
    setLookupLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      const isPhone = /\d/.test(lookupQuery)
      const param = isPhone ? `phone=${encodeURIComponent(lookupQuery.trim())}` : `patientNumber=${encodeURIComponent(lookupQuery.trim())}`
      const res = await fetch(`${API_URL}/api/appointments/walkin?${param}`, { headers: { Authorization: `Bearer ${jwt}` } })
      const body = await res.json()
      if (body.found && body.patient) {
        setFoundPatient(body.patient)
        setPatientName(body.patient.full_name)
        setPatientPhone(body.patient.phone)
      } else {
        setFoundPatient(null)
        Alert.alert('Not found', 'No registered patient matched that. Enter their details below as a walk-in.')
      }
    } catch {
      Alert.alert('Error', 'Could not search for patient.')
    } finally {
      setLookupLoading(false)
    }
  }

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
    if (!foundPatient && !patientName.trim()) { setError('Enter the patient\'s name.'); return }
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
        contactPhone: patientPhone.trim() || undefined,
        symptomDescription: symptom || customSymptom,
        patientId: foundPatient?.id,
        walkinPatientName: foundPatient ? undefined : patientName.trim(),
        walkinPatientPhone: foundPatient ? undefined : (patientPhone.trim() || undefined),
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
          <Text style={[s.sub, { color: t.textMuted }]}>{staffProfile?.name ?? 'Staff'} · on behalf of a patient</Text>

          {error ? (
            <View style={[s.errorBanner, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
              <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text>
            </View>
          ) : null}

          <Text style={[s.label, { color: t.textMuted }]}>PATIENT</Text>
          <View style={s.lookupRow}>
            <TextInput value={lookupQuery} onChangeText={setLookupQuery} placeholder="Phone or patient ID"
              placeholderTextColor={t.textMuted} style={[s.input, { flex: 1, color: t.textPrimary, borderColor: t.inputBorder, backgroundColor: t.inputBg }]} />
            <TouchableOpacity onPress={handleLookup} disabled={lookupLoading || !lookupQuery.trim()} style={[s.lookupBtn, { backgroundColor: t.accent }]}>
              {lookupLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
          {foundPatient && (
            <View style={[s.foundBox, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
              <Ionicons name="checkmark-circle" size={14} color={t.accent} />
              <Text style={{ color: t.accentDark, fontSize: 12.5 }}>{foundPatient.full_name} · {foundPatient.patient_number}</Text>
            </View>
          )}

          <TextInput value={patientName} onChangeText={t2 => { setPatientName(t2); setFoundPatient(null) }}
            placeholder="Patient full name" placeholderTextColor={t.textMuted}
            style={[s.input, { color: t.textPrimary, borderColor: t.inputBorder, backgroundColor: t.inputBg, marginTop: 10 }]} />
          <TextInput value={patientPhone} onChangeText={setPatientPhone}
            placeholder="Contact phone" placeholderTextColor={t.textMuted} keyboardType="phone-pad"
            style={[s.input, { color: t.textPrimary, borderColor: t.inputBorder, backgroundColor: t.inputBg, marginTop: 10 }]} />

          <Text style={[s.label, { color: t.textMuted }]}>CONDITION</Text>
          <View style={s.chipRow}>
            {SYMPTOMS.map(sym => (
              <TouchableOpacity key={sym} onPress={() => setSymptom(symptom === sym ? '' : sym)}
                style={[s.chip, { borderColor: symptom === sym ? t.danger : t.cardBorder, backgroundColor: symptom === sym ? t.dangerSubtle : t.cardBg }]}>
                <Text style={{ color: symptom === sym ? t.danger : t.textSecondary, fontSize: 11.5 }}>{sym}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={customSymptom} onChangeText={setCustomSymptom} placeholder="Or describe the condition…"
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
              condition and bed capacity, the same as a patient&apos;s own request.
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
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  lookupRow: { flexDirection: 'row', gap: 8 },
  lookupBtn: { width: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foundBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, padding: 9, marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  locBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 13 },
  noteBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 16 },
  doneTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  doneSub: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 24 },
  doneBtn: { paddingHorizontal: 30, paddingVertical: 14, borderRadius: 14 },
  doneBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
