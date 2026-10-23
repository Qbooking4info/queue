import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigation } from '@react-navigation/native'
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, RefreshControl, Modal, Vibration } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Card, SectionTitle, PrimaryButton, EmptyState } from '@queue/shared/components/ui/v3'
import { TopBar, TopBarButton } from '@queue/shared/components/ui/home'
import { haptics } from '@queue/shared/lib/haptics'
import { startConversation } from '@queue/shared/lib/chat'
import {
  getMyPendingOffers, getMyActiveJob, respondToOffer, updateJobStatus, completeJob, getDestinationOptions, setDestination,
  sendLocationPing, nextJobStatus, CREW_STATUS_LABEL,
  getMyUnits, setUnitDuty,
  type PendingOffer, type ActiveJob, type MyUnit, type CrewDisposition, type DestinationOption,
} from '@queue/shared/lib/crew-api'
import { TRANSPORT_STATUS_LABEL, type TransportStatus } from '@queue/shared/lib/ambulance-api'
import { startBackgroundLocation, stopBackgroundLocation, setBackgroundUnit } from '@queue/shared/lib/location-task'
import { JobPatientMap } from '@queue/shared/components/emergency/JobPatientMap'
import { alertNewOffers } from '@queue/shared/lib/offerAlerts'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'

// Foreground pings. These are now a supplement, not the only source: while on
// duty, lib/location-task.ts reports position via a TaskManager background task
// so the unit stays dispatchable with the app closed and the phone locked. This
// interval keeps the position tight while the crew is actually looking at the
// screen, and covers the case where background permission was declined.
const PING_INTERVAL_MS = 15_000
const POLL_INTERVAL_MS = 6_000

function countdown(expiresAt: string, now: number): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
}

function triageColor(level: number | null): string {
  if (level == null) return '#7A9089'
  if (level <= 2) return '#B91C1C'
  if (level === 3) return '#B45309'
  return '#7A9089'
}

