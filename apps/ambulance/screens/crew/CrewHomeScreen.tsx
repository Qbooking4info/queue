import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, RefreshControl, Switch } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { Glass, Hero, HeroChip } from '@queue/shared/components/ui/Glass'
import { IconOrb } from '@queue/shared/components/ui/ValueChip'
import { Ring, Pill } from '@queue/shared/components/ui/DataViz'
import {
  getMyPendingOffers, getMyActiveJob, respondToOffer, updateJobStatus,
  sendLocationPing, nextJobStatus, CREW_STATUS_LABEL,
  getMyUnits, setUnitDuty, offerWindowSeconds,
  type PendingOffer, type ActiveJob, type MyUnit,
} from '@queue/shared/lib/crew-api'
import { TRANSPORT_STATUS_LABEL, type TransportStatus } from '@queue/shared/lib/ambulance-api'
import { startBackgroundLocation, stopBackgroundLocation, setBackgroundUnit } from '@queue/shared/lib/location-task'
import { MOCK_LOCATION, mockCoord, mockLivePoint } from '@queue/shared/lib/mock-location'
import { JobPatientMap } from '@queue/shared/components/emergency/JobPatientMap'

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

// triageColor() lived here to tint a bespoke triage badge. <Pill> now carries triage
// via the theme's own status tones, so the helper had no callers left.

