import { useState, useEffect, useCallback } from 'react'
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, DetailRow, Chip, Field,
  Notice, Btn, BottomBar, Empty, Mono,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { useLocation } from '@queue/shared/contexts/LocationContext'
import { getHospitals, createHospitalAppointment, addNotification, getHospitalHours, isOpenNow, getClinicsForHospital, getLinkedDependents, findEmergencyClinic, type LinkedDependent } from '@queue/shared/lib/api'
import { requestAmbulance, triageForSymptom } from '@queue/shared/lib/ambulance-api'
import { getFreshFix } from '@queue/shared/lib/fresh-location'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { emergencyPremium, totalBookingFee, EMERGENCY_FEE_MULTIPLIER } from '@queue/shared/lib/fees'
import { FallbackPanel } from '@queue/shared/components/emergency/FallbackPanel'
import { NearbyAmbulances } from '@queue/shared/components/emergency/NearbyAmbulances'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'

interface Props { navigation: any }

const STEPS = ['Triage', 'Hospital', 'Payment']

// Every booking made through this screen is, by definition, an emergency — there is no
// tier to pick. A separate "urgent" tier was removed because patients confused it with
// emergency and expected the same queue-jump priority, which it never actually granted.
// multiplier/badge derive from lib/fees so this screen and BookingFlowScreen
// can't drift apart on price again — they previously disagreed (2x here, 1.5x
// there) for the same emergency booking.
const EMERGENCY_TIER = {
  id: 'emergency' as const, label: 'Emergency',
  multiplier: EMERGENCY_FEE_MULTIPLIER, badge: `${EMERGENCY_FEE_MULTIPLIER}× fee`, color: '#EF4444',
}

function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// null/'unknown' means the hospital hasn't reported bed space yet — no badge shown
// rather than implying a status nobody actually confirmed.
const BED_SPACE_META: Partial<Record<string, { icon: 'checkmark-circle-outline' | 'alert-circle-outline' | 'close-circle-outline'; label: string; color: string }>> = {
  enough:       { icon: 'checkmark-circle-outline', label: 'Bed space: Enough',       color: '#00C265' },
  limited:      { icon: 'alert-circle-outline',      label: 'Bed space: Limited',      color: '#FFB547' },
  very_limited: { icon: 'alert-circle-outline',      label: 'Bed space: Very limited', color: '#FF8C42' },
  none:         { icon: 'close-circle-outline',       label: 'Bed space: None',         color: '#EF4444' },
}

// Branches to requestAmbulance() in handleConfirm instead of createHospitalAppointment.
const AMBULANCE_ARRIVAL = 'I need an ambulance'

const ARRIVAL_OPTIONS = ['Now (walk-in)', AMBULANCE_ARRIVAL, '15 min', '30 min', '45 min', '1 hr']

const SYMPTOMS = [
  'Chest pain / difficulty breathing',
  'Severe bleeding',
  'High fever (39°C+)',
  'Severe abdominal pain',
  'Head injury / loss of consciousness',
  'Allergic reaction',
  'Stroke symptoms',
  'Severe burns',
]

const PAYMENT_OPTIONS = [
  { id: 'card',     icon: 'card-outline' as const,             label: 'Debit / Credit Card',  sub: 'Visa, Mastercard, Verve' },
  { id: 'transfer', icon: 'business-outline' as const,         label: 'Bank Transfer',         sub: 'Direct bank payment' },
  { id: 'ussd',     icon: 'keypad-outline' as const,            label: 'USSD',                  sub: '*737#, *966#, *000#' },
  { id: 'hmo',      icon: 'shield-checkmark-outline' as const, label: 'HMO Insurance',         sub: 'NHIS, AXA Mansard, Hygeia' },
]

