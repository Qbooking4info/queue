import { useEffect, useState } from 'react'
import { View, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { MOCK_LOCATION, mockCoord } from '@queue/shared/lib/mock-location'
import { haptics } from '@queue/shared/lib/haptics'
import { requestAmbulanceForPatient, triageForSymptom } from '@queue/shared/lib/ambulance-api'
import { getHospitals, getHospitalById, type HospitalWithDoctors } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Seg, Chip,
  Btn, BottomBar, Notice, SearchField, Mono, Empty, Pill,
} from '@queue/shared/components/q'

const SYMPTOMS = [
  'Chest pain / difficulty breathing', 'Severe bleeding', 'High fever (39°C+)',
  'Severe abdominal pain', 'Head injury / loss of consciousness',
  'Allergic reaction', 'Stroke symptoms', 'Severe burns',
]

const PRIORITY: { level: number; label: string; sub: string }[] = [
  { level: 1, label: 'P1 · emergency', sub: 'Life-threatening — nearest ALS unit' },
  { level: 2, label: 'P2 · urgent',    sub: 'Needs moving soon' },
  { level: 3, label: 'P3 · routine',   sub: 'Planned transfer' },
]

interface Props {
  navigation: any
  route: { params: { patientId: string; patientName: string; patientPhone?: string | null } }
}

/**
 * A doctor mid-consult realising a patient needs an emergency transfer. The
 * patient is already known (unlike the front desk version, which has to look
 * one up), so this goes straight to condition, priority, pickup and destination.
 *
 * Priority is the doctor's to set here, unlike the patient SOS flow where it is
 * derived from the symptom they picked (see SYMPTOM_TRIAGE_MAP's comment: a
 * patient would choose "critical" every time). A doctor has examined them. The
 * symptom still seeds it, so the common case is one tap.
 */
