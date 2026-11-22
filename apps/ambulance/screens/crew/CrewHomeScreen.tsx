import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigation } from '@react-navigation/native'
import {
  View, ScrollView, ActivityIndicator, Linking, RefreshControl, Modal, Vibration, Switch, Pressable,
} from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { startConversation } from '@queue/shared/lib/chat'
import {
  getMyPendingOffers, getMyActiveJob, respondToOffer, updateJobStatus, completeJob, getDestinationOptions, setDestination,
  sendLocationPing, nextJobStatus, CREW_STATUS_LABEL, offerWindowSeconds,
  getMyUnits, setUnitDuty, getMyCrewStats, getMyCrewRuns,
  type PendingOffer, type ActiveJob, type MyUnit, type CrewDisposition, type DestinationOption,
  type CrewStats, type CrewRun,
} from '@queue/shared/lib/crew-api'
import { TRANSPORT_STATUS_LABEL, type TransportStatus } from '@queue/shared/lib/ambulance-api'
import { startBackgroundLocation, stopBackgroundLocation, setBackgroundUnit } from '@queue/shared/lib/location-task'
import { JobPatientMap } from '@queue/shared/components/emergency/JobPatientMap'
import { alertNewOffers } from '@queue/shared/lib/offerAlerts'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Stat, StatStrip,
  Journey, Btn, BottomBar, IconBtn, Empty, Mono, Notice, type PillTone,
} from '@queue/shared/components/q'

// Foreground pings. These are now a supplement, not the only source: while on
// duty, lib/location-task.ts reports position via a TaskManager background task
// so the unit stays dispatchable with the app closed and the phone locked. This
// interval keeps the position tight while the crew is actually looking at the
// screen, and covers the case where background permission was declined.
const PING_INTERVAL_MS = 15_000
const POLL_INTERVAL_MS = 6_000

/** The run, as the handoff draws it. Maps onto transport_requests.status. */
const RUN_STEPS = ['Accepted', 'En route', 'On scene', 'Transport', 'Arrived']
const STEP_OF: Record<string, number> = {
  matched: 0,
  en_route_to_patient: 1,
  on_scene: 2,
  transporting: 3,
  arrived_at_destination: 4,
}

function countdown(expiresAt: string, now: number): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
}

function triageTone(level: number | null): PillTone {
  if (level == null) return 'neutral'
  if (level <= 2) return 'red'
  if (level === 3) return 'amber'
  return 'neutral'
}

function triageLabel(level: number | null): string {
  if (level == null) return 'Not triaged'
  return `P${level}`
}