export function CrewHomeScreen() {
  const { theme: t } = useTheme()
  const [activeJob, setActiveJob]     = useState<ActiveJob | null>(null)
  const [offers,    setOffers]        = useState<PendingOffer[]>([])
  const [loading,   setLoading]       = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
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
      setOffers(job ? [] : await getMyPendingOffers())
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
  // Home base of whichever unit we're pinging for -- MOCK_LOCATION reports a
  // point orbiting it instead of a real GPS fix.
  const pingUnit = units.find(u => u.ambulance_id === pingUnitId) ?? null
  const pingHomeLat = pingUnit?.home_lat
  const pingHomeLng = pingUnit?.home_lng

  useEffect(() => {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null }
    if (!pingUnitId) return

    let stopped = false

    async function pingOnce() {
      if (stopped || !pingUnitId) return
      try {
        let lat: number, lng: number, heading: number | undefined, speedKmh: number | undefined, accuracyM: number | undefined, recordedAt: string
        if (MOCK_LOCATION) {
          const base = (pingHomeLat != null && pingHomeLng != null)
            ? { latitude: pingHomeLat, longitude: pingHomeLng }
            : mockCoord(pingUnitId)
          const p = mockLivePoint(base)
          lat = p.latitude; lng = p.longitude
          heading = undefined; speedKmh = undefined; accuracyM = 8
          recordedAt = new Date().toISOString()
          setLocationDenied(false)
        } else {
          const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
          if (status !== 'granted') {
            // Without location the unit is on duty but undispatchable. Surfaced in
            // the duty card rather than failing silently.
            setLocationDenied(true)
            return
          }
          setLocationDenied(false)
          const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
          lat = pos.coords.latitude
          lng = pos.coords.longitude
          heading = pos.coords.heading ?? undefined
          speedKmh = pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined
          accuracyM = pos.coords.accuracy ?? undefined
          recordedAt = new Date(pos.timestamp).toISOString()
        }
        await sendLocationPing(pingUnitId, [{ lat, lng, heading, speedKmh, accuracyM, recordedAt }])
      } catch (err) {
        console.warn('[crew] location ping failed', err)
      }
    }

    pingOnce()
    pingTimer.current = setInterval(pingOnce, PING_INTERVAL_MS)
    return () => { stopped = true; if (pingTimer.current) clearInterval(pingTimer.current) }
  }, [pingUnitId, pingHomeLat, pingHomeLng])

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

  async function handleAdvanceStatus() {
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

  function callPatient() {
    if (!activeJob?.contact_phone) return
    Linking.openURL(`tel:${activeJob.contact_phone}`).catch(() => Alert.alert('Error', 'Could not start a call.'))
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    )
  }

  // Header summary. "On duty" and "dispatchable" are different states and the crew
  // has to be able to tell them apart at a glance: an on-duty unit with a stale GPS
  // fix receives nothing, which looks identical to a quiet night.
  const anyOnDuty = units.some(u => u.on_duty)
  const anyDispatchable = units.some(u => u.visible_to_dispatch)

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
      >
        <View style={s.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.title, { color: t.textPrimary }]}>{activeJob ? 'Active job' : 'Pending offers'}</Text>
            <Text style={[s.sub, { color: t.textSecondary }]}>
              {onDutyUnit
                ? `${onDutyUnit.call_sign ?? onDutyUnit.plate_number}, ${onDutyUnit.vehicle_tier}`
                : units.length ? 'No unit on duty' : 'No unit assigned to you'}
            </Text>
          </View>
          <Pill
            label={anyDispatchable ? 'On duty' : anyOnDuty ? 'Position stale' : 'Off duty'}
            tone={anyDispatchable ? 'statusOpen' : anyOnDuty ? 'statusBusy' : 'statusNeutral'}
            dot={anyDispatchable}
          />
        </View>

        {/* Duty, above everything else: an off-duty unit receives no offers at all,
            so if this is off, the empty offer list below is not a quiet night. */}
        {units.map(unit => {
          const stale = unit.on_duty && !unit.visible_to_dispatch
          const busy = dutyBusy === unit.ambulance_id
          return (
            <Glass
              key={unit.ambulance_id}
              radius={22}
              pad={14}
              style={{
                marginBottom: 10,
                borderColor: unit.on_duty ? (stale ? t.statusBusy.text : t.accent) + '55' : t.cardBorder,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconOrb name="bus-outline" size={42} color={unit.on_duty ? t.accent : t.textFaint} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.unitPlate, { color: t.textPrimary }]}>{unit.call_sign ?? unit.plate_number}</Text>
                  <Text style={[s.detailText, { color: t.textSecondary }]} numberOfLines={1}>
                    {unit.vehicle_tier}, {unit.provider_name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {busy ? (
                    <ActivityIndicator color={t.accent} />
                  ) : (
                    <Switch
                      value={unit.on_duty}
                      onValueChange={() => handleToggleDuty(unit)}
                      trackColor={{ false: t.inputBorder, true: t.accent + '99' }}
                      thumbColor={unit.on_duty ? t.accent : undefined}
                    />
                  )}
                  <Text style={{ fontSize: 10.5, color: t.textSecondary, marginTop: 4 }}>
                    {unit.on_duty ? 'On duty' : 'Off duty'}
                  </Text>
                </View>
              </View>

              {unit.on_duty && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                  backgroundColor: unit.visible_to_dispatch ? t.statusOpen.bg : t.statusBusy.bg,
                }}>
                  <View style={{
                    width: 7, height: 7, borderRadius: 4,
                    backgroundColor: unit.visible_to_dispatch ? t.statusOpen.text : t.statusBusy.text,
                  }} />
                  <Text style={{
                    fontSize: 12, flex: 1,
                    color: unit.visible_to_dispatch ? t.statusOpen.text : t.statusBusy.text,
                  }}>
                    {unit.visible_to_dispatch
                      ? 'Visible to dispatch, you can receive jobs'
                      : locationDenied
                        ? 'Not dispatchable, location is off'
                        : 'Not dispatchable, location is stale'}
                  </Text>
                </View>
              )}
            </Glass>
          )
        })}

        {activeJob ? (
          <>
            {/* The live job is the most urgent thing on the screen, so it takes the
                gradient hero rather than another quiet panel. */}
            <Hero style={{ marginTop: 8, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <HeroChip>
                  <Ionicons
                    name={activeJob.triage_level ? 'alert-circle-outline' : 'calendar-outline'}
                    size={13}
                    color={t.onHero}
                  />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: t.onHero }}>
                    {activeJob.triage_level ? `Triage ${activeJob.triage_level}` : 'Scheduled'}
                  </Text>
                </HeroChip>
                <Text style={{ fontSize: 11.5, color: t.onHero, opacity: 0.85 }}>{activeJob.booking_ref}</Text>
              </View>

              <Text style={{ fontSize: 12, color: t.onHero, opacity: 0.85, marginTop: 14 }}>
                {TRANSPORT_STATUS_LABEL[activeJob.status as TransportStatus] ?? activeJob.status}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: t.onHero, marginTop: 2 }}>
                {activeJob.symptom_description ?? 'No condition details provided'}
              </Text>

              {!!activeJob.pickup_address && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <Ionicons name="location-outline" size={14} color={t.onHero} />
                  <Text style={{ fontSize: 12.5, color: t.onHero, opacity: 0.9, flex: 1 }}>{activeJob.pickup_address}</Text>
                </View>
              )}
              {!!activeJob.destination_hospital_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="business-outline" size={14} color={t.onHero} />
                  <Text style={{ fontSize: 12.5, color: t.onHero, opacity: 0.9, flex: 1 }}>{activeJob.destination_hospital_name}</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
                <HeroChip style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'column', alignItems: 'center' }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: t.onHero }}>
                    {activeJob.eta_seconds != null ? `${Math.max(1, Math.round(activeJob.eta_seconds / 60))} min` : '—'}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: t.onHero, opacity: 0.85 }}>ETA</Text>
                </HeroChip>
                {nextJobStatus(activeJob.status) ? (
                  <TouchableOpacity
                    onPress={handleAdvanceStatus}
                    disabled={updatingStatus}
                    style={{
                      flex: 1, paddingVertical: 13, borderRadius: 999, alignItems: 'center',
                      backgroundColor: 'rgba(255,255,255,0.92)', opacity: updatingStatus ? 0.6 : 1,
                    }}
                  >
                    {updatingStatus
                      ? <ActivityIndicator color={t.bannerBg} />
                      : <Text style={{ fontSize: 13, fontWeight: '700', color: t.bannerBg }}>
                          {`Mark: ${CREW_STATUS_LABEL[nextJobStatus(activeJob.status)!]}`}
                        </Text>}
                  </TouchableOpacity>
                ) : (
                  <Text style={{ flex: 1, fontSize: 12, color: t.onHero, opacity: 0.9 }}>
                    Arrived. The receiving facility completes handover from here.
                  </Text>
                )}
              </View>
            </Hero>

            {/* Where the patient actually is, and how long until we're there. Both
                come from the server, so crew and patient read the same number. */}
            <Glass radius={22} pad={12} style={{ marginBottom: 12 }}>
              <JobPatientMap
                requestId={activeJob.request_id}
                pickup={activeJob.pickup_lat != null && activeJob.pickup_lng != null
                  ? { lat: activeJob.pickup_lat, lng: activeJob.pickup_lng }
                  : null}
                etaSeconds={activeJob.eta_seconds}
              />
            </Glass>

            <Button label="Call patient" onPress={callPatient} variant="outline" icon="call-outline" />
          </>
        ) : offers.length === 0 ? (
          <Glass radius={22} pad={32} style={{ alignItems: 'center', marginTop: 8 }}>
            <IconOrb name="checkmark-done-outline" size={46} color={t.textSecondary} />
            <Text style={{ fontSize: 15, color: t.textSecondary, marginTop: 12 }}>No pending offers right now</Text>
          </Glass>
        ) : (
          offers.map(o => {
            const secs = countdown(o.expires_at, now)
            const window = offerWindowSeconds(o.triage_level)
            const busy = respondingId === o.offer_id
            const urgent = secs <= 10
            return (
              <View key={o.offer_id} style={{ marginTop: 8, marginBottom: 10 }}>
                <Glass radius={22} pad={14}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {/* Ring, not a bare number: the proportion left is the thing that
                        matters when deciding whether to take a job. */}
                    <Ring fraction={secs / window} color={urgent ? t.danger : t.accent}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: urgent ? t.danger : t.textPrimary }}>
                        {secs}s
                      </Text>
                    </Ring>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Pill
                        label={o.triage_level ? `Triage ${o.triage_level}` : 'Scheduled'}
                        tone={o.triage_level == null ? 'statusVirtual' : o.triage_level <= 2 ? 'statusCancelled' : 'statusBusy'}
                      />
                      <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.textPrimary, marginTop: 6 }}>
                        {o.symptom_description ?? 'No condition details provided'}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 1 }} numberOfLines={2}>
                        {o.pickup_address ?? 'Pickup address not given'}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 1 }}>
                        ETA ~{Math.max(1, Math.round((o.eta_seconds ?? 0) / 60))} min away
                      </Text>
                    </View>
                  </View>
                </Glass>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Button
                    label="Pass"
                    onPress={() => handleRespond(o.offer_id, 'decline')}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Accept"
                    onPress={() => handleRespond(o.offer_id, 'accept')}
                    loading={busy}
                    icon="checkmark"
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:  { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  title: { fontSize: 25, fontWeight: '700', letterSpacing: -0.5 },
  sub:   { fontSize: 12.5, marginTop: 4 },
  unitPlate:  { fontSize: 14.5, fontWeight: '700', letterSpacing: 0.3 },
  detailText: { fontSize: 11.5, marginTop: 1 },
})