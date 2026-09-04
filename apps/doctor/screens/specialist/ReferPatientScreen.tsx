import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'
import {
  getHospitals, getHospitalById, getClinicsForHospital, createReferral,
  getHospitalHours, getClinicHours, isOpenNow, findEmergencyClinic,
  type HospitalWithDoctors, type Clinic, type DayHours,
} from '@queue/shared/lib/api'
import type { Doctor } from '@queue/shared/types/database'

interface Props {
  navigation: any
  route: {
    params: {
      // The appointment this referral is made from -- identifies the patient
      // server-side (works for walk-ins with no linked account, not just
      // registered patients) and is what gets auto-completed if still in progress.
      appointmentId: string
      patientName: string
      ownHospitalId: string
      // Copy-only: whether that appointment is currently in progress.
      isInProgress?: boolean
    }
  }
}

// Mirrors BookingFlowScreen.tsx's own default -- Mon-Sat 08:00-18:00, Sunday closed.
function defaultDayHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '18:00', closed: day === 0 }))
}

// hours=null means "not loaded yet" -- falls back to every day but Sunday, same
// convention as BookingFlowScreen's getBookingDates, so the picker isn't empty while
// real hours are still in flight.
function nextOpenDays(n: number, hours: DayHours[] | null) {
  const closedDays = new Set(hours ? hours.filter(h => h.closed).map(h => h.day) : [0])
  const out: { iso: string; label: string }[] = []
  let offset = 0
  const maxOffset = 180
  while (out.length < n && offset < maxOffset) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    if (!closedDays.has(d.getDay())) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ iso, label: offset === 0 ? 'Today' : d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) })
    }
    offset++
  }
  return out
}

// Hourly marks between open and close (exclusive of close).
function hourlySlotsForDate(hours: DayHours[], iso: string): string[] {
  const day = hours.find(h => h.day === new Date(iso + 'T00:00:00').getDay())
  if (!day || day.closed) return []
  const [oh] = day.open.split(':').map(Number)
  const [ch] = day.close.split(':').map(Number)
  const out: string[] = []
  for (let hour = oh; hour < ch; hour++) out.push(`${String(hour).padStart(2, '0')}:00`)
  return out
}

