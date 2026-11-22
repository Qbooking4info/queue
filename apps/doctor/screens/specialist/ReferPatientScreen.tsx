import { useState, useEffect, useCallback } from 'react'
import { View, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import {
  getHospitals, getHospitalById, getClinicsForHospital, createReferral,
  getHospitalHours, getClinicHours, isOpenNow, findEmergencyClinic,
  type HospitalWithDoctors, type Clinic, type DayHours,
} from '@queue/shared/lib/api'
import type { Doctor } from '@queue/shared/types/database'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Seg, Chip,
  Btn, BottomBar, Notice, SearchField, Mono, Empty,
} from '@queue/shared/components/q'

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
        : `${base} This consultation is still open — refer another patient or end it from the Queue when you're done.`,
      [{ text: 'Done', onPress: () => navigation.goBack() }],
    )
  }

  const whenLabel = isEmergency
    ? 'Now'
    : `${openDates.find(d => d.iso === date)?.label ?? date} · ${startTime}`

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Refer patient" sub={patientName} onBack={() => navigation.goBack()} />

        <Seg<'same' | 'other'>
          value={mode} onChange={switchMode}
          options={[{ key: 'same', label: 'Same hospital' }, { key: 'other', label: 'Other hospital' }]} />

        <Body keyboardShouldPersistTaps="handled">
          {mode === 'other' && !selectedHospital && (
            <>
              <SearchField value={search} onChangeText={setSearch} placeholder="Search hospitals" />
              {loadingHospitals ? (
                <ActivityIndicator color={t.q.primary} style={{ marginVertical: 20 }} />
              ) : hospitals.length === 0 ? (
                <Card>
                  <Empty icon="business-outline" title="No hospitals found"
                    body="Try a different name, or refer within your own hospital." />
                </Card>
              ) : (
                <Card>
                  {hospitals.map((h, i) => (
                    <View key={h.id}>
                      {i > 0 && <Hair />}
                      <Row
                        icon="business-outline"
                        title={h.name}
                        sub={[h.city, h.state].filter(Boolean).join(', ') || null}
                        chevron
                        onPress={() => pickOtherHospital(h)} />
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}

          {!!selectedHospital && (
            <Card style={{ marginTop: 12 }}>
              <Row
                icon="business-outline" iconTone="teal" tint
                title={selectedHospital.name}
                sub={mode === 'other'
                  ? ([selectedHospital.city, selectedHospital.state].filter(Boolean).join(', ') || null)
                  : 'Your own hospital'}
                right={mode === 'other'
                  ? <Btn label="Change" variant="secondary" small
                      onPress={() => { setSelectedHospital(null); setSelectedDoctor(null); setClinics([]); setSelectedClinicId('') }} />
                  : undefined} />
            </Card>
          )}

          <SectionHead title="Urgency" />
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
            {(['routine', 'urgent', 'emergency'] as const).map(u => (
              <Chip key={u} label={u === 'emergency' ? 'Emergency' : u === 'urgent' ? 'Urgent' : 'Routine'}
                on={urgency === u} onPress={() => { haptics.tap(); setUrgency(u) }} />
            ))}
          </View>

          {isEmergency && (
            <Notice tone="red" icon="alert-circle">
              {emergencyMaybeClosed
                ? `${selectedHospital?.name} may be closed right now. Emergency referrals are still sent immediately — confirm they can receive the patient before sending.`
                : 'Emergency referrals are sent for right now — no date or time to pick, and the patient is prioritised at the receiving side.'}
            </Notice>
          )}

          {noEmergencyClinic && (
            <Notice tone="red" icon="alert-circle">
              {selectedHospital?.name} has not set up an Emergency Department. Choose a different hospital for an
              emergency referral.
            </Notice>
          )}

          {!!selectedHospital && visibleClinics.length > 0 && (
            <>
              <SectionHead title={isEmergency ? 'Emergency department' : 'Clinic or department'} />
              {isEmergency ? (
                <Card>
                  <Row icon="medical" iconTone="red" tint title={emergencyClinic?.name ?? 'Emergency'}
                    sub="Emergency referrals always go here" />
                </Card>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                  <Chip label="Any clinic" on={!selectedClinicId}
                    onPress={() => { haptics.tap(); setSelectedClinicId(''); setSelectedDoctor(null) }} />
                  {clinics.map(c => (
                    <Chip key={c.id} label={c.name} on={selectedClinicId === c.id}
                      onPress={() => { haptics.tap(); setSelectedClinicId(selectedClinicId === c.id ? '' : c.id); setSelectedDoctor(null) }} />
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {loadingClinics && <ActivityIndicator color={t.q.primary} style={{ marginVertical: 10 }} />}

          {!!selectedHospital && filteredDoctors.length > 0 && (
            <>
              <SectionHead title="Receiving doctor" />
              <Card>
                <Row title="No preference" sub="The hospital assigns a doctor"
                  tint={!selectedDoctor}
                  onPress={() => { haptics.tap(); setSelectedDoctor(null) }} />
                {filteredDoctors.map(d => (
                  <View key={d.id}>
                    <Hair />
                    <Row
                      title={[d.title, d.full_name].filter(Boolean).join(' ')}
                      sub={(d as any).specialty_name ?? null}
                      tint={selectedDoctor?.id === d.id}
                      onPress={() => { haptics.tap(); setSelectedDoctor(selectedDoctor?.id === d.id ? null : d) }} />
                  </View>
                ))}
              </Card>
            </>
          )}

          {!isEmergency && (
            <>
              <SectionHead title="Date" />
              {openDates.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                  {openDates.map(d => (
                    <Chip key={d.iso} label={d.label} on={date === d.iso}
                      onPress={() => { haptics.tap(); setDate(d.iso) }} />
                  ))}
                </ScrollView>
              ) : (
                <Notice tone="amber">No upcoming open day found for this hospital.</Notice>
              )}

              <SectionHead title="Preferred time" />
              {timeOptions.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                  {timeOptions.map(time => (
                    <Chip key={time} label={time} on={startTime === time}
                      onPress={() => { haptics.tap(); setStartTime(time) }} />
                  ))}
                </ScrollView>
              ) : (
                <Notice tone="amber">Closed on this day.</Notice>
              )}
            </>
          )}

          <SectionHead title="Why are you referring?" />
          <Card>
            <View style={{ padding: 14, gap: 14 }}>
              <View style={{ gap: 6 }}>
                <CardLabel>Reason for referral</CardLabel>
                <TextInput
                  value={referralReason} onChangeText={setReferralReason}
                  placeholder="What the receiving doctor needs to know"
                  placeholderTextColor={t.q.ink60}
                  accessibilityLabel="Reason for referral"
                  multiline textAlignVertical="top"
                  style={{
                    minHeight: 110, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                    backgroundColor: t.q.field, padding: 12, fontSize: 14, lineHeight: 20, color: t.q.ink,
                  }} />
                <Text style={{ fontSize: 12, color: t.q.ink60 }}>Visible to the receiving hospital.</Text>
              </View>
              <View style={{ gap: 6 }}>
                <CardLabel>Reason for visit (optional)</CardLabel>
                <TextInput
                  value={reason} onChangeText={setReason}
                  placeholder="e.g. Follow-up cardiology consult"
                  placeholderTextColor={t.q.ink60}
                  accessibilityLabel="Reason for visit"
                  style={{
                    minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                    backgroundColor: t.q.field, paddingHorizontal: 14, fontSize: 15, color: t.q.ink,
                  }} />
              </View>
            </View>
          </Card>

          {isInProgress && (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.q.ink }}>Also complete this consultation</Text>
                  <Text style={{ fontSize: 12.5, lineHeight: 17, color: t.q.ink60 }}>
                    Leave it off to send more referrals from this same visit — end it yourself from the queue when
                    you are done.
                  </Text>
                </View>
                <Switch value={completeConsult} onValueChange={v => { haptics.tap(); setCompleteConsult(v) }}
                  accessibilityLabel="Also complete this consultation"
                  trackColor={{ false: t.q.line, true: t.q.primary }} thumbColor="#FFFFFF" />
              </View>
            </Card>
          )}
        </Body>

        <BottomBar meta={<Mono size={12} weight="600" color={isEmergency ? t.q.red : t.q.ink70}>{whenLabel}</Mono>}>
          <Btn grow
            label={isInProgress && completeConsult ? 'Refer & end consultation' : 'Send referral'}
            loading={submitting}
            disabled={!selectedHospital || !referralReason.trim()}
            onPress={submit} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
