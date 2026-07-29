import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { useLocation } from '../contexts/LocationContext'
import { getHospitals, createHospitalAppointment, addNotification, getHospitalHours, isOpenNow, getClinicsForHospital, getDependents, findEmergencyClinic } from '../lib/api'
import { requestAmbulance, triageForSymptom } from '../lib/ambulance-api'
import { toDisplayHospital } from '../lib/adapters'
import type { DisplayHospital } from '../components/hospital/HospitalCard'

interface Props { navigation: any }

const STEPS = ['Triage', 'Hospital', 'Payment']

// Every booking made through this screen is, by definition, an emergency — there is no
// tier to pick. A separate "urgent" tier was removed because patients confused it with
// emergency and expected the same queue-jump priority, which it never actually granted.
const EMERGENCY_TIER = {
  id: 'emergency' as const, label: 'Emergency',
  multiplier: 2.0, badge: '2× fee', color: '#FF5C5C',
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
  none:         { icon: 'close-circle-outline',       label: 'Bed space: None',         color: '#FF5C5C' },
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

export function EmergencyBookingScreen({ navigation }: Props) {
  const { theme: t }  = useTheme()
  const { user }      = useAuth()
  const { coords, granted: locationGranted, loading: locationLoading, request: requestLocation } = useLocation()

  const [step,              setStep]             = useState(0)
  const [symptom,           setSymptom]          = useState('')
  const [customSymptom,     setCustomSymptom]    = useState('')
  const [forDependent,      setForDependent]     = useState(false)
  // MH7: track which dependent to book for
  const [dependentsList,    setDependentsList]   = useState<any[]>([])
  const [selectedDependentId, setSelectedDependentId] = useState<string | null>(null)
  const [hospitals,         setHospitals]        = useState<DisplayHospital[]>([])
  const [loadingHospitals,  setLoadingHospitals] = useState(false)
  const [selectedHospital,  setSelectedHospital] = useState<DisplayHospital | null>(null)
  const [erClinicId,        setErClinicId]       = useState<string | undefined>(undefined)
  const [arrival,           setArrival]          = useState<string | null>(null)
  const [paymentMethod,     setPaymentMethod]    = useState('card')
  const [submitting,        setSubmitting]       = useState(false)
  const [submitError,       setSubmitError]      = useState('')

  const u = EMERGENCY_TIER
  const baseFee   = selectedHospital?.opd_fee ?? 15000
  const premium   = Math.round(baseFee * (u.multiplier - 1))
  const total     = baseFee + premium + 500
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

  // MH7: load dependents when user selects "A dependent"
  useEffect(() => {
    if (forDependent && user && dependentsList.length === 0) {
      getDependents(user.id).then(setDependentsList)
    }
    if (!forDependent) setSelectedDependentId(null)
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

  const canProceed = () => {
    if (step === 0) return !!(symptom || customSymptom.trim())
    if (step === 1) {
      if (arrival === AMBULANCE_ARRIVAL) return !!coords
      return !!(selectedHospital && arrival)
    }
    return true
  }

  async function handleConfirm() {
    if (!user) return
    setSubmitError('')

    if (arrival === AMBULANCE_ARRIVAL) {
      if (!coords) { setSubmitError('Location is required to dispatch an ambulance.'); return }
      setSubmitting(true)
      const { triageLevel, requiredTier } = triageForSymptom(symptom || customSymptom)
      try {
        const { request } = await requestAmbulance({
          requestType:           'emergency',
          triageLevel,
          requiredTier,
          lat:                   coords.latitude,
          lng:                   coords.longitude,
          contactPhone:          user.phone ?? undefined,
          symptomDescription:    symptom || customSymptom,
          dependentId:           forDependent && selectedDependentId ? selectedDependentId : undefined,
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

    const result = await createHospitalAppointment({
      patientId:     user.id,
      hospitalId:    String(selectedHospital.id),
      date:          today,
      startTime,
      type:          'in-person',
      reason,
      urgency:       u.id,
      clinicId:      erClinicId,
      dependentId:   forDependent && selectedDependentId ? selectedDependentId : undefined,
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
        urgency:      u.id,
        urgencyLabel: u.label,
        urgencyColor: u.color,
        symptom:      symptom || customSymptom,
        hospital:     selectedHospital,
        slot:         arrival,
        total,
        bookingRef:   result.bookingRef,
      })
    } else {
      setSubmitError(`Booking failed: ${result.error}`)
    }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => step === 0 ? navigation.goBack() : setStep(p => p - 1)} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={t.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={s.headerTitleRow}>
            <Ionicons name="alert-circle-outline" size={18} color="#FF5C5C" />
            <Text style={[s.headerTitle, { color: '#FF5C5C' }]}>Emergency Booking</Text>
          </View>
          <Text style={[s.headerSub, { color: t.textMuted }]}>Skip the queue · Immediate attention</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={s.progressRow}>
        {STEPS.map((st, i) => (
          <View key={st} style={{ flex: 1 }}>
            <View style={[s.progressBar, { backgroundColor: i <= step ? '#FF5C5C' : t.cardBorder }]} />
            <Text style={[s.progressLabel, { color: i <= step ? '#FF5C5C' : t.textMuted, fontWeight: i === step ? '700' : '400' }]}>
              {st}
            </Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* ── Step 0: Triage ───────────────────────────────────── */}
      {step === 0 && (
        <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false}>
          <View style={[s.alertBanner, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.25)' }]}>
            <Ionicons name="alert-circle-outline" size={20} color="#EF9F27" />
            <Text style={[s.alertText, { color: '#FF5C5C' }]}>
              If life-threatening, call <Text style={{ fontWeight: '900' }}>112</Text> immediately.
            </Text>
          </View>

          <Text style={[s.label, { color: t.textMuted }]}>What's the issue? <Text style={{ color: '#FF5C5C' }}>*</Text></Text>
          <View style={s.symptomGrid}>
            {SYMPTOMS.map(sym => (
              <TouchableOpacity key={sym} onPress={() => setSymptom(symptom === sym ? '' : sym)}
                style={[s.symptomChip, {
                  borderColor:     symptom === sym ? '#FF5C5C' : t.cardBorder,
                  backgroundColor: symptom === sym ? 'rgba(255,92,92,0.1)' : t.cardBg,
                }]}>
                <Text style={[s.symptomText, { color: symptom === sym ? '#FF5C5C' : t.textSecondary }]}>{sym}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.orDivider, { color: t.textMuted }]}>— or describe in your own words —</Text>
          <TextInput
            value={customSymptom} onChangeText={setCustomSymptom}
            placeholder="Describe symptoms…" placeholderTextColor={t.textMuted}
            multiline numberOfLines={3}
            style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
          />

          <Text style={[s.label, { color: t.textMuted }]}>Who needs care?</Text>
          <View style={s.forRow}>
            {[false, true].map(dep => (
              <TouchableOpacity key={String(dep)} onPress={() => setForDependent(dep)}
                style={[s.forBtn, {
                  borderColor:     forDependent === dep ? t.accent : t.cardBorder,
                  backgroundColor: forDependent === dep ? t.accentBg : t.cardBg,
                }]}>
                <Ionicons name={dep ? 'people-outline' : 'person-outline'} size={18} color={forDependent === dep ? t.accent : t.textMuted} style={{ marginBottom: 4 }} />
                <Text style={[s.forBtnText, { color: forDependent === dep ? t.accent : t.textMuted }]}>
                  {dep ? 'A dependent' : 'Myself'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* MH7: dependent selector */}
          {forDependent && dependentsList.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {dependentsList.map(d => (
                <TouchableOpacity key={d.id} onPress={() => setSelectedDependentId(d.id)}
                  style={[s.forBtn, {
                    flexDirection: 'row', justifyContent: 'flex-start', gap: 10, marginBottom: 8,
                    borderColor:     selectedDependentId === d.id ? t.accent : t.cardBorder,
                    backgroundColor: selectedDependentId === d.id ? t.accentBg : t.cardBg,
                  }]}>
                  <Ionicons name="person-outline" size={16} color="rgba(255,255,255,0.6)" />
                  <Text style={[s.forBtnText, { color: selectedDependentId === d.id ? t.accent : t.textMuted }]}>
                    {d.full_name} {d.relationship ? `(${d.relationship})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {forDependent && dependentsList.length === 0 && (
            <Text style={[s.noteInline, { color: t.textMuted, marginTop: 8 }]}>
              No dependents added yet. Add a dependent in Profile › Dependents.
            </Text>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* ── Step 1: Hospital & Doctor ─────────────────────────── */}
      {step === 1 && (
        <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false}>
          <Text style={[s.label, { color: t.textMuted, marginTop: 0 }]}>How will you get there?</Text>
          <View style={s.slotRow}>
            {ARRIVAL_OPTIONS.map(opt => (
              <TouchableOpacity key={opt} onPress={() => setArrival(opt)}
                style={[s.slotChip, {
                  borderColor:     arrival === opt ? '#FF5C5C' : t.cardBorder,
                  backgroundColor: arrival === opt ? 'rgba(255,92,92,0.1)' : t.cardBg,
                }]}>
                <Text style={[s.slotText, { color: arrival === opt ? '#FF5C5C' : t.textMuted, fontWeight: arrival === opt ? '700' : '400' }]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {arrival === AMBULANCE_ARRIVAL ? (
            <>
              <View style={[s.noteBox, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.3)' }]}>
                <Text style={[s.noteText, { color: '#FF5C5C' }]}>
                  An ambulance will be dispatched to your current location immediately after you confirm.
                  The nearest available crew decides the receiving hospital based on your condition and
                  bed capacity — a preference below is used only when it doesn't conflict with that.
                </Text>
              </View>

              <Text style={[s.label, { color: t.textMuted }]}>Pickup location</Text>
              {locationLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color="#FF5C5C" />
                  <Text style={[s.noteInline, { color: t.textMuted }]}>Getting your location…</Text>
                </View>
              ) : coords ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location" size={14} color="#00C265" />
                  <Text style={[s.noteInline, { color: t.textSecondary, marginTop: 0 }]}>
                    Location found ({coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)})
                  </Text>
                </View>
              ) : (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="alert-circle-outline" size={14} color="#FF5C5C" />
                    <Text style={[s.noteInline, { color: '#FF5C5C', marginTop: 0 }]}>
                      {locationGranted ? 'Could not get a location fix.' : 'Location permission is required.'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={requestLocation} style={[s.forBtn, { marginTop: 8, alignItems: 'center' }]}>
                    <Text style={[s.forBtnText, { color: t.accent }]}>Try again</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={[s.label, { color: t.textMuted }]}>Preferred hospital (optional)</Text>
              {loadingHospitals ? (
                <ActivityIndicator color="#FF5C5C" style={{ marginTop: 8 }} />
              ) : (
                hospitals.map(h => (
                  <TouchableOpacity key={h.id}
                    onPress={() => setSelectedHospital(selectedHospital?.id === h.id ? null : h)}
                    style={[s.hospitalCard, {
                      borderColor:     selectedHospital?.id === h.id ? '#FF5C5C' : t.cardBorder,
                      backgroundColor: selectedHospital?.id === h.id ? 'rgba(255,92,92,0.06)' : t.cardBg,
                    }]}>
                    <View style={s.hospitalTop}>
                      <View style={[s.hospitalAvatar, { backgroundColor: h.avatarBg }]}>
                        <Text style={[s.hospitalAvatarText]}>{h.avatar}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.hospitalName, { color: t.textPrimary }]} numberOfLines={1}>{h.name}</Text>
                        <Text style={[s.hospitalSpec, { color: t.textMuted }]}>{h.specialty}</Text>
                      </View>
                      {selectedHospital?.id === h.id && (
                        <View style={[s.selectedCheck, { backgroundColor: '#FF5C5C' }]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 20 }} />
            </>
          ) : arrival ? (
          <>
          <Text style={[s.label, { color: t.textMuted }]}>Select hospital</Text>
          <View style={[s.noteBox, { backgroundColor: 'rgba(255,181,71,0.08)', borderColor: 'rgba(255,181,71,0.3)', marginTop: 0, marginBottom: 12 }]}>
            <Text style={[s.noteText, { color: '#FFB547' }]}>
              Bed space shown isn't guaranteed by the time you arrive — other emergencies, especially
              those triaged as more urgent, are seen first. Basic first aid may still be given as the
              hospital's capacity allows.
            </Text>
          </View>
          {loadingHospitals ? (
            <ActivityIndicator color="#FF5C5C" style={{ marginTop: 20 }} />
          ) : hospitals.length === 0 ? (
            <View style={[s.noHospitalsBox, { borderColor: 'rgba(255,92,92,0.35)', backgroundColor: 'rgba(255,92,92,0.06)' }]}>
              <Ionicons name="alert-circle-outline" size={28} color="#FF5C5C" style={{ marginBottom: 8 }} />
              <Text style={[s.noHospitalsTitle, { color: '#FF5C5C' }]}>No hospitals currently available</Text>
              <Text style={[s.noHospitalsText, { color: t.textMuted }]}>
                Every hospital on Queue is closed right now. If this is life-threatening, call{' '}
                <Text style={{ fontWeight: '800', color: '#FF5C5C' }}>112</Text> immediately instead of waiting on a booking.
              </Text>
            </View>
          ) : (
            hospitals.map(h => (
              <TouchableOpacity key={h.id}
                onPress={() => setSelectedHospital(h)}
                style={[s.hospitalCard, {
                  borderColor:     selectedHospital?.id === h.id ? '#FF5C5C' : t.cardBorder,
                  backgroundColor: selectedHospital?.id === h.id ? 'rgba(255,92,92,0.06)' : t.cardBg,
                }]}>
                <View style={s.hospitalTop}>
                  <View style={[s.hospitalAvatar, { backgroundColor: h.avatarBg }]}>
                    <Text style={[s.hospitalAvatarText]}>{h.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={[s.hospitalName, { color: t.textPrimary }]} numberOfLines={1}>{h.name}</Text>
                      {h.verified && <Ionicons name="checkmark-circle" size={13} color="#00E87A" />}
                    </View>
                    <Text style={[s.hospitalSpec, { color: t.textMuted }]}>{h.specialty}</Text>
                  </View>
                  {selectedHospital?.id === h.id && (
                    <View style={[s.selectedCheck, { backgroundColor: '#FF5C5C' }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={s.hospitalMeta}>
                  {[
                    ...(BED_SPACE_META[h.bed_space_status ?? ''] ? [BED_SPACE_META[h.bed_space_status ?? '']!] : []),
                    { icon: 'alert-circle-outline' as const, label: 'Emergency', color: '#FF5C5C' },
                    { icon: 'time-outline' as const,         label: h.wait,      color: t.textSecondary },
                    { icon: 'location-outline' as const,     label: h.distance,  color: t.textSecondary },
                  ].map(m => (
                    <View key={m.label} style={[s.metaChip, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                      <Ionicons name={m.icon} size={11} color={m.color} />
                      <Text style={[s.metaText, { color: m.color, fontWeight: m.color === '#FF5C5C' || m.color === '#FF8C42' ? '700' : '400' }]}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))
          )}
          {selectedHospital && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 }}>
              <Ionicons name="medical-outline" size={13} color={t.textMuted} style={{ marginTop: 1 }} />
              <Text style={[s.noteInline, { color: t.textMuted, marginTop: 0, flex: 1 }]}>
                A doctor will be assigned by the hospital's front desk when you arrive.
              </Text>
            </View>
          )}
          <View style={{ height: 20 }} />
          </>
          ) : null}
        </ScrollView>
      )}

      {/* ── Step 2: Payment ───────────────────────────────────── */}
      {step === 2 && (
        <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={[s.summaryCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[s.summaryHeading, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>
              {isAmbulance ? 'Ambulance request summary' : 'Booking summary'}
            </Text>
            {(isAmbulance ? [
              { label: 'Preferred hospital', value: selectedHospital?.name ?? 'Nearest crew decides' },
              { label: 'Condition',          value: symptom || customSymptom || '—' },
              { label: 'Pickup location',    value: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : '—' },
            ] : [
              { label: 'Hospital',       value: selectedHospital?.name ?? '—' },
              { label: 'Doctor',         value: 'Assigned on arrival' },
              { label: 'Arrival',        value: arrival ?? '—' },
              { label: 'Urgency',        value: u.label },
              { label: 'Condition',      value: symptom || customSymptom || '—' },
              { label: 'Queue priority', value: 'Top of queue' },
            ]).map(row => (
              <View key={row.label} style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
                <Text style={[s.summaryLabel, { color: t.textMuted }]}>{row.label}</Text>
                <Text style={[s.summaryValue, { color: t.textPrimary }]} numberOfLines={2}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Fee breakdown */}
          {isAmbulance ? (
            <View style={[s.noteBox, { backgroundColor: 'rgba(255,181,71,0.08)', borderColor: 'rgba(255,181,71,0.3)' }]}>
              <Text style={[s.noteText, { color: '#FFB547' }]}>
                Ambulance fees are billed after the trip completes, based on distance and time on scene —
                there's nothing to pay now. Your payment method below is used for that final charge.
              </Text>
            </View>
          ) : (
            <View style={[s.summaryCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[s.summaryHeading, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Fee breakdown</Text>
              <View style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
                <Text style={[s.summaryLabel, { color: t.textMuted }]}>Base consultation</Text>
                <Text style={[s.summaryValue, { color: t.textPrimary }]}>₦{baseFee.toLocaleString()}</Text>
              </View>
              <View style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
                <Text style={[s.summaryLabel, { color: t.textMuted }]}>Emergency premium ({u.badge})</Text>
                <Text style={[s.summaryValue, { color: u.color }]}>+₦{premium.toLocaleString()}</Text>
              </View>
              <View style={[s.summaryRow, { borderBottomColor: t.cardBorder }]}>
                <Text style={[s.summaryLabel, { color: t.textMuted }]}>Platform fee</Text>
                <Text style={[s.summaryValue, { color: t.textPrimary }]}>₦500</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={[s.totalLabel, { color: t.textPrimary }]}>Total</Text>
                <Text style={[s.totalValue, { color: u.color }]}>₦{total.toLocaleString()}</Text>
              </View>
            </View>
          )}

          {/* Payment method */}
          <Text style={[s.label, { color: t.textMuted }]}>Payment method</Text>
          {PAYMENT_OPTIONS.map(p => {
            const active = paymentMethod === p.id
            return (
              <TouchableOpacity key={p.id} onPress={() => setPaymentMethod(p.id)}
                style={[s.payRow, {
                  backgroundColor: active ? 'rgba(255,92,92,0.08)' : t.cardBg,
                  borderColor:     active ? 'rgba(255,92,92,0.4)'  : t.cardBorder,
                }]}>
                <Ionicons name={p.icon} size={20} color={active ? '#FF5C5C' : t.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.payLabel, { color: active ? '#FF5C5C' : t.textPrimary }]}>{p.label}</Text>
                  <Text style={[s.paySub,   { color: t.textMuted }]}>{p.sub}</Text>
                </View>
                <View style={[s.payRadio, { borderColor: active ? '#FF5C5C' : t.cardBorder, backgroundColor: active ? '#FF5C5C' : 'transparent' }]}>
                  {active && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
              </TouchableOpacity>
            )
          })}

          <View style={[s.noteBox, { backgroundColor: 'rgba(255,181,71,0.08)', borderColor: 'rgba(255,181,71,0.3)', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }]}>
            <Ionicons name="flash-outline" size={14} color="#FFB547" style={{ marginTop: 1 }} />
            <Text style={[s.noteText, { color: '#FFB547', flex: 1 }]}>
              {isAmbulance
                ? 'Dispatch starts the moment you confirm — the nearest available crew is notified immediately.'
                : 'Emergency bookings are placed at the top of the queue immediately after payment.'}
            </Text>
          </View>
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
      </KeyboardAvoidingView>

      {/* CTA */}
      {!!submitError && (
        <Text style={{ color: '#F87171', fontSize: 12, textAlign: 'center', paddingBottom: 6 }}>{submitError}</Text>
      )}
      <View style={[s.cta, { borderTopColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
        {step > 0 && (
          <TouchableOpacity onPress={() => setStep(p => p - 1)}
            style={[s.backStepBtn, { borderColor: t.cardBorder, backgroundColor: t.cardBg, flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
            <Ionicons name="arrow-back" size={14} color={t.textPrimary} />
            <Text style={[s.backStepText, { color: t.textPrimary }]}>Back</Text>
          </TouchableOpacity>
        )}
        {step < 2 ? (
          <TouchableOpacity onPress={() => setStep(p => p + 1)} disabled={!canProceed()}
            style={[s.nextBtn, { backgroundColor: canProceed() ? '#FF5C5C' : t.inputBg, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
            <Text style={[s.nextBtnText, { color: canProceed() ? '#fff' : t.textMuted }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={16} color={canProceed() ? '#fff' : t.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleConfirm} disabled={submitting}
            style={[s.nextBtn, { backgroundColor: '#FF5C5C', flex: 1, opacity: submitting ? 0.6 : 1 }]}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="alert-circle-outline" size={15} color="#fff" /><Text style={[s.nextBtnText, { color: '#fff' }]}>{isAmbulance ? 'Confirm & Dispatch' : 'Confirm & Pay'}</Text></View>}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:              { flex: 1 },
  header:            { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  backBtn:           { padding: 4, marginTop: 2 },
  backArrow:         { fontSize: 22 },
  headerTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle:       { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  headerSub:         { fontSize: 11, marginTop: 2 },
  progressRow:       { flexDirection: 'row', gap: 5, paddingHorizontal: 20, marginBottom: 4 },
  progressBar:       { height: 3, borderRadius: 99, marginBottom: 3 },
  progressLabel:     { fontSize: 9 },
  stepScroll:        { flex: 1, paddingHorizontal: 20 },
  label:             { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 16 },
  emptyText:         { fontSize: 13, textAlign: 'center', marginTop: 20 },
  noHospitalsBox:    { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 16 },
  noHospitalsTitle:  { fontSize: 14, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  noHospitalsText:   { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  // Alert
  alertBanner:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 13, marginTop: 12, marginBottom: 4, borderWidth: 1 },
  alertText:         { fontSize: 12, flex: 1, lineHeight: 17, fontWeight: '500' },
  noteInline:        { fontSize: 11, lineHeight: 16, marginTop: 4 },
  // Symptoms
  symptomGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  symptomChip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  symptomText:       { fontSize: 11, fontWeight: '500' },
  orDivider:         { fontSize: 11, textAlign: 'center', marginVertical: 12 },
  textarea:          { borderRadius: 13, borderWidth: 1, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  forRow:            { flexDirection: 'row', gap: 8 },
  forBtn:            { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 4 },
  forBtnText:        { fontSize: 13, fontWeight: '600' },
  // Hospital
  hospitalCard:      { borderRadius: 18, padding: 14, borderWidth: 1.5, marginBottom: 10 },
  hospitalTop:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  hospitalAvatar:    { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hospitalAvatarText:{ fontSize: 12, fontWeight: '800', color: '#00E87A' },
  hospitalName:      { fontSize: 14, fontWeight: '700' },
  hospitalSpec:      { fontSize: 11, marginTop: 1 },
  selectedCheck:     { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hospitalMeta:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  metaText:          { fontSize: 11 },
  // Arrival
  slotRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  slotChip:          { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  slotText:          { fontSize: 12 },
  // Payment / Summary
  summaryCard:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  summaryHeading:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  summaryLabel:      { fontSize: 12, flexShrink: 0 },
  summaryValue:      { fontSize: 12, fontWeight: '500', textAlign: 'right', flex: 1 },
  totalRow:          { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14 },
  totalLabel:        { fontSize: 14, fontWeight: '700' },
  totalValue:        { fontSize: 15, fontWeight: '800' },
  payRow:            { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1.5 },
  payLabel:          { fontSize: 13, fontWeight: '600' },
  paySub:            { fontSize: 11, marginTop: 1 },
  payRadio:          { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  noteBox:           { borderRadius: 12, padding: 13, borderWidth: 1, marginTop: 4 },
  noteText:          { fontSize: 12, lineHeight: 18 },
  // CTA
  cta:               { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 20, borderTopWidth: 1 },
  backStepBtn:       { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backStepText:      { fontSize: 13, fontWeight: '600' },
  nextBtn:           { padding: 15, borderRadius: 14, alignItems: 'center' },
  nextBtnText:       { fontSize: 15, fontWeight: '700' },
})
