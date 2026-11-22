import { useState } from 'react'
import { View, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { MOCK_LOCATION, mockCoord } from '@queue/shared/lib/mock-location'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Row, SectionHead, DetailRow, Field, Chip, Notice,
  Btn, BottomBar, Mono,
} from '@queue/shared/components/q'
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
      if (MOCK_LOCATION) {
        const c = mockCoord(foundPatient?.id ?? patientName.trim() ?? 'walkin')
        setCoords({ lat: c.latitude, lng: c.longitude })
        return
      }
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
      <Screen>
        <AppBar title="Ambulance requested" sub={bookingRef} />
        <Body>
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 18, gap: 8 }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32, backgroundColor: t.q.greenBg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={30} color={t.q.green} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: t.q.ink, textAlign: 'center' }}>
              Dispatch is searching
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, textAlign: 'center' }}>
              The nearest available unit is being found for {foundPatient?.full_name ?? (patientName.trim() || 'the patient')}.
            </Text>
          </View>

          <Card>
            <DetailRow label="Reference" value={bookingRef} mono />
            <DetailRow label="Condition" value={symptom || customSymptom || '—'} />
            <DetailRow label="Contact" value={patientPhone.trim() || '—'} mono last />
          </Card>

          <Notice tone="teal" icon="information-circle-outline">
            Track it on the ambulance desk. If no unit is found, a dispatcher alert is raised.
          </Notice>
        </Body>

        <BottomBar>
          <Btn label="Done" variant="secondary" onPress={() => navigation.goBack()} />
          <Btn grow label="Ambulance desk" icon="medical-outline"
            onPress={() => navigation.navigate('AmbulanceRequests')} />
        </BottomBar>
      </Screen>
    )
  }

  return (
    <Screen>
      <AppBar
        title="Request ambulance"
        sub={staffProfile?.name ? `${staffProfile.name} · for a patient` : 'For a patient'}
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Body keyboardShouldPersistTaps="handled">
          {!!error && <Notice tone="red">{error}</Notice>}

          <SectionHead title="Patient" />
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <Field
              label="Phone or patient ID"
              value={lookupQuery}
              onChangeText={setLookupQuery}
              placeholder="Find an existing patient"
              autoCapitalize="characters"
            />
            <Btn
              label={lookupLoading ? 'Looking…' : 'Find patient'}
              variant="secondary" small icon="search"
              loading={lookupLoading}
              disabled={!lookupQuery.trim()}
              onPress={handleLookup}
            />
          </View>

          {foundPatient && (
            <Card style={{ marginTop: 12 }}>
              <Row
                icon="person-circle-outline" iconTone="green" tint
                title={foundPatient.full_name}
                sub={[foundPatient.phone, foundPatient.patient_number].filter(Boolean).join(' · ')}
                pill="Linked" pillTone="green"
              />
            </Card>
          )}

          <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 14 }}>
            <Field
              label="Patient full name"
              value={patientName}
              onChangeText={v => { setPatientName(v); setFoundPatient(null) }}
              placeholder="Who is being collected?"
              autoCapitalize="words"
            />
            <Field
              label="Contact phone"
              hint="The crew calls this number on the way"
              value={patientPhone}
              onChangeText={setPatientPhone}
              placeholder="+234 …"
              keyboardType="phone-pad"
            />
          </View>

          <SectionHead title="Condition" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
            {SYMPTOMS.map(sym => (
              <Chip key={sym} label={sym} on={symptom === sym}
                onPress={() => setSymptom(symptom === sym ? '' : sym)} />
            ))}
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <Field
              label="Or describe it"
              value={customSymptom}
              onChangeText={setCustomSymptom}
              multiline
              numberOfLines={3}
              placeholder="Describe the condition…"
              style={{ minHeight: 76, textAlignVertical: 'top' }}
            />
          </View>

          <SectionHead title="Pickup location" />
          <Card>
            <Row
              icon={coords ? 'checkmark-circle' : 'locate-outline'}
              iconTone={coords ? 'green' : 'neutral'}
              tint={!!coords}
              title={locating ? 'Getting location…' : coords ? 'Location captured' : 'Use this device’s location'}
              sub={coords
                ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                : 'The crew is sent to where this phone is now'}
              right={locating ? <ActivityIndicator size="small" color={t.q.primary} /> : undefined}
              onPress={locating ? undefined : useCurrentLocation}
            />
          </Card>

          <Notice tone="amber" icon="information-circle-outline">
            Dispatch matches the nearest available unit and decides the receiving hospital from the
            condition and bed capacity — the same as a patient&apos;s own request.
          </Notice>
        </Body>

        <BottomBar meta={
          <Mono size={12} color={coords ? t.q.ink60 : t.q.amber}>
            {coords ? 'Location ready' : 'Capture the pickup location first'}
          </Mono>
        }>
          <Btn
            grow
            variant="danger"
            label="Request ambulance"
            icon="medical-outline"
            loading={submitting}
            onPress={handleSubmit}
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