export function RequestAmbulanceScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { doctorProfile } = useAuth()
  const { patientId, patientName, patientPhone } = route.params

  const [symptom, setSymptom] = useState('')
  const [customSymptom, setCustomSymptom] = useState('')
  const [priority, setPriority] = useState<number | null>(null)
  const [pickup, setPickup] = useState<'hospital' | 'device'>('hospital')
  const [pickupAddress, setPickupAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const [ownHospital, setOwnHospital] = useState<HospitalWithDoctors | null>(null)
  const [destination, setDestination] = useState<HospitalWithDoctors | null>(null)
  const [destSearch, setDestSearch] = useState('')
  const [destResults, setDestResults] = useState<HospitalWithDoctors[]>([])
  const [searchingDest, setSearchingDest] = useState(false)
  const [pickingDest, setPickingDest] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bookingRef, setBookingRef] = useState('')

  // The doctor's own hospital is the default pickup -- a transfer starts where
  // the patient already is.
  useEffect(() => {
    if (!doctorProfile) return
    let cancelled = false
    getHospitalById(doctorProfile.hospitalId).then(h => {
      if (cancelled || !h) return
      setOwnHospital(h)
      const lat = (h as any).latitude, lng = (h as any).longitude
      if (typeof lat === 'number' && typeof lng === 'number') setCoords({ lat, lng })
      setPickupAddress([(h as any).address, (h as any).city].filter(Boolean).join(', '))
    })
    return () => { cancelled = true }
  }, [doctorProfile])

  useEffect(() => {
    if (!pickingDest) return
    const timer = setTimeout(async () => {
      setSearchingDest(true)
      const data = await getHospitals(destSearch)
      setDestResults(data.filter(h => h.id !== doctorProfile?.hospitalId))
      setSearchingDest(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [pickingDest, destSearch, doctorProfile?.hospitalId])

  async function useDeviceLocation() {
    setLocating(true); setError('')
    try {
      if (MOCK_LOCATION) {
        const c = mockCoord(patientId)
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

  function choosePickup(next: 'hospital' | 'device') {
    setPickup(next)
    setError('')
    if (next === 'hospital') {
      const lat = (ownHospital as any)?.latitude, lng = (ownHospital as any)?.longitude
      setCoords(typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null)
      setPickupAddress([(ownHospital as any)?.address, (ownHospital as any)?.city].filter(Boolean).join(', '))
    } else {
      setCoords(null)
      setPickupAddress('')
    }
  }

  const condition = symptom || customSymptom.trim()
  const derived = triageForSymptom(symptom)
  const effectivePriority = priority ?? (symptom ? derived.triageLevel : null)
  // A raised priority needs a unit that can actually hold a critical patient.
  const tier = effectivePriority != null && effectivePriority <= 2 ? 'ALS' : derived.requiredTier

  async function handleSubmit() {
    setError('')
    if (!condition) { setError('Choose or describe the condition.'); return }
    if (effectivePriority == null) { setError('Set a priority.'); return }
    if (!coords) {
      setError(pickup === 'hospital'
        ? 'Your hospital has no coordinates saved, so dispatch cannot find it. Use this device\'s location instead.'
        : 'Capture the pickup location first.')
      return
    }

    setSubmitting(true)
    try {
      const { request } = await requestAmbulanceForPatient({
        requestType: 'emergency',
        triageLevel: effectivePriority,
        requiredTier: tier,
        lat: coords.lat,
        lng: coords.lng,
        pickupAddress: pickupAddress.trim() || undefined,
        contactPhone: patientPhone ?? undefined,
        symptomDescription: condition,
        destinationHospitalId: destination?.id ?? null,
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
      <Screen>
        <AppBar title="Ambulance requested" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
          <Ionicons name="checkmark-circle" size={64} color={t.q.green} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: t.q.ink, textAlign: 'center' }}>
            Ambulance requested
          </Text>
          <Mono size={14} weight="700">{bookingRef}</Mono>
          <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60, textAlign: 'center' }}>
            The nearest available crew is being offered the run. The front desk can follow it on the
            ambulance desk.
          </Text>
        </View>
        <BottomBar>
          <Btn grow label="Done" onPress={() => navigation.goBack()} />
        </BottomBar>
      </Screen>
    )
  }

  if (pickingDest) {
    return (
      <Screen>
        <AppBar title="Taking the patient to" onBack={() => setPickingDest(false)} />
        <SearchField value={destSearch} onChangeText={setDestSearch} placeholder="Search hospitals" />
        <Body keyboardShouldPersistTaps="handled">
          {searchingDest ? (
            <ActivityIndicator color={t.q.primary} style={{ marginTop: 24 }} />
          ) : destResults.length === 0 ? (
            <Card><Empty icon="business-outline" title="No hospitals found" body="Try a different name." /></Card>
          ) : (
            <Card>
              {destResults.map((h, i) => (
                <View key={h.id}>
                  {i > 0 && <Hair />}
                  <Row
                    icon="business-outline"
                    title={h.name}
                    sub={[h.city, h.state].filter(Boolean).join(', ') || null}
                    chevron
                    onPress={() => { haptics.tap(); setDestination(h); setPickingDest(false) }} />
                </View>
              ))}
            </Card>
          )}
        </Body>
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Request ambulance" sub={patientName} onBack={() => navigation.goBack()} />

        <Body keyboardShouldPersistTaps="handled">
          <Notice tone="neutral" icon="information-circle-outline">
            Use this for a transfer out of your clinic. The nearest available crew is offered the run.
          </Notice>

          {!!error && <Notice tone="red" icon="alert-circle">{error}</Notice>}

          <SectionHead title="Condition" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
            {SYMPTOMS.map(sym => (
              <Chip key={sym} label={sym} on={symptom === sym}
                onPress={() => { haptics.tap(); setSymptom(symptom === sym ? '' : sym); setPriority(null) }} />
            ))}
          </View>
          <Card>
            <View style={{ padding: 14, gap: 6 }}>
              <CardLabel>Or describe it</CardLabel>
              <TextInput
                value={customSymptom} onChangeText={setCustomSymptom}
                placeholder="Reason for transfer, in your words"
                placeholderTextColor={t.q.ink60}
                accessibilityLabel="Condition or reason for transfer"
                multiline textAlignVertical="top"
                style={{
                  minHeight: 84, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                  backgroundColor: t.q.field, padding: 12, fontSize: 14, lineHeight: 20, color: t.q.ink,
                }} />
            </View>
          </Card>

          <SectionHead title="Priority" />
          <Card>
            {PRIORITY.map((p, i) => (
              <View key={p.level}>
                {i > 0 && <Hair />}
                <Row
                  title={p.label}
                  sub={p.sub}
                  tint={effectivePriority === p.level}
                  titleColor={effectivePriority === p.level ? (p.level === 1 ? t.q.red : t.q.ink) : undefined}
                  right={effectivePriority === p.level
                    ? <Pill label={priority == null ? 'From condition' : 'Chosen'} tone={p.level === 1 ? 'red' : 'teal'} onTint />
                    : undefined}
                  onPress={() => { haptics.tap(); setPriority(p.level) }} />
              </View>
            ))}
          </Card>

          <SectionHead title="Pickup" />
          <Seg<'hospital' | 'device'>
            value={pickup} onChange={choosePickup}
            options={[{ key: 'hospital', label: 'This hospital' }, { key: 'device', label: 'This device' }]} />
          <Card>
            {pickup === 'hospital' ? (
              <Row
                icon="business-outline" iconTone={coords ? 'teal' : 'amber'}
                title={ownHospital?.name ?? 'Your hospital'}
                sub={coords
                  ? (pickupAddress || 'Coordinates on file')
                  : 'No coordinates saved for this hospital — use this device instead'} />
            ) : (
              <Row
                icon={coords ? 'checkmark-circle' : 'locate-outline'}
                iconTone={coords ? 'teal' : 'neutral'}
                title={locating ? 'Getting a fix…' : coords ? 'Location captured' : "Use this device's location"}
                sub={coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Tap to capture where the patient is'}
                right={locating ? <ActivityIndicator size="small" color={t.q.primary} /> : undefined}
                onPress={locating ? undefined : useDeviceLocation} />
            )}
            <Hair />
            <View style={{ padding: 14, gap: 6 }}>
              <CardLabel>Where to find the patient</CardLabel>
              <TextInput
                value={pickupAddress} onChangeText={setPickupAddress}
                placeholder="e.g. Ward 3, second floor, east wing"
                placeholderTextColor={t.q.ink60}
                accessibilityLabel="Pickup address or directions"
                style={{
                  minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                  backgroundColor: t.q.field, paddingHorizontal: 14, fontSize: 15, color: t.q.ink,
                }} />
            </View>
          </Card>

          <SectionHead title="Taking the patient to" />
          <Card>
            <Row
              icon="navigate-outline" iconTone={destination ? 'teal' : 'neutral'}
              title={destination?.name ?? 'Let dispatch decide'}
              sub={destination
                ? [destination.city, destination.state].filter(Boolean).join(', ') || 'Chosen destination'
                : 'Dispatch picks by condition, distance and bed space'}
              chevron
              onPress={() => { haptics.tap(); setDestSearch(''); setPickingDest(true) }} />
            {!!destination && (
              <>
                <Hair />
                <Row compact title="Clear" subColor={t.q.ink60}
                  sub="Go back to letting dispatch decide"
                  onPress={() => { haptics.tap(); setDestination(null) }} />
              </>
            )}
          </Card>
        </Body>

        <BottomBar meta={<>
          <Mono size={12} weight="600" color={effectivePriority === 1 ? t.q.red : t.q.ink70}>
            {effectivePriority != null ? `P${effectivePriority}` : 'No priority set'}
          </Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12} weight="600">{tier}</Mono>
        </>}>
          <Btn grow variant="danger" label="Request ambulance" loading={submitting}
            disabled={!condition || effectivePriority == null || !coords}
            onPress={handleSubmit} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