export function CrewHomeScreen() {
  const navigation = useNavigation<any>()
  const { theme: t } = useTheme()
  const [activeJob, setActiveJob]     = useState<ActiveJob | null>(null)
  const [offers,    setOffers]        = useState<PendingOffer[]>([])
  const [loading,   setLoading]       = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  // Destination picker. advanceAfterPick: the crew tapped "Transporting" with no
  // hospital chosen, so the pick continues straight into that status change.
  const [destOpen, setDestOpen]         = useState(false)
  const [destOptions, setDestOptions]   = useState<DestinationOption[] | null>(null)
  const [advanceAfterPick, setAdvanceAfterPick] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [units, setUnits] = useState<MyUnit[]>([])
  const [dutyBusy, setDutyBusy] = useState<string | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)

  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // A crew member is normally attached to one rig. If they can operate several,
  // the on-duty one wins — that's the unit dispatch will actually offer jobs to.
  const onDutyUnit = units.find(u => u.on_duty) ?? null

  const load = useCallback(async () => {
    try {
      const [job, myUnits] = await Promise.all([getMyActiveJob(), getMyUnits().catch(() => [])])
      setActiveJob(job)
      setUnits(myUnits)
      const pending = job ? [] : await getMyPendingOffers()
      setOffers(pending)
      alertNewOffers(pending).catch(() => {})
    } catch (err) {
      console.warn('[crew] load failed', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  async function handleToggleDuty(unit: MyUnit) {
    setDutyBusy(unit.ambulance_id)
    try {
      const goingOnDuty = !unit.on_duty
      await setUnitDuty(unit.ambulance_id, goingOnDuty)

      // Position reporting follows duty, and must survive the screen being
      // closed: find_candidate_units drops any unit whose last fix is older than
      // 120s, so a locked phone used to remove the rig from dispatch entirely.
      if (goingOnDuty) {
        const started = await startBackgroundLocation(unit.ambulance_id)
        if (!started.ok) {
          // On duty but undispatchable is the dangerous state — say so rather
          // than let the toggle imply coverage that does not exist.
          setLocationDenied(true)
          Alert.alert(
            'Dispatch cannot see you',
            started.reason === 'background_denied'
              ? 'You are on duty, but location is not set to "Allow all the time". Dispatch can only send you jobs while this screen is open. Change it in Settings to stay available with your phone locked.'
              : started.reason === 'foreground_denied'
                ? 'You are on duty, but location permission is denied. Dispatch cannot see this unit at all.'
                : 'You are on duty, but background location could not start. Keep this screen open to stay dispatchable.',
          )
        } else {
          setLocationDenied(false)
        }
      } else {
        await stopBackgroundLocation()
      }

      await load()
    } catch (err) {
      Alert.alert('Could not change duty status', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setDutyBusy(null)
    }
  }

  useEffect(() => {
    load()
    const poll = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(poll)
  }, [load])

  // Tick every second so offer countdowns are live without re-polling the server.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  // Re-arm background reporting for a unit that is already on duty.
  //
  // startBackgroundLocation used to be reachable only from handleToggleDuty, so once
  // Android stopped the location service -- battery optimisation, a reboot, the process
  // being reclaimed -- nothing ever started it again. The shift was still open and the
  // duty card still said "On duty", but no position left the phone, and the rig fell out
  // of find_candidate_units 120s later. The crew had no way to know, and no way to fix it
  // short of toggling duty off and on. Re-arming on mount closes that hole: it is cheap
  // (startBackgroundLocation returns early when updates are already running) and it makes
  // opening the app enough to recover.
  const rearmedFor = useRef<string | null>(null)
  useEffect(() => {
    const unitId = onDutyUnit?.ambulance_id
    if (!unitId || rearmedFor.current === unitId) return
    rearmedFor.current = unitId
    ;(async () => {
      // Always re-point the task at this unit: the id lives in module scope plus
      // storage, and a cold-started process has neither until something sets it.
      setBackgroundUnit(unitId)
      const started = await startBackgroundLocation(unitId)
      setLocationDenied(!started.ok)
    })()
  }, [onDutyUnit?.ambulance_id])

  // Heartbeat.
  //
  // This used to be `if (!activeJob) return`, which was the supply-side half of
  // the dispatch deadlock: an idle unit never reported a position, and
  // find_candidate_units drops any unit whose last fix is older than
  // unit_location_ttl_seconds(). A unit could only be seen once it already had
  // a job. Now the ping follows *duty*, so an on-duty idle rig is visible to
  // dispatch — which is the entire point of being on duty.
  const pingUnitId = activeJob?.assigned_unit_id ?? onDutyUnit?.ambulance_id ?? null

  useEffect(() => {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null }
    if (!pingUnitId) return

    let stopped = false

    async function pingOnce() {
      if (stopped || !pingUnitId) return
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          // Without location the unit is on duty but undispatchable. Surfaced in
          // the duty card rather than failing silently.
          setLocationDenied(true)
          return
        }
        setLocationDenied(false)
        const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
        await sendLocationPing(pingUnitId, [{
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
          accuracyM: pos.coords.accuracy ?? undefined,
          recordedAt: new Date(pos.timestamp).toISOString(),
        }])
      } catch (err) {
        console.warn('[crew] location ping failed', err)
      }
    }

    pingOnce()
    pingTimer.current = setInterval(pingOnce, PING_INTERVAL_MS)
    return () => { stopped = true; if (pingTimer.current) clearInterval(pingTimer.current) }
  }, [pingUnitId])

  async function handleRespond(offerId: string, action: 'accept' | 'decline') {
    setRespondingId(offerId)
    try {
      const result = await respondToOffer(offerId, action)
      if (action === 'accept' && !result.accepted) {
        Alert.alert('Already covered', 'Another crew accepted this job first.')
      }
      await load()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not respond to offer.')
    } finally {
      setRespondingId(null)
    }
  }

  async function openDestinationPicker(thenAdvance = false) {
    if (!activeJob) return
    setAdvanceAfterPick(thenAdvance)
    setDestOptions(null)
    setDestOpen(true)
    try {
      setDestOptions(await getDestinationOptions(activeJob.request_id))
    } catch (err) {
      setDestOpen(false)
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not load hospitals.')
    }
  }

  async function pickDestination(hospitalId: string) {
    if (!activeJob) return
    setDestOpen(false)
    try {
      const ok = await setDestination(activeJob.request_id, hospitalId)
      if (!ok) Alert.alert('Could not set hospital', 'This job may no longer be assigned to your unit.')
      await load()
      if (ok && advanceAfterPick) await advanceStatus()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not set the destination.')
    }
  }

  async function handleAdvanceStatus() {
    if (!activeJob) return
    // The receiving hospital only sees the patient coming once a destination is set.
    if (nextJobStatus(activeJob.status) === 'transporting' && !activeJob.destination_hospital_id) {
      openDestinationPicker(true)
      return
    }
    await advanceStatus()
  }

  async function advanceStatus() {
    if (!activeJob) return
    const next = nextJobStatus(activeJob.status)
    if (!next) return
    setUpdatingStatus(true)
    try {
      const ok = await updateJobStatus(activeJob.request_id, next)
      if (!ok) Alert.alert('Could not update status', 'This job may no longer be assigned to your unit.')
      await load()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update job status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function finishJob(disposition: CrewDisposition) {
    if (!activeJob) return
    setUpdatingStatus(true)
    try {
      const ok = await completeJob(activeJob.request_id, disposition)
      if (!ok) Alert.alert('Could not complete job', 'This job may no longer be assigned to your unit.')
      await load()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not complete the job.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  function confirmHandover() {
    Alert.alert('Complete handover?', 'Confirm the patient has been handed over to the receiving facility.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => finishJob('transported') },
    ])
  }

  function endWithoutTransport() {
    Alert.alert('End job without transport', 'What happened on scene?', [
      { text: 'Treated on scene', onPress: () => finishJob('treated_not_transported') },
      { text: 'Patient refused', onPress: () => finishJob('patient_refused') },
      { text: 'No patient found', onPress: () => finishJob('no_patient_found') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  function callPatient() {
    if (!activeJob?.contact_phone) return
    Linking.openURL(`tel:${activeJob.contact_phone}`).catch(() => Alert.alert('Error', 'Could not start a call.'))
  }

  // Full-screen incoming offer (handoff c-offer): the first live offer takes over the
  // screen and the phone keeps vibrating until the crew accepts, declines or it expires.
  const incoming = offers.find(o => countdown(o.expires_at, now) > 0) ?? null
  const incomingId = incoming?.offer_id
  useEffect(() => {
    if (!incomingId) { Vibration.cancel(); return }
    Vibration.vibrate([0, 700, 500], true)
    return () => Vibration.cancel()
  }, [incomingId])

  const onDuty     = units.some(u => u.on_duty)
  const dispatchable = units.some(u => u.visible_to_dispatch)
  const headerSub  = activeJob ? 'On a job' : dispatchable ? 'On duty · visible to dispatch' : onDuty ? 'On duty · not dispatchable' : 'Off duty'

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <TopBar initials="  " eyebrow="Loading…" title="Duty" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.accent} /></View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Modal visible={destOpen} animationType="slide" transparent onRequestClose={() => setDestOpen(false)}>
        <View style={s.sheetBackdrop}>
          <View style={[s.sheet, { backgroundColor: t.canvasBg }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: t.textPrimary }}>Take patient to</Text>
              <TouchableOpacity onPress={() => setDestOpen(false)} accessibilityLabel="Close" hitSlop={12}>
                <Ionicons name="close" size={24} color={t.textMuted} />
              </TouchableOpacity>
            </View>
            {destOptions == null ? (
              <ActivityIndicator color={t.accent} style={{ marginVertical: 32 }} />
            ) : destOptions.length === 0 ? (
              <Text style={{ color: t.textSecondary, marginVertical: 24, textAlign: 'center' }}>No hospitals available.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 460 }}>
                {destOptions.map(h => (
                  <TouchableOpacity key={h.hospital_id} onPress={() => pickDestination(h.hospital_id)}
                    style={[s.destOption, { borderColor: h.is_current ? t.accentBorder : t.cardBorder, backgroundColor: h.is_current ? t.accentBg : t.cardBg }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{h.name}</Text>
                      <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }} numberOfLines={1}>
                        {[h.distance_m != null ? `${(h.distance_m / 1000).toFixed(1)} km` : null,
                          h.is_24_hours ? '24 hours' : null,
                          h.bed_space_status ? `Beds: ${h.bed_space_status}` : null,
                          h.address].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {h.is_current && <Ionicons name="checkmark-circle" size={20} color={t.accent} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!incoming && !activeJob} animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
        {incoming && (() => {
          const secs = countdown(incoming.expires_at, now)
          const busy = respondingId === incoming.offer_id
          const severe = incoming.triage_level != null && incoming.triage_level <= 2
          return (
            <View style={{ flex: 1, backgroundColor: severe ? '#7F1D1D' : '#134E4A', padding: 24, paddingTop: 64, justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center', gap: 14 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 }}>{severe ? 'EMERGENCY JOB' : 'INCOMING JOB'}</Text>
                <View style={{ width: 168, height: 168, borderRadius: 99, borderWidth: 10, borderColor: secs <= 10 ? '#FCA5A5' : 'rgba(255,255,255,0.85)',
                  alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${secs} seconds to accept`}>
                  <Text style={{ color: '#FFFFFF', fontSize: 56, fontWeight: '800' }}>{secs}</Text>
                  <Text style={{ color: '#CCFBF1', fontSize: 13 }}>seconds</Text>
                </View>
                <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{incoming.symptom_description ?? 'Patient needs an ambulance'}</Text>
                {!!incoming.pickup_address && <Text style={{ color: '#CCFBF1', fontSize: 15, textAlign: 'center' }}>{incoming.pickup_address}</Text>}
                <Text style={{ color: '#CCFBF1', fontSize: 15 }}>
                  {incoming.triage_level ? `Triage ${incoming.triage_level} · ` : ''}ETA ~{Math.round((incoming.eta_seconds ?? 0) / 60)} min
                </Text>
              </View>
              <View style={{ gap: 12 }}>
                <TouchableOpacity disabled={busy} onPress={() => { Vibration.cancel(); haptics.success(); handleRespond(incoming.offer_id, 'accept') }}
                  accessibilityRole="button" accessibilityLabel="Accept job"
                  style={{ minHeight: 72, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  {busy ? <ActivityIndicator color="#134E4A" /> : <Text style={{ fontSize: 20, fontWeight: '800', color: severe ? '#7F1D1D' : '#134E4A' }}>Accept</Text>}
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => { Vibration.cancel(); handleRespond(incoming.offer_id, 'decline') }}
                  accessibilityRole="button" accessibilityLabel="Decline job"
                  style={{ minHeight: 64, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })()}
      </Modal>
      <TopBar
        avatar={<ProfileAvatar size={40} onPress={() => navigation.navigate('CrewProfile')} />}
        eyebrow={headerSub}
        title={activeJob ? 'Active job' : 'Duty'}
        onAvatarPress={() => navigation.navigate('CrewProfile')}
        right={<TopBarButton icon="person-circle-outline" label="Your profile"
          onPress={() => navigation.navigate('CrewProfile')} />}
      />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
      >
        {/* Duty. Above everything else because an off-duty unit receives no
            offers at all — if this is off, the empty offer list below is not a
            quiet night, it's the crew being invisible. */}
        {units.map(unit => {
          // A unit on a job is deliberately hidden from dispatch; that isn't stale GPS.
          const onJob = !!activeJob && activeJob.assigned_unit_id === unit.ambulance_id
          const stale = unit.on_duty && !unit.visible_to_dispatch && !onJob
          const busy  = dutyBusy === unit.ambulance_id
          const chip  = unit.visible_to_dispatch || onJob ? t.statusSuccess : stale ? t.statusBusy : t.statusNeutral
          return (
            <Card key={unit.ambulance_id} style={{ gap: 12, borderColor: unit.on_duty ? (stale ? t.statusBusy.border : t.accentBorder) : t.cardBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="car-outline" size={22} color={t.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: t.textPrimary }}>{unit.call_sign ?? unit.plate_number}</Text>
                  <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{unit.vehicle_tier} · {unit.provider_name}</Text>
                </View>
              </View>

              {/* On duty and dispatchable are different things, and the crew has
                  to be told which one they actually are. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7,
                borderRadius: 99, backgroundColor: chip.bg, borderWidth: 1, borderColor: chip.border }}>
                <Ionicons name={onJob ? 'medkit-outline' : unit.visible_to_dispatch ? 'radio-outline' : stale ? 'warning-outline' : 'moon-outline'} size={14} color={chip.text} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: chip.text }}>
                  {onJob ? 'On a job' : unit.visible_to_dispatch ? 'Visible to dispatch' : stale ? (locationDenied ? 'Location off' : 'GPS stale') : 'Off duty'}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 19 }}>
                {onJob
                  ? 'No new offers until this job is completed.'
                  : unit.visible_to_dispatch
                  ? 'You can receive jobs.'
                  : stale
                    ? locationDenied
                      ? 'You are on duty, but location is off. Dispatch cannot see you.'
                      : 'You are on duty, but your position is stale. Keep this screen open to stay dispatchable.'
                    : 'You will not receive any jobs.'}
              </Text>

              <PrimaryButton height={64} variant={unit.on_duty ? 'ghost' : 'primary'} loading={busy}
                icon={unit.on_duty ? 'moon-outline' : 'power-outline'}
                label={unit.on_duty ? 'Go off duty' : 'Go on duty'} onPress={() => handleToggleDuty(unit)} />
            </Card>
          )
        })}

        <SectionTitle title={activeJob ? 'Current job' : 'Incoming offers'} />

        {activeJob ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={[s.triageBadge, { backgroundColor: `${triageColor(activeJob.triage_level)}18`, borderColor: `${triageColor(activeJob.triage_level)}40` }]}>
                <Text style={[s.triageBadgeText, { color: triageColor(activeJob.triage_level) }]}>
                  {activeJob.triage_level ? `Triage ${activeJob.triage_level}` : 'Scheduled'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: t.textMuted }}>{activeJob.booking_ref}</Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: t.accent }}>
              {TRANSPORT_STATUS_LABEL[activeJob.status as TransportStatus] ?? activeJob.status}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>{activeJob.symptom_description ?? 'No condition details provided'}</Text>

            {activeJob.pickup_address && (
              <View style={s.detailRow}>
                <Ionicons name="location-outline" size={16} color={t.accent} />
                <Text style={[s.detailText, { color: t.textSecondary }]}>{activeJob.pickup_address}</Text>
              </View>
            )}
            {/* Destination: tappable until arrival, so the crew can change their mind en route. */}
            <TouchableOpacity
              disabled={activeJob.status === 'arrived_at_destination'}
              onPress={() => openDestinationPicker(false)}
              accessibilityRole="button"
              accessibilityLabel={activeJob.destination_hospital_name ? `Destination ${activeJob.destination_hospital_name}. Change` : 'Choose destination hospital'}
              style={[s.destRow, { borderColor: activeJob.destination_hospital_id ? t.cardBorder : t.statusBusy.border,
                backgroundColor: activeJob.destination_hospital_id ? t.cardBg : t.statusBusy.bg }]}>
              <Ionicons name="business-outline" size={18} color={activeJob.destination_hospital_id ? t.accent : t.statusBusy.text} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: t.textMuted, letterSpacing: 0.4 }}>DESTINATION</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: activeJob.destination_hospital_id ? t.textPrimary : t.statusBusy.text }}>
                  {activeJob.destination_hospital_name ?? 'Choose hospital'}
                </Text>
              </View>
              {activeJob.status !== 'arrived_at_destination' && (
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.accent }}>{activeJob.destination_hospital_id ? 'Change' : 'Choose'}</Text>
              )}
            </TouchableOpacity>

            {/* Where the patient actually is, and how long until we're there.
                Both come from the server, so the crew and the patient are
                reading the same number rather than two guesses. */}
            <JobPatientMap
              requestId={activeJob.request_id}
              pickup={activeJob.pickup_lat != null && activeJob.pickup_lng != null
                ? { lat: activeJob.pickup_lat, lng: activeJob.pickup_lng }
                : null}
              etaSeconds={['matched', 'en_route_to_patient'].includes(activeJob.status) ? activeJob.eta_seconds : null}
              onExpand={() => navigation.navigate('Track')}
            />

            <PrimaryButton height={64} variant="ghost" icon="call-outline" label="Call patient" onPress={callPatient} />
            {!!activeJob.destination_hospital_phone && ['on_scene', 'transporting'].includes(activeJob.status) && (
              <PrimaryButton height={64} variant="ghost" icon="business-outline" label="Call hospital ahead"
                onPress={() => Linking.openURL(`tel:${activeJob.destination_hospital_phone}`).catch(() => Alert.alert('Error', 'Could not start a call.'))} />
            )}
            {!!activeJob.destination_hospital_id && (
              <PrimaryButton height={64} variant="ghost" icon="chatbubble-ellipses-outline" label="Message hospital"
                onPress={async () => {
                  const r = await startConversation('hospital', activeJob.destination_hospital_id!)
                  if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
                  else Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error)
                }} />
            )}

            {nextJobStatus(activeJob.status) ? (
              <PrimaryButton height={64} label={`Mark: ${CREW_STATUS_LABEL[nextJobStatus(activeJob.status)!]}`}
                onPress={handleAdvanceStatus} loading={updatingStatus} />
            ) : activeJob.status === 'arrived_at_destination' ? (
              <PrimaryButton height={64} icon="checkmark-done-outline" label="Complete handover"
                onPress={confirmHandover} loading={updatingStatus} />
            ) : null}
            {activeJob.status === 'on_scene' && (
              <PrimaryButton variant="ghost" label="End without transport"
                onPress={endWithoutTransport} disabled={updatingStatus} />
            )}
          </Card>
        ) : offers.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="No offers right now"
            body={dispatchable ? 'New jobs ring here. Keep the app open or in the background.' : 'Go on duty to start receiving jobs.'} />
        ) : (
          offers.map(o => {
            const secs = countdown(o.expires_at, now)
            const busy = respondingId === o.offer_id
            return (
              <Card key={o.offer_id} style={{ gap: 10, borderColor: t.dangerBorder }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={[s.triageBadge, { backgroundColor: `${triageColor(o.triage_level)}18`, borderColor: `${triageColor(o.triage_level)}40` }]}>
                    <Text style={[s.triageBadgeText, { color: triageColor(o.triage_level) }]}>
                      {o.triage_level ? `Triage ${o.triage_level}` : '—'}
                    </Text>
                  </View>
                  <View style={{ width: 52, height: 52, borderRadius: 99, borderWidth: 3, borderColor: secs <= 10 ? t.danger : t.accent, alignItems: 'center', justifyContent: 'center' }}
                    accessibilityLabel={`${secs} seconds left`}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: secs <= 10 ? t.danger : t.textPrimary }}>{secs}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>{o.symptom_description ?? 'No condition details provided'}</Text>
                {o.pickup_address && (
                  <View style={s.detailRow}>
                    <Ionicons name="location-outline" size={16} color={t.accent} />
                    <Text style={[s.detailText, { color: t.textSecondary }]}>{o.pickup_address}</Text>
                  </View>
                )}
                <View style={s.detailRow}>
                  <Ionicons name="time-outline" size={16} color={t.accent} />
                  <Text style={[s.detailText, { color: t.textSecondary }]}>ETA ~{Math.round((o.eta_seconds ?? 0) / 60)} min</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton height={64} variant="ghost" label="Decline" disabled={busy} onPress={() => handleRespond(o.offer_id, 'decline')} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton height={64} variant="danger" label="Accept" loading={busy} onPress={() => { haptics.success(); handleRespond(o.offer_id, 'accept') }} />
                  </View>
                </View>
              </Card>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  destRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  destOption:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  triageBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  triageBadgeText: { fontSize: 12, fontWeight: '800' },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 14, flex: 1 },
})