function hhmm(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
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
  const [stats, setStats] = useState<CrewStats | null>(null)
  const [runs, setRuns] = useState<CrewRun[]>([])
  const [dutyBusy, setDutyBusy] = useState<string | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)
  // A run that vanished from under the crew. RLS lets a crew read their job only
  // while it is active, so a dispatch cancellation does not arrive as a status --
  // the row simply stops being readable. Without this the screen just snapped
  // back to "no offers" and the crew was left wondering what happened.
  const [endedRef, setEndedRef] = useState<string | null>(null)
  const lastJobRef = useRef<{ id: string; ref: string } | null>(null)

  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // A crew member is normally attached to one rig. If they can operate several,
  // the on-duty one wins — that's the unit dispatch will actually offer jobs to.
  const onDutyUnit = units.find(u => u.on_duty) ?? null

  const load = useCallback(async () => {
    try {
      const [job, myUnits] = await Promise.all([getMyActiveJob(), getMyUnits().catch(() => [])])
      if (job) {
        lastJobRef.current = { id: job.request_id, ref: job.booking_ref }
        setEndedRef(null)
      } else if (lastJobRef.current) {
        setEndedRef(lastJobRef.current.ref)
        lastJobRef.current = null
      }
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

  // The idle screen's figures and the day's finished runs. Reloaded whenever
  // the active job clears, which is exactly when a run has just ended.
  const activeId = activeJob?.request_id ?? null
  useEffect(() => {
    getMyCrewStats().then(setStats).catch(() => {})
    getMyCrewRuns(20).then(setRuns).catch(() => {})
  }, [activeId])

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
        // offer_no_longer_open covers expiry and the patient cancelling, not just a
        // faster crew -- say what the server actually knows.
        if (result.reason === 'already_covered') Alert.alert('Already covered', 'Another crew accepted this job first.')
        else Alert.alert('Offer closed', 'This offer is no longer open — it expired or the request was cancelled.')
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
      lastJobRef.current = null
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
    Alert.alert('End the run without transport', 'What happened on scene?', [
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

  async function messageHospital() {
    if (!activeJob?.destination_hospital_id) return
    const r = await startConversation('hospital', activeJob.destination_hospital_id)
    if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
    else Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error)
  }

  // Full-screen incoming offer: the first live offer takes over the screen and
  // the phone keeps vibrating until the crew accepts, declines or it expires.
  const incoming = offers.find(o => countdown(o.expires_at, now) > 0) ?? null
  const incomingId = incoming?.offer_id
  useEffect(() => {
    if (!incomingId) { Vibration.cancel(); return }
    Vibration.vibrate([0, 700, 500], true)
    return () => Vibration.cancel()
  }, [incomingId])

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const todayRuns = runs.filter(r => r.ended_at != null && Date.parse(r.ended_at) >= startOfToday.getTime())
  const unit = onDutyUnit ?? units[0] ?? null
  const onJobUnit = activeJob ? units.find(u => u.ambulance_id === activeJob.assigned_unit_id) ?? unit : unit
  const sincePing = onJobUnit?.seconds_since_ping ?? null
  const stalePosition = sincePing != null && sincePing > 120
  const dispatchable = units.some(u => u.visible_to_dispatch)
  const etaMins = activeJob?.eta_seconds != null ? Math.round(activeJob.eta_seconds / 60) : null
  const etaAt = hhmm(activeJob?.eta_updated_at)

  if (loading) {
    return (
      <Screen>
        <AppBar large title="Run" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  const next = activeJob ? nextJobStatus(activeJob.status) : null

  return (
    <Screen>
      {/* ── Take patient to ── */}
      <Modal visible={destOpen} animationType="slide" transparent onRequestClose={() => setDestOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: t.q.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: t.q.ink }}>
                  Take patient to
                </Text>
                <Text style={{ fontSize: 12.5, color: t.q.ink60, marginTop: 2 }}>
                  Hospitals that can receive now, nearest first.
                </Text>
              </View>
              <IconBtn name="close" label="Close" onPress={() => setDestOpen(false)} />
            </View>
            {destOptions == null ? (
              <ActivityIndicator color={t.q.primary} style={{ marginVertical: 32 }} />
            ) : destOptions.length === 0 ? (
              <Card><Empty icon="business-outline" title="No hospitals available"
                body="None of the hospitals near this pickup can receive a patient right now." /></Card>
            ) : (
              <ScrollView style={{ maxHeight: 460 }}>
                <Card>
                  {destOptions.map((h, i) => (
                    <View key={h.hospital_id}>
                      {i > 0 && <Hair />}
                      <Row
                        icon="business-outline"
                        iconTone={h.is_current ? 'teal' : 'neutral'}
                        tint={h.is_current}
                        title={h.name}
                        sub={[
                          h.is_24_hours ? '24 hours' : null,
                          h.bed_space_status ? `beds: ${h.bed_space_status}` : null,
                          h.address,
                        ].filter(Boolean).join(' · ') || null}
                        right={h.distance_m != null
                          ? <Mono size={13} weight="700">{(h.distance_m / 1000).toFixed(1)} km</Mono>
                          : undefined}
                        onPress={() => pickDestination(h.hospital_id)} />
                    </View>
                  ))}
                </Card>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Incoming offer ── */}
      <Modal visible={!!incoming && !activeJob} animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
        {incoming && (() => {
          const secs = countdown(incoming.expires_at, now)
          const window_ = offerWindowSeconds(incoming.triage_level)
          const busy = respondingId === incoming.offer_id
          const severe = incoming.triage_level != null && incoming.triage_level <= 2
          const ring = secs <= 10 ? '#FCA5A5' : '#FFFFFF'
          return (
            <View style={{ flex: 1, backgroundColor: severe ? '#7F1D1D' : '#134E4A', padding: 24, paddingTop: 64, justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center', gap: 16 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', letterSpacing: 1.6 }}>
                  {severe ? 'NEW JOB · EMERGENCY' : 'NEW JOB'}
                </Text>
                <Mono size={13} color="rgba(255,255,255,0.75)">{incoming.request_id.slice(0, 8).toUpperCase()}</Mono>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5 }}>Respond in</Text>
                <View
                  accessibilityLabel={`${secs} seconds to accept`}
                  style={{
                    width: 168, height: 168, borderRadius: 84, borderWidth: 10, borderColor: ring,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    {`0:${String(secs).padStart(2, '0')}`}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>of {window_}s</Text>
                </View>
                <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '700', textAlign: 'center' }}>
                  {incoming.symptom_description ?? 'Patient needs an ambulance'}
                </Text>
                {!!incoming.pickup_address && (
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6 }}>PICK UP AT</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 15, textAlign: 'center' }}>{incoming.pickup_address}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 24 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11.5 }}>ETA</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>
                      {incoming.eta_seconds != null ? `${Math.round(incoming.eta_seconds / 60)} min` : '—'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11.5 }}>Priority</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>{triageLabel(incoming.triage_level)}</Text>
                  </View>
                </View>
              </View>
              <View style={{ gap: 12 }}>
                <Pressable disabled={busy}
                  onPress={() => { Vibration.cancel(); haptics.success(); handleRespond(incoming.offer_id, 'accept') }}
                  accessibilityRole="button" accessibilityLabel="Accept job"
                  style={({ pressed }) => [
                    { minHeight: 72, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}>
                  {busy ? <ActivityIndicator color="#134E4A" />
                    : <Text style={{ fontSize: 20, fontWeight: '800', color: severe ? '#7F1D1D' : '#134E4A' }}>Accept</Text>}
                </Pressable>
                <Pressable disabled={busy}
                  onPress={() => { Vibration.cancel(); handleRespond(incoming.offer_id, 'decline') }}
                  accessibilityRole="button" accessibilityLabel="Decline job"
                  style={({ pressed }) => [
                    { minHeight: 64, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }}>Decline</Text>
                </Pressable>
              </View>
            </View>
          )
        })()}
      </Modal>

      <AppBar
        title={unit?.call_sign ?? unit?.plate_number ?? 'No unit'}
        sub={activeJob
          ? activeJob.booking_ref
          : dispatchable ? 'Visible to dispatch' : onDutyUnit ? 'On duty · not dispatchable' : 'Off duty'}
        right={activeJob
          ? <IconBtn name="navigate-outline" label="Directions" onPress={() => navigation.navigate('Track')} />
          : undefined} />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
          onRefresh={() => { setRefreshing(true); load() }} />
      }>
        {activeJob ? (
          <>
            <Journey label="This run" steps={RUN_STEPS} activeIndex={STEP_OF[activeJob.status] ?? 0} />

            {/* The ETA is only as good as the last position report. Saying when
                it was true beats showing a confident number that is minutes old. */}
            {stalePosition && (
              <Notice tone="amber" icon="warning-outline">
                Position last confirmed {sincePing} s ago{etaAt ? `. The ETA below was true at ${etaAt}.` : '.'}
                {locationDenied ? ' Location is off on this phone.' : ''}
              </Notice>
            )}

            <Card style={{ marginTop: 12 }}>
              <Row
                icon={activeJob.triage_level != null && activeJob.triage_level <= 2 ? 'alert-circle' : 'person-outline'}
                iconTone={triageTone(activeJob.triage_level)}
                title={activeJob.symptom_description ?? 'No condition details given'}
                sub={TRANSPORT_STATUS_LABEL[activeJob.status as TransportStatus] ?? activeJob.status}
                pill={triageLabel(activeJob.triage_level)}
                pillTone={triageTone(activeJob.triage_level)}
                pillSolid={activeJob.triage_level != null && activeJob.triage_level <= 2} />
              {!!activeJob.pickup_address && (
                <>
                  <Hair />
                  <Row compact icon="location-outline" title={activeJob.pickup_address} sub="Pick up at" />
                </>
              )}
              <Hair />
              {/* Tappable until arrival, so the crew can change their mind en route. */}
              <Row
                icon="business-outline"
                iconTone={activeJob.destination_hospital_id ? 'teal' : 'amber'}
                title={activeJob.destination_hospital_name ?? 'Choose a hospital'}
                sub={activeJob.destination_hospital_id ? 'Taking the patient to' : 'The hospital cannot prepare until you pick one'}
                titleColor={activeJob.destination_hospital_id ? undefined : t.q.amber}
                chevron={activeJob.status !== 'arrived_at_destination'}
                onPress={activeJob.status === 'arrived_at_destination' ? undefined : () => openDestinationPicker(false)} />
            </Card>

            <Card>
              <StatStrip>
                <Stat label="ETA" value={etaMins != null ? etaMins : '—'} unit={etaMins != null ? 'min' : undefined}
                  tone={stalePosition ? 'amber' : undefined}
                  note={etaAt ? `as of ${etaAt}` : 'not computed yet'} />
                <Stat label="Last fix" value={sincePing != null ? sincePing : '—'} unit={sincePing != null ? 's' : undefined}
                  tone={stalePosition ? 'amber' : undefined}
                  note={stalePosition ? 'dispatch may lose you' : 'position is fresh'} last />
              </StatStrip>
            </Card>

            {/* Where the patient actually is, and how long until we're there.
                Both come from the server, so the crew and the patient are
                reading the same number rather than two guesses. */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <JobPatientMap
                requestId={activeJob.request_id}
                pickup={activeJob.pickup_lat != null && activeJob.pickup_lng != null
                  ? { lat: activeJob.pickup_lat, lng: activeJob.pickup_lng }
                  : null}
                etaSeconds={['matched', 'en_route_to_patient'].includes(activeJob.status) ? activeJob.eta_seconds : null}
                onExpand={() => navigation.navigate('Track')} />
            </View>

            <SectionHead title="Calls" />
            <Card>
              <Row icon="call-outline" iconTone="teal" title="Call the patient"
                sub={activeJob.contact_phone} chevron onPress={callPatient} />
              {!!activeJob.destination_hospital_phone && ['on_scene', 'transporting'].includes(activeJob.status) && (
                <>
                  <Hair />
                  <Row icon="business-outline" title="Call the hospital ahead"
                    sub={activeJob.destination_hospital_phone} chevron
                    onPress={() => Linking.openURL(`tel:${activeJob.destination_hospital_phone}`)
                      .catch(() => Alert.alert('Error', 'Could not start a call.'))} />
                </>
              )}
              {!!activeJob.destination_hospital_id && (
                <>
                  <Hair />
                  <Row icon="chatbubble-outline" title="Message the hospital"
                    sub="Handover notes for A&E" chevron onPress={messageHospital} />
                </>
              )}
            </Card>

            {activeJob.status === 'on_scene' && (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <Btn label="End without transport" variant="secondary" disabled={updatingStatus}
                  onPress={endWithoutTransport} />
              </View>
            )}
          </>
        ) : (
          <>
            {/* Why the run vanished. get_my_crew_runs can read it once it has
                ended, so the crew is told what happened rather than being
                dropped back on an empty screen. */}
            {!!endedRef && (() => {
              const ended = runs.find(r => r.booking_ref === endedRef)
              const cancelled = ended?.status.startsWith('cancelled')
              return (
                <Notice tone={cancelled ? 'amber' : 'neutral'} icon={cancelled ? 'close-circle-outline' : 'information-circle-outline'}>
                  {ended == null
                    ? `Run ${endedRef} is no longer assigned to you — dispatch cancelled it, or it was reassigned. You are free for the next offer.`
                    : cancelled
                      ? `Run ${endedRef} was cancelled${ended.status === 'cancelled_by_provider' ? ' by dispatch' : ' by the patient'}${ended.cancellation_reason ? `: ${ended.cancellation_reason}` : ''}. You are free for the next offer.`
                      : `Run ${endedRef} is complete. You are free for the next offer.`}
                </Notice>
              )
            })()}

            {units.length === 0 ? (
              <Card style={{ marginTop: 12 }}>
                <Empty icon="car-outline" title="No ambulance assigned to you"
                  body="Your fleet admin assigns a rig to your account from the Fleet screen. Until then you cannot go on duty." />
              </Card>
            ) : units.map(u => {
              // A unit on a job is deliberately hidden from dispatch; that isn't stale GPS.
              const onJob = !!activeJob && (activeJob as ActiveJob).assigned_unit_id === u.ambulance_id
              const stale = u.on_duty && !u.visible_to_dispatch && !onJob
              const busy  = dutyBusy === u.ambulance_id
              return (
                <Card key={u.ambulance_id} style={{ marginTop: 12 }}>
                  <Row
                    icon="car-outline"
                    iconTone={u.visible_to_dispatch ? 'green' : stale ? 'amber' : 'neutral'}
                    title={u.call_sign ?? u.plate_number}
                    sub={`${u.vehicle_tier} · ${u.provider_name}`}
                    pill={u.visible_to_dispatch ? 'Visible to dispatch' : stale ? (locationDenied ? 'Location off' : 'GPS stale') : 'Off duty'}
                    pillTone={u.visible_to_dispatch ? 'green' : stale ? 'amber' : 'neutral'} />
                  <Hair />
                  {/* On duty and dispatchable are different things, and the crew
                      has to be told which one they actually are. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.q.ink }}>On duty</Text>
                      <Text style={{ fontSize: 12.5, lineHeight: 17, color: t.q.ink60 }}>
                        {u.visible_to_dispatch
                          ? 'You receive job offers while this is on.'
                          : stale
                            ? (locationDenied
                                ? 'You are on duty, but location is off. Dispatch cannot see you.'
                                : 'You are on duty, but your position is stale. Keep this screen open to stay dispatchable.')
                            : 'You will not receive any jobs.'}
                      </Text>
                    </View>
                    {busy
                      ? <ActivityIndicator color={t.q.primary} />
                      : <Switch
                          value={u.on_duty}
                          onValueChange={() => { haptics.tap(); handleToggleDuty(u) }}
                          accessibilityLabel={u.on_duty ? 'Go off duty' : 'Go on duty'}
                          trackColor={{ false: t.q.line, true: t.q.primary }}
                          thumbColor="#FFFFFF" />}
                  </View>
                  <Hair />
                  <View style={{ paddingVertical: 2 }}>
                    <DetailLine label="Care tier" value={u.vehicle_tier} />
                    <DetailLine label="Last fix"
                      value={u.seconds_since_ping != null ? `${u.seconds_since_ping}s ago` : 'never'} />
                    {!!u.shift_ends_at && <DetailLine label="Shift ends" value={hhmm(u.shift_ends_at) ?? '—'} last />}
                  </View>
                </Card>
              )
            })}

            <SectionHead title="Offers" />
            {offers.length === 0 ? (
              <Card>
                <Empty icon="notifications-outline" title="No offers right now"
                  body={dispatchable
                    ? 'Keep the app open. A new offer sounds an alarm and shows here with a countdown.'
                    : 'Go on duty to start receiving offers.'} />
              </Card>
            ) : (
              offers.map(o => {
                const secs = countdown(o.expires_at, now)
                const busy = respondingId === o.offer_id
                return (
                  <Card key={o.offer_id} style={{ marginTop: 12 }}>
                    <Row
                      icon="alert-circle"
                      iconTone={triageTone(o.triage_level)}
                      title={o.symptom_description ?? 'No condition details given'}
                      sub={o.pickup_address ?? 'No pickup address given'}
                      pill={triageLabel(o.triage_level)}
                      pillTone={triageTone(o.triage_level)}
                      pillSolid={o.triage_level != null && o.triage_level <= 2}
                      right={<Mono size={16} weight="700" color={secs <= 10 ? t.q.red : t.q.ink}>
                        {`0:${String(secs).padStart(2, '0')}`}
                      </Mono>} />
                    <Hair />
                    <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
                      <Btn grow label="Decline" variant="secondary" disabled={busy}
                        onPress={() => handleRespond(o.offer_id, 'decline')} />
                      <Btn grow label="Accept" loading={busy}
                        onPress={() => { haptics.success(); handleRespond(o.offer_id, 'accept') }} />
                    </View>
                  </Card>
                )
              })
            )}

            {todayRuns.length > 0 && (
              <>
                <SectionHead title={`Today · ${todayRuns.length}`} />
                <Card>
                  {todayRuns.map((r, i) => {
                    const cancelled = r.status.startsWith('cancelled')
                    return (
                      <View key={r.request_id}>
                        {i > 0 && <Hair />}
                        <Row
                          compact
                          dim
                          icon={cancelled ? 'close-circle-outline' : 'checkmark-circle-outline'}
                          iconTone={cancelled ? 'red' : 'green'}
                          title={`${r.booking_ref}${r.triage_level != null ? ` · P${r.triage_level}` : ''}`}
                          sub={[
                            r.symptom_description,
                            r.destination_name ? `to ${r.destination_name}` : null,
                            r.cancellation_reason,
                          ].filter(Boolean).join(' · ') || null}
                          right={<Mono size={12} color={t.q.ink60}>
                            {hhmm(r.ended_at) ?? ''}
                          </Mono>}
                          pill={cancelled ? 'Cancelled' : 'Completed'}
                          pillTone={cancelled ? 'red' : 'neutral'} />
                      </View>
                    )
                  })}
                </Card>
              </>
            )}

            {!!stats && (
              <>
                <SectionHead title="Your record" />
                <Card>
                  <StatStrip>
                    <Stat label="Runs completed" value={stats.jobs_completed} note="handed over" />
                    <Stat label="Avg to scene"
                      value={stats.avg_arrival_secs != null ? Math.round(stats.avg_arrival_secs / 60) : '—'}
                      unit={stats.avg_arrival_secs != null ? 'min' : undefined}
                      note="dispatch to on scene" last />
                  </StatStrip>
                </Card>
              </>
            )}
          </>
        )}
      </Body>

      {!!activeJob && (
        <BottomBar meta={<>
          <Mono size={12} weight="600" color={stalePosition ? t.q.amber : t.q.primary}>
            {etaMins != null ? `ETA ${etaMins} min` : 'ETA unknown'}
          </Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12} weight="600">
            {sincePing != null ? `ping ${sincePing}s` : 'no fix'}
          </Mono>
        </>}>
          {next ? (
            <Btn grow label={CREW_STATUS_LABEL[next]} loading={updatingStatus} onPress={handleAdvanceStatus} />
          ) : activeJob.status === 'arrived_at_destination' ? (
            <Btn grow label="Complete handover" icon="checkmark-done-outline"
              loading={updatingStatus} onPress={confirmHandover} />
          ) : null}
        </BottomBar>
      )}
    </Screen>
  )
}

function DetailLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 40 }}>
        <Text style={{ flex: 1, fontSize: 12.5, color: t.q.ink60 }}>{label}</Text>
        <Mono size={13} weight="600">{value}</Mono>
      </View>
      {!last && <Hair />}
    </>
  )
}