function arrivalToTime(arrival: string): string {
  const now = new Date()
  if (arrival === '15 min') now.setMinutes(now.getMinutes() + 15)
  else if (arrival === '30 min') now.setMinutes(now.getMinutes() + 30)
  else if (arrival === '45 min') now.setMinutes(now.getMinutes() + 45)
  else if (arrival === '1 hr') now.setHours(now.getHours() + 1)
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

// Shared between the walk-in hospital pick and the ambulance "preferred hospital" pick --
// bed space "None"/"Very limited" doesn't block booking (basic first aid may still be
// given as capacity allows), but the patient must actively acknowledge the risk before
// Continue unlocks, rather than a static disclaimer they can scroll past.
function BedSpaceAck({ selectedHospital, needsAck, acked, onToggle, t }: {
  selectedHospital: DisplayHospital | null
  needsAck: boolean
  acked: boolean
  onToggle: () => void
  t: any
}) {
  if (!selectedHospital || !needsAck) return null
  const isNone = selectedHospital.bed_space_status === 'none'
  return (
    <>
      <Notice tone="red" icon="warning-outline">
        {isNone ? 'No bed space right now. ' : 'Very limited bed space right now. '}
        {selectedHospital.name} cannot guarantee a bed on arrival. Other emergencies who arrive first,
        especially more urgent ones, are seen first. First aid may still be given as capacity allows.
      </Notice>
      {/* A tick, not a toggle switch: this is a thing the patient states, and
          Continue stays locked until they do. */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acked }}
        accessibilityLabel="I understand and wish to proceed anyway"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.q.surface, borderWidth: 1, borderColor: acked ? t.q.redFill : t.q.line }}>
        <View style={{
          width: 22, height: 22, borderRadius: 6, borderWidth: 2,
          borderColor: acked ? t.q.redFill : t.q.line,
          backgroundColor: acked ? t.q.redFill : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {acked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        </View>
        <Text style={{ flex: 1, fontSize: 13.5, color: t.q.ink }}>
          I understand and wish to proceed anyway
        </Text>
      </Pressable>
    </>
  )
}

export function EmergencyBookingScreen({ navigation }: Props) {
  const { theme: t }  = useTheme()
  const { user }      = useAuth()
  const { coords, granted: locationGranted, loading: locationLoading, request: requestLocation } = useLocation()

  const [step,              setStep]             = useState(0)
  const [symptom,           setSymptom]          = useState('')
  const [customSymptom,     setCustomSymptom]    = useState('')
  const [forDependent,      setForDependent]     = useState(false)
  // Tracks which LINKED (real-account) dependent to book for -- selectedDependentId
  // is that dependent's own users.id.
  const [dependentsList,    setDependentsList]   = useState<LinkedDependent[]>([])
  const [selectedDependentId, setSelectedDependentId] = useState<string | null>(null)
  const [hospitals,         setHospitals]        = useState<DisplayHospital[]>([])
  const [loadingHospitals,  setLoadingHospitals] = useState(false)
  const [selectedHospital,  setSelectedHospital] = useState<DisplayHospital | null>(null)
  const [erClinicId,        setErClinicId]       = useState<string | undefined>(undefined)
  const [bedSpaceAck,       setBedSpaceAck]      = useState(false)
  const [arrival,           setArrival]          = useState<string | null>(null)
  const [paymentMethod,     setPaymentMethod]    = useState('card')
  const [submitting,        setSubmitting]       = useState(false)
  const [submitError,       setSubmitError]      = useState('')

  const u = EMERGENCY_TIER
  const baseFee   = selectedHospital?.opd_fee ?? 15000
  const premium   = emergencyPremium(baseFee)
  const total     = totalBookingFee(baseFee, true)
  const isAmbulance = arrival === AMBULANCE_ARRIVAL

  // Load hospitals genuinely available right now — 24/7 emergency_hours hospitals always
  // qualify; everyone else only if they're actually open at this moment. A closed hospital
  // is never shown here — for emergencies the patient needs somewhere real to go now.
  const loadHospitals = useCallback(async () => {
    setLoadingHospitals(true)
    const raw = await getHospitals()
    const checks = await Promise.all(raw.map(async h => {
      if (h.emergency_hours) return true
      const hours = await getHospitalHours(String(h.id))
      return isOpenNow(hours)
    }))
    setHospitals(raw.filter((_, i) => checks[i]).map(toDisplayHospital))
    setLoadingHospitals(false)
  }, [])

  useEffect(() => { loadHospitals() }, [loadHospitals])

  // Load linked (real-account) dependents when the user selects "A dependent".
  // Ambulance dispatch for a dependent isn't migrated to the new linked-account
  // system yet (transport_requests.dependent_id still FKs the old profile-only
  // dependents table) -- the picker below only feeds the hospital-appointment
  // path; selecting a dependent has no effect on the ambulance branch.
  useEffect(() => {
    let cancelled = false
    if (forDependent && user && dependentsList.length === 0) {
      getLinkedDependents()
        .then(({ managing }) => { if (!cancelled) setDependentsList(managing) })
        .catch(err => console.warn('[emergency] failed to load dependents', err))
    }
    if (!forDependent) setSelectedDependentId(null)
    return () => { cancelled = true }
  }, [forDependent, user])

  // Best-effort: if this is a multi-clinic hospital and it has a designated Emergency
  // Department, route the booking straight there. If not, it still falls through as a
  // general hospital-level booking — unlike the regular booking flow, this dedicated
  // emergency screen never blocks a walk-in just because a clinic isn't tagged yet.
  useEffect(() => {
    setErClinicId(undefined)
    if (!selectedHospital || selectedHospital.clinic_model !== 'multi') return
    let cancelled = false
    getClinicsForHospital(String(selectedHospital.id)).then(clinics => {
      if (cancelled) return
      const er = findEmergencyClinic(clinics)
      if (er) setErClinicId(er.id)
    })
    return () => { cancelled = true }
  }, [selectedHospital?.id])

  // Only ask for location once the patient actually picks the ambulance option —
  // no reason to prompt for permission on a screen most people use for a walk-in.
  useEffect(() => {
    if (arrival === AMBULANCE_ARRIVAL && !coords) requestLocation()
  }, [arrival])

  // Bed space "None"/"Very limited" doesn't block booking -- the hospital may still give
  // basic first aid as capacity allows -- but the patient must actively acknowledge the
  // risk before Continue unlocks, rather than a static disclaimer they can scroll past.
  // Applies to the preferred-hospital pick in ambulance mode too, for the same reason;
  // it's a no-op whenever no hospital is selected, which needsBedSpaceAck already covers.
  const needsBedSpaceAck = selectedHospital?.bed_space_status === 'none' || selectedHospital?.bed_space_status === 'very_limited'
  useEffect(() => { setBedSpaceAck(false) }, [selectedHospital?.id])

  const canProceed = () => {
    if (step === 0) return !!(symptom || customSymptom.trim())
    if (step === 1) {
      const bedSpaceOk = !needsBedSpaceAck || bedSpaceAck
      if (arrival === AMBULANCE_ARRIVAL) return !!coords && bedSpaceOk
      return !!(selectedHospital && arrival) && bedSpaceOk
    }
    return true
  }

  async function handleConfirm() {
    if (!user) return
    setSubmitError('')

    if (arrival === AMBULANCE_ARRIVAL) {
      setSubmitting(true)
      // A reading taken now: LocationContext's coords are captured once when the app
      // opens and could put the pickup kilometres from where the patient is.
      const located = await getFreshFix()
      if (!located.ok) {
        setSubmitting(false)
        setSubmitError(located.reason === 'permission_denied'
          ? 'Location permission is needed to send an ambulance. Allow it in Settings, or call 112 or 767 now.'
          : "We couldn't get your location. Turn on location (GPS) and try again, or call 112 or 767 now.")
        return
      }
      const pickup = located.fix
      const { triageLevel, requiredTier } = triageForSymptom(symptom || customSymptom)
      try {
        const { request } = await requestAmbulance({
          requestType:           'emergency',
          triageLevel,
          requiredTier,
          lat:                   pickup.latitude,
          lng:                   pickup.longitude,
          contactPhone:          user.phone ?? undefined,
          symptomDescription:    symptom || customSymptom,
          // Ambulance dispatch-for-a-dependent isn't migrated to the new
          // linked-account system yet (transport_requests.dependent_id still FKs
          // the old profile-only dependents table, which selectedDependentId no
          // longer points at) -- out of scope for this pass, see
          // 20260827000001_dependent_account_linking.sql.
          destinationHospitalId: selectedHospital ? String(selectedHospital.id) : undefined,
          paymentMethod,
        })
        setSubmitting(false)
        navigation.navigate('AmbulanceTracking', { requestId: request.id })
      } catch (err) {
        setSubmitting(false)
        setSubmitError(`Ambulance request failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
      return
    }

    if (!selectedHospital) return
    setSubmitting(true)

    const today     = fmtLocalDate(new Date())
    const startTime = arrivalToTime(arrival ?? 'Now (walk-in)')
    const reason    = `EMERGENCY · ${symptom || customSymptom}`

    // A linked dependent's booking uses THEIR OWN account as patientId (medically
    // correct -- history follows the real person), not the old dependentId column.
    const result = await createHospitalAppointment({
      patientId:     forDependent && selectedDependentId ? selectedDependentId : user.id,
      hospitalId:    String(selectedHospital.id),
      date:          today,
      startTime,
      type:          'in-person',
      reason,
      urgency:       u.id,
      clinicId:      erClinicId,
      paymentMethod: paymentMethod,
    })

    if (result.ok) {
      await addNotification({
        userId: user.id,
        type:   'confirmed',
        title:  'Emergency Booking Confirmed',
        body:   `${result.bookingRef} · ${selectedHospital.name}\nArrival: ${arrival} · A doctor will be assigned on arrival`,
        data:   { appointment_id: result.id, booking_ref: result.bookingRef },
      })
    }

    setSubmitting(false)

    if (result.ok) {
      navigation.navigate('EmergencyConfirmation', {
        urgency:        u.id,
        urgencyLabel:   u.label,
        urgencyColor:   u.color,
        symptom:        symptom || customSymptom,
        hospital:       selectedHospital,
        slot:           arrival,
        total,
        bookingRef:     result.bookingRef,
        bedSpaceStatus: selectedHospital.bed_space_status ?? null,
      })
    } else {
      setSubmitError(`Booking failed: ${result.error}`)
    }
  }

  return (
    <Screen>
      <AppBar
        title="Emergency booking"
        sub="Today only"
        onBack={() => step === 0 ? navigation.goBack() : setStep(p => p - 1)}
      />

      {/* Three equal segments, in red: this flow is not the ordinary booking
          flow wearing a different word, and the rail says so at a glance. */}
      <View
        style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12 }}
        accessibilityLabel={`Step ${step + 1} of 3: ${STEPS[step]}`}>
        {STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: 5 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: i <= step ? t.q.redFill : t.q.line }} />
            <Text style={{ fontSize: 11, fontWeight: i === step ? '700' : '500', color: i === step ? t.q.ink : t.q.ink60 }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

        {/* ── Step 0: what is wrong, and who for ─────────────────── */}
        {step === 0 && (
          <Body keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Notice tone="red" icon="alert-circle-outline">
              If this is life-threatening, call 112 now. This holds a place at a hospital; it does not
              send an ambulance by itself.
            </Notice>

            <SectionHead title="What is the issue?" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
              {SYMPTOMS.map(sym => (
                <Chip
                  key={sym}
                  label={sym}
                  on={symptom === sym}
                  onPress={() => setSymptom(symptom === sym ? '' : sym)}
                />
              ))}
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Field
                label="Or describe it in your own words"
                value={customSymptom}
                onChangeText={setCustomSymptom}
                placeholder="Describe the symptoms…"
                multiline
                numberOfLines={3}
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />
            </View>

            <SectionHead title="Who needs care?" />
            <Card>
              <Row
                icon="person-outline"
                iconTone={!forDependent ? 'teal' : 'neutral'}
                tint={!forDependent}
                title="Me"
                sub="This booking is for you"
                right={!forDependent ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                onPress={() => setForDependent(false)}
              />
              <Hair />
              <Row
                icon="people-outline"
                iconTone={forDependent ? 'teal' : 'neutral'}
                tint={forDependent}
                title="Someone I look after"
                sub={dependentsList.length ? `${dependentsList.length} linked` : 'No dependents linked yet'}
                right={forDependent ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                onPress={() => setForDependent(true)}
              />
              {forDependent && dependentsList.map(d => (
                <View key={d.linkId}>
                  <Hair />
                  <Row
                    icon="person-circle-outline"
                    iconTone={selectedDependentId === d.dependent.id ? 'teal' : 'neutral'}
                    tint={selectedDependentId === d.dependent.id}
                    title={d.dependent.full_name}
                    sub={d.relationship}
                    right={selectedDependentId === d.dependent.id ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                    onPress={() => setSelectedDependentId(d.dependent.id)}
                  />
                </View>
              ))}
            </Card>

            {forDependent && dependentsList.length === 0 && (
              <Notice tone="amber">
                No linked dependents yet. Link one in Profile, then Dependents.
              </Notice>
            )}
          </Body>
        )}

        {/* ── Step 1: how you get there, and where ───────────────── */}
        {step === 1 && (
          <Body>
            <SectionHead title="How will you get there?" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
              {ARRIVAL_OPTIONS.map(opt => (
                <Chip key={opt} label={opt} on={arrival === opt} onPress={() => setArrival(opt)} />
              ))}
            </View>

            {arrival === AMBULANCE_ARRIVAL ? (
              <>
                <Notice tone="red" icon="car-outline">
                  We start looking for the nearest available ambulance as soon as you confirm. The crew
                  decides the receiving hospital from your condition and bed capacity — a preference
                  below is used only where it does not conflict with that.
                </Notice>

                <SectionHead title="Pickup location" />
                <Card>
                  {locationLoading ? (
                    <Row icon="location-outline" title="Getting your location…" sub="This takes a few seconds" />
                  ) : coords ? (
                    <Row
                      icon="location" iconTone="green"
                      title="Location found"
                      sub={`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`}
                      pill="Shared" pillTone="green"
                    />
                  ) : (
                    <Row
                      icon="alert-circle-outline" iconTone="red"
                      title={locationGranted ? 'Could not get a location fix' : 'Location permission is needed'}
                      sub="The crew cannot be sent without it"
                      right={<Btn label="Try again" variant="secondary" small onPress={requestLocation} />}
                    />
                  )}
                </Card>

                {/* Shown before anything is committed: whether help is actually
                    near is the question someone in this flow is really asking. */}
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <NearbyAmbulances coords={coords} />
                </View>

                <SectionHead title="Preferred hospital (optional)" />
                {loadingHospitals ? (
                  <ActivityIndicator color={t.q.red} style={{ marginTop: 8 }} />
                ) : (
                  <Card>
                    {hospitals.map((h, i) => (
                      <View key={String(h.id)}>
                        {i > 0 && <Hair />}
                        <Row
                          icon="business-outline"
                          iconTone={selectedHospital?.id === h.id ? 'red' : 'neutral'}
                          tint={selectedHospital?.id === h.id}
                          title={h.name}
                          sub={h.specialty}
                          right={selectedHospital?.id === h.id ? <Mono size={11} color={t.q.red}>SELECTED</Mono> : undefined}
                          onPress={() => setSelectedHospital(selectedHospital?.id === h.id ? null : h)}
                        />
                      </View>
                    ))}
                  </Card>
                )}
                <BedSpaceAck selectedHospital={selectedHospital} needsAck={needsBedSpaceAck}
                  acked={bedSpaceAck} onToggle={() => setBedSpaceAck(a => !a)} t={t} />
              </>
            ) : arrival ? (
              <>
                <SectionHead title="Select a hospital" />
                <Notice tone="amber">
                  Bed space shown is not guaranteed by the time you arrive — other emergencies, especially
                  more urgent ones, are seen first. First aid may still be given as capacity allows.
                </Notice>

                {loadingHospitals ? (
                  <ActivityIndicator color={t.q.red} style={{ marginTop: 20 }} />
                ) : hospitals.length === 0 ? (
                  <Card>
                    <Empty
                      icon="alert-circle-outline"
                      title="No hospital is open right now"
                      body="If this is life-threatening, call 112 now instead of waiting on a booking."
                    />
                  </Card>
                ) : (
                  <Card>
                    {hospitals.map((h, i) => {
                      const bed = BED_SPACE_META[h.bed_space_status ?? '']
                      return (
                        <View key={String(h.id)}>
                          {i > 0 && <Hair />}
                          <Row
                            icon="business-outline"
                            iconTone={selectedHospital?.id === h.id ? 'red' : 'neutral'}
                            tint={selectedHospital?.id === h.id}
                            title={h.name}
                            sub={[h.specialty, h.distance].filter(Boolean).join(' · ')}
                            pill={bed?.label.replace('Bed space: ', 'Beds: ')}
                            pillTone={h.bed_space_status === 'none' ? 'red'
                              : h.bed_space_status === 'enough' ? 'green' : 'amber'}
                            onPress={() => setSelectedHospital(h)}
                          />
                        </View>
                      )
                    })}
                  </Card>
                )}

                {/* Only for the hospital actually selected, and only when its
                    real-time status is none/very limited. Continue stays locked
                    until it is ticked. */}
                <BedSpaceAck selectedHospital={selectedHospital} needsAck={needsBedSpaceAck}
                  acked={bedSpaceAck} onToggle={() => setBedSpaceAck(a => !a)} t={t} />

                {selectedHospital && (
                  <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                    <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
                      A doctor is assigned by the hospital&apos;s front desk when you arrive.
                    </Text>
                  </View>
                )}
              </>
            ) : null}
          </Body>
        )}

        {/* ── Step 2: confirm and pay ────────────────────────────── */}
        {step === 2 && (
          <Body>
            <SectionHead title={isAmbulance ? 'Ambulance request' : 'Booking summary'} />
            <Card>
              {isAmbulance ? (
                <>
                  <DetailRow label="Preferred" value={selectedHospital?.name ?? 'Nearest crew decides'} />
                  <DetailRow label="Condition" value={symptom || customSymptom || '—'} />
                  <DetailRow label="Pickup"
                    value={coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : '—'} mono last />
                </>
              ) : (
                <>
                  <DetailRow label="Hospital" value={selectedHospital?.name ?? '—'} />
                  <DetailRow label="Doctor" value="Assigned on arrival" />
                  <DetailRow label="Arrival" value={arrival ?? '—'} />
                  <DetailRow label="Condition" value={symptom || customSymptom || '—'} />
                  <DetailRow label="Queue" value="Top of today's queue" last />
                </>
              )}
            </Card>

            {isAmbulance ? (
              <Notice tone="amber" icon="card-outline">
                Ambulance fees are billed after the trip, from distance and time on scene — there is
                nothing to pay now. The method below is used for that final charge.
              </Notice>
            ) : (
              <>
                <SectionHead title="Fee" />
                <Card>
                  <DetailRow label="Consultation" value={`₦${baseFee.toLocaleString('en-NG')}`} mono />
                  <DetailRow label={`Emergency (${u.badge})`} value={`+₦${premium.toLocaleString('en-NG')}`} mono />
                  <DetailRow label="Platform fee" value="₦500" mono />
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 48 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: t.q.ink }}>Total</Text>
                    <Mono size={17} weight="700" color={t.q.red}>₦{total.toLocaleString('en-NG')}</Mono>
                  </View>
                </Card>
              </>
            )}

            <SectionHead title="Payment method" />
            <Card>
              {PAYMENT_OPTIONS.map((p, i) => {
                const on = paymentMethod === p.id
                return (
                  <View key={p.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon={p.icon}
                      iconTone={on ? 'red' : 'neutral'}
                      tint={on}
                      title={p.label}
                      sub={p.sub}
                      right={on ? <Mono size={11} color={t.q.red}>SELECTED</Mono> : undefined}
                      onPress={() => setPaymentMethod(p.id)}
                    />
                  </View>
                )
              })}
            </Card>

            <Notice tone="amber" icon="flash-outline">
              {isAmbulance
                ? 'Dispatch starts the moment you confirm — the nearest available crew is notified immediately.'
                : 'Emergency bookings go to the top of the queue immediately after payment.'}
            </Notice>

            {/* Available before anything is confirmed. If someone opens this
                screen and decides they cannot wait on the flow at all, the
                numbers are already in front of them. */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <FallbackPanel />
            </View>
          </Body>
        )}
      </KeyboardAvoidingView>

      {!!submitError && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
          <Text style={{ fontSize: 12, color: t.q.red, textAlign: 'center' }}>{submitError}</Text>
        </View>
      )}

      <BottomBar meta={
        step === 2 && !isAmbulance ? (
          <>
            <Mono size={12} color={t.q.ink60}>Total</Mono>
            <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
            <Mono size={12} weight="700">₦{total.toLocaleString('en-NG')}</Mono>
          </>
        ) : undefined
      }>
        {step > 0 && <Btn label="Back" variant="secondary" onPress={() => setStep(p => p - 1)} />}
        {step < 2 ? (
          <Btn grow label="Continue" disabled={!canProceed()} onPress={() => setStep(p => p + 1)} />
        ) : (
          <Btn
            grow
            variant="danger"
            icon="alert-circle-outline"
            label={isAmbulance ? 'Confirm & dispatch' : `Confirm · ₦${total.toLocaleString('en-NG')}`}
            loading={submitting}
            onPress={handleConfirm}
          />
        )}
      </BottomBar>
    </Screen>
  )
}