function fmt12(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ReferPatientScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { appointmentId, patientName, ownHospitalId, isInProgress } = route.params

  const [mode, setMode] = useState<'same' | 'other'>('same')

  const [search, setSearch] = useState('')
  const [hospitals, setHospitals] = useState<HospitalWithDoctors[]>([])
  const [loadingHospitals, setLoadingHospitals] = useState(false)
  const [selectedHospital, setSelectedHospital] = useState<HospitalWithDoctors | null>(null)
  const [loadingClinics, setLoadingClinics] = useState(false)
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [selectedClinicId, setSelectedClinicId] = useState('')
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)

  // Operating hours -- the clinic's own hours win if it has set any custom ones,
  // otherwise the hospital's hours apply. Same fallback convention as BookingFlowScreen.
  const [hospitalHours, setHospitalHours] = useState<DayHours[] | null>(null)
  const [clinicHoursState, setClinicHoursState] = useState<{ hours: DayHours[]; isCustom: boolean } | null>(null)
  const effectiveHours: DayHours[] = selectedClinicId
    ? (clinicHoursState?.isCustom ? clinicHoursState.hours : (hospitalHours ?? defaultDayHours()))
    : (hospitalHours ?? defaultDayHours())

  const [date, setDate] = useState(todayIso())
  const [startTime, setStartTime] = useState('09:00')
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('routine')
  const isEmergency = urgency === 'emergency'
  const [reason, setReason] = useState('')
  const [referralReason, setReferralReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Defaults off so a doctor sending several referrals out of the same visit (e.g.
  // Cardiology AND Radiology) doesn't prematurely end the consult on the first one --
  // they flip it on for the last referral, or just end the consult themselves after.
  const [completeConsult, setCompleteConsult] = useState(false)

  const loadClinics = useCallback(async (hospitalId: string) => {
    setLoadingClinics(true)
    const data = await getClinicsForHospital(hospitalId)
    setClinics(data)
    setLoadingClinics(false)
  }, [])

  // "Same hospital" mode needs no search -- load the caller's own hospital + its
  // clinics as soon as the screen opens in that mode.
  useEffect(() => {
    if (mode !== 'same') return
    let cancelled = false
    setLoadingHospitals(true)
    getHospitalById(ownHospitalId).then(h => {
      if (cancelled) return
      setSelectedHospital(h)
      setLoadingHospitals(false)
    })
    loadClinics(ownHospitalId)
    return () => { cancelled = true }
  }, [mode, ownHospitalId, loadClinics])

  const loadHospitals = useCallback(async (q: string) => {
    setLoadingHospitals(true)
    const data = await getHospitals(q)
    setHospitals(data.filter(h => h.id !== ownHospitalId))
    setLoadingHospitals(false)
  }, [ownHospitalId])

  useEffect(() => {
    if (mode !== 'other' || selectedHospital) return
    const timer = setTimeout(() => loadHospitals(search), 300)
    return () => clearTimeout(timer)
  }, [mode, search, selectedHospital, loadHospitals])

  // Load the selected hospital's own operating hours -- covers both "same hospital"
  // (fires once selectedHospital resolves above) and "other hospital" (fires on pick).
  useEffect(() => {
    if (!selectedHospital?.id) { setHospitalHours(null); return }
    let cancelled = false
    getHospitalHours(String(selectedHospital.id)).then(h => { if (!cancelled) setHospitalHours(h) })
    return () => { cancelled = true }
  }, [selectedHospital?.id])

  useEffect(() => {
    if (!selectedClinicId) { setClinicHoursState(null); return }
    let cancelled = false
    getClinicHours(selectedClinicId).then(h => { if (!cancelled) setClinicHoursState(h) })
    return () => { cancelled = true }
  }, [selectedClinicId])

  function switchMode(next: 'same' | 'other') {
    if (next === mode) return
    setMode(next)
    setSelectedHospital(null); setClinics([]); setSelectedClinicId(''); setSelectedDoctor(null)
    setSearch(''); setHospitals([])
  }

  function pickOtherHospital(h: HospitalWithDoctors) {
    setSelectedHospital(h); setSelectedDoctor(null); setSelectedClinicId('')
    haptics.tap()
    loadClinics(h.id)
  }

  // Once emergency is flagged, only the hospital's designated Emergency Department clinic
  // is selectable -- mirrors BookingFlowScreen, so a life-threatening referral can't
  // accidentally get routed through a normal specialist queue.
  const emergencyClinic = findEmergencyClinic(clinics)
  const visibleClinics = isEmergency ? (emergencyClinic ? [emergencyClinic] : []) : clinics
  const noEmergencyClinic = isEmergency && clinics.length > 0 && !emergencyClinic
  useEffect(() => {
    if (isEmergency && emergencyClinic && selectedClinicId !== emergencyClinic.id) {
      setSelectedClinicId(emergencyClinic.id)
    }
  }, [isEmergency, emergencyClinic?.id])

  const hospitalOpenNow = selectedHospital ? isOpenNow(effectiveHours, (selectedHospital as any).is_24_hours) : null
  const emergencyMaybeClosed = isEmergency && selectedHospital && hospitalOpenNow === false
    && !(selectedHospital as any).emergency_hours && !(selectedHospital as any).is_24_hours

  const openDates = nextOpenDays(14, effectiveHours)
  useEffect(() => {
    if (isEmergency) return
    if (openDates.length > 0 && !openDates.some(d => d.iso === date)) setDate(openDates[0].iso)
  }, [effectiveHours, isEmergency])

  const timeOptions = hourlySlotsForDate(effectiveHours, date)
  useEffect(() => {
    if (isEmergency) return
    if (timeOptions.length > 0 && !timeOptions.includes(startTime)) setStartTime(timeOptions[0])
  }, [effectiveHours, date, isEmergency])

  const filteredDoctors = (selectedHospital?.doctors ?? [])
    .filter(d => !selectedClinicId || (d as any).clinic_id === selectedClinicId)

  async function submit() {
    if (!selectedHospital) { Alert.alert('Select a hospital', 'Pick the hospital you\'re referring this patient to.'); return }
    if (!referralReason.trim()) { Alert.alert('Reason required', 'Enter a reason for the referral.'); return }
    if (noEmergencyClinic) { Alert.alert('No Emergency Department', `${selectedHospital.name} hasn't set up an Emergency Department.`); return }

    setSubmitting(true)
    const result = await createReferral({
      appointmentId,
      receivingHospitalId: selectedHospital.id,
      receivingClinicId: selectedClinicId || undefined,
      receivingDoctorId: selectedDoctor?.id,
      date: isEmergency ? todayIso() : date,
      startTime: isEmergency ? nowHHMM() : startTime,
      type: 'in-person',
      reason: reason || undefined,
      referralReason: referralReason.trim(),
      urgency,
      completeOriginal: isInProgress ? completeConsult : false,
    })
    setSubmitting(false)

    if (!result.ok) {
      haptics.error()
      Alert.alert('Referral failed', result.error)
      return
    }

    haptics.success()
    const base = result.approvalStatus === 'pending_approval'
      ? `Booking ${result.bookingRef} is awaiting ${selectedHospital.name}'s approval.`
      : `Booking ${result.bookingRef} is confirmed at ${selectedHospital.name}.`
    Alert.alert(
      'Referral sent',
      result.originalCompleted
        ? `${base} This consultation has been marked complete.`
        : `${base} This consultation is still open -- refer another patient or end it from the Queue when you're done.`,
      [{ text: 'Done', onPress: () => navigation.goBack() }],
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Ionicons name="arrow-back" size={22} color={t.textMuted} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: t.textPrimary }]} numberOfLines={1}>Refer {patientName}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TouchableOpacity onPress={() => switchMode('same')}
              style={[st.modeBtn, { borderColor: mode === 'same' ? t.accent : t.cardBorder, backgroundColor: mode === 'same' ? t.accentBg : t.cardBg }]}>
              <Text style={{ color: mode === 'same' ? t.accent : t.textPrimary, fontSize: 12, fontWeight: '700' }}>Same Hospital</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => switchMode('other')}
              style={[st.modeBtn, { borderColor: mode === 'other' ? t.accent : t.cardBorder, backgroundColor: mode === 'other' ? t.accentBg : t.cardBg }]}>
              <Text style={{ color: mode === 'other' ? t.accent : t.textPrimary, fontSize: 12, fontWeight: '700' }}>Different Hospital</Text>
            </TouchableOpacity>
          </View>

          {mode === 'other' && (
            <>
              <Text style={[st.label, { color: t.textMuted }]}>Receiving hospital</Text>
              {!selectedHospital && (
                <TextInput
                  value={search} onChangeText={setSearch}
                  placeholder="Search hospitals…"
                  placeholderTextColor={t.textMuted}
                  style={[st.input, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder, marginBottom: 8 }]}
                />
              )}
            </>
          )}

          {mode === 'other' && !selectedHospital && (
            loadingHospitals ? (
              <ActivityIndicator color={t.accent} style={{ marginVertical: 16 }} />
            ) : (
              <>
                {hospitals.map(h => (
                  <TouchableOpacity key={h.id}
                    onPress={() => pickOtherHospital(h)}
                    style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                    <Text style={[st.cardTitle, { color: t.textPrimary }]}>{h.name}</Text>
                    <Text style={[st.cardSub, { color: t.textMuted }]}>{[h.city, h.state].filter(Boolean).join(', ') || '—'}</Text>
                  </TouchableOpacity>
                ))}
                {hospitals.length === 0 && (
                  <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 8 }}>No hospitals found.</Text>
                )}
              </>
            )
          )}

          {selectedHospital && (
            <View style={[st.card, { backgroundColor: t.accentBg, borderColor: t.accentBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <View>
                <Text style={[st.cardTitle, { color: t.textPrimary }]}>{selectedHospital.name}</Text>
                {mode === 'other' && (
                  <Text style={[st.cardSub, { color: t.textMuted }]}>{[selectedHospital.city, selectedHospital.state].filter(Boolean).join(', ') || '—'}</Text>
                )}
              </View>
              {mode === 'other' && (
                <TouchableOpacity onPress={() => { setSelectedHospital(null); setSelectedDoctor(null); setClinics([]); setSelectedClinicId('') }}>
                  <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>Change</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>Urgency</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['routine', 'urgent', 'emergency'] as const).map(u => (
              <TouchableOpacity key={u} onPress={() => setUrgency(u)}
                style={[st.chip, { flex: 1, alignItems: 'center', borderColor: urgency === u ? t.accent : t.cardBorder, backgroundColor: urgency === u ? t.accentBg : t.cardBg }]}>
                <Text style={{ color: urgency === u ? t.accent : t.textPrimary, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {isEmergency && (
            <View style={[st.noticeBox, {
              marginTop: 12,
              backgroundColor: emergencyMaybeClosed ? t.dangerBg : t.dangerSubtle,
              borderColor: t.dangerStrong,
            }]}>
              {emergencyMaybeClosed ? (
                <Text style={{ fontSize: 12, color: t.danger, lineHeight: 18 }}>
                  <Text style={{ fontWeight: '800' }}>{selectedHospital?.name} may be closed right now.</Text> Emergency
                  referrals are still sent immediately — confirm they can receive the patient before sending.
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: t.danger, lineHeight: 18 }}>
                  Emergency referrals are sent for <Text style={{ fontWeight: '800' }}>right now</Text> — no date or
                  time to pick, and this patient will be prioritized at the receiving side.
                </Text>
              )}
            </View>
          )}

          {selectedHospital && visibleClinics.length > 0 && (
            <>
              <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>
                {isEmergency ? 'Emergency department' : 'Clinic / Department (optional)'}
              </Text>
              {isEmergency ? (
                <View style={[st.docRow, { borderColor: t.dangerStrong, backgroundColor: t.dangerSubtle }]}>
                  <Text style={{ color: t.danger, fontSize: 13, fontWeight: '700' }}>{emergencyClinic?.name}</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => { setSelectedClinicId(''); setSelectedDoctor(null) }}
                    style={[st.docRow, { borderColor: !selectedClinicId ? t.accent : t.cardBorder, backgroundColor: !selectedClinicId ? t.accentBg : t.cardBg }]}>
                    <Text style={{ color: !selectedClinicId ? t.accent : t.textPrimary, fontSize: 13, fontWeight: '700' }}>Any clinic</Text>
                  </TouchableOpacity>
                  {clinics.map(c => {
                    const active = selectedClinicId === c.id
                    return (
                      <TouchableOpacity key={c.id} onPress={() => { setSelectedClinicId(active ? '' : c.id); setSelectedDoctor(null) }}
                        style={[st.docRow, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? t.accentBg : t.cardBg }]}>
                        <Text style={{ color: active ? t.accent : t.textPrimary, fontSize: 13, fontWeight: '700' }}>{c.name}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </>
              )}
            </>
          )}

          {loadingClinics && <ActivityIndicator color={t.accent} style={{ marginVertical: 8 }} />}

          {noEmergencyClinic && (
            <View style={[st.noticeBox, { marginTop: 8, backgroundColor: t.dangerSubtle, borderColor: t.dangerStrong }]}>
              <Text style={{ fontSize: 12, color: t.danger, lineHeight: 18 }}>
                <Text style={{ fontWeight: '800' }}>{selectedHospital?.name} hasn't set up an Emergency Department.</Text> Choose
                a different hospital for an emergency referral.
              </Text>
            </View>
          )}

          {selectedHospital && filteredDoctors.length > 0 && (
            <>
              <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>Receiving doctor (optional)</Text>
              <TouchableOpacity
                onPress={() => setSelectedDoctor(null)}
                style={[st.docRow, { borderColor: !selectedDoctor ? t.accent : t.cardBorder, backgroundColor: !selectedDoctor ? t.accentBg : t.cardBg }]}>
                <Text style={{ color: !selectedDoctor ? t.accent : t.textPrimary, fontSize: 13, fontWeight: '700' }}>No preference</Text>
                <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 1 }}>Hospital assigns a doctor</Text>
              </TouchableOpacity>
              {filteredDoctors.map(d => {
                const active = selectedDoctor?.id === d.id
                return (
                  <TouchableOpacity key={d.id} onPress={() => setSelectedDoctor(active ? null : d)}
                    style={[st.docRow, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? t.accentBg : t.cardBg }]}>
                    <Text style={{ color: active ? t.accent : t.textPrimary, fontSize: 13, fontWeight: '700' }}>
                      {[d.title, d.full_name].filter(Boolean).join(' ')}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </>
          )}

          {!isEmergency && (
            <>
              <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>Date</Text>
              {openDates.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {openDates.map(d => (
                    <TouchableOpacity key={d.iso} onPress={() => setDate(d.iso)}
                      style={[st.chip, { borderColor: date === d.iso ? t.accent : t.cardBorder, backgroundColor: date === d.iso ? t.accentBg : t.cardBg }]}>
                      <Text style={{ color: date === d.iso ? t.accent : t.textPrimary, fontSize: 12, fontWeight: '700' }}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={{ color: t.textMuted, fontSize: 12 }}>No upcoming open day found.</Text>
              )}

              <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>Preferred time</Text>
              {timeOptions.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {timeOptions.map(time => (
                    <TouchableOpacity key={time} onPress={() => setStartTime(time)}
                      style={[st.chip, { borderColor: startTime === time ? t.accent : t.cardBorder, backgroundColor: startTime === time ? t.accentBg : t.cardBg }]}>
                      <Text style={{ color: startTime === time ? t.accent : t.textPrimary, fontSize: 12, fontWeight: '700' }}>{fmt12(time)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={{ color: t.textMuted, fontSize: 12 }}>Closed this day.</Text>
              )}
            </>
          )}

          <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>Reason for visit (optional)</Text>
          <TextInput
            value={reason} onChangeText={setReason}
            placeholder="e.g. Follow-up cardiology consult"
            placeholderTextColor={t.textMuted}
            style={[st.input, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
          />

          <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>Reason for referral *</Text>
          <TextInput
            value={referralReason} onChangeText={setReferralReason}
            placeholder="Why is this patient being referred? Visible to the receiving hospital."
            placeholderTextColor={t.textMuted}
            multiline numberOfLines={4}
            style={[st.textarea, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
          />

          {isInProgress && (
            <View style={[st.completeRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>Also complete this consultation</Text>
                <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                  Leave off to send more referrals from this same visit -- end it yourself from the Queue when you're done.
                </Text>
              </View>
              <Switch value={completeConsult} onValueChange={setCompleteConsult}
                trackColor={{ false: t.cardBorder, true: t.accent }} thumbColor="#fff" />
            </View>
          )}

          <Button
            label={isInProgress && completeConsult ? 'Refer & Complete' : 'Send Referral'}
            onPress={submit} loading={submitting} size="lg" style={{ marginTop: t.spacing.xl }}
          />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const st = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  modeBtn:     { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  label:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  textarea:    { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  card:        { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  cardTitle:   { fontSize: 14, fontWeight: '800' },
  cardSub:     { fontSize: 11, marginTop: 2 },
  docRow:      { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  chip:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  noticeBox:   { borderWidth: 1, borderRadius: 12, padding: 12 },
  completeRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 20 },
})
