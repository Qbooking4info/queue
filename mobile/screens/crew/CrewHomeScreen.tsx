import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '../../contexts/ThemeContext'
import {
  getMyPendingOffers, getMyActiveJob, respondToOffer, updateJobStatus,
  sendLocationPing, nextJobStatus, CREW_STATUS_LABEL,
  getMyUnits, setUnitDuty,
  type PendingOffer, type ActiveJob, type MyUnit,
} from '../../lib/crew-api'
import { TRANSPORT_STATUS_LABEL, type TransportStatus } from '../../lib/ambulance-api'
import { startBackgroundLocation, stopBackgroundLocation } from '../../lib/location-task'
import { JobPatientMap } from '../../components/emergency/JobPatientMap'

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
  if (level <= 2) return '#FF5C5C'
  if (level === 3) return '#FFB547'
  return '#7A9089'
}

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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
      >
        {/* Duty. Above everything else because an off-duty unit receives no
            offers at all — if this is off, the empty offer list below is not a
            quiet night, it's the crew being invisible. */}
        {units.map(unit => {
          const stale = unit.on_duty && !unit.visible_to_dispatch
          return (
            <View key={unit.ambulance_id} style={[s.card, {
              backgroundColor: t.cardBg,
              borderColor: unit.on_duty ? (stale ? '#FFB547' : '#00C265') : t.cardBorder,
              borderWidth: unit.on_duty ? 1.5 : 1,
            }]}>
              <View style={[s.row, { alignItems: 'center' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.statusLabel, { color: t.textPrimary }]}>
                    {unit.call_sign ?? unit.plate_number}
                  </Text>
                  <Text style={[s.detailText, { color: t.textMuted, marginTop: 2 }]}>
                    {unit.vehicle_tier} · {unit.provider_name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleToggleDuty(unit)}
                  disabled={dutyBusy === unit.ambulance_id}
                  style={[s.secondaryBtn, {
                    borderColor: unit.on_duty ? '#FF5C5C55' : '#00C26555',
                    backgroundColor: unit.on_duty ? '#FF5C5C14' : '#00C26514',
                    opacity: dutyBusy === unit.ambulance_id ? 0.5 : 1,
                    paddingHorizontal: 16,
                  }]}
                >
                  {dutyBusy === unit.ambulance_id
                    ? <ActivityIndicator size="small" color={t.textMuted} />
                    : <Text style={{ fontSize: 13, fontWeight: '800', color: unit.on_duty ? '#FF5C5C' : '#00C265' }}>
                        {unit.on_duty ? 'Go off duty' : 'Go on duty'}
                      </Text>}
                </TouchableOpacity>
              </View>

              {/* On duty and dispatchable are different things, and the crew has
                  to be told which one they actually are. */}
              <View style={[s.detailRow, { marginTop: 10 }]}>
                <Ionicons
                  name={unit.visible_to_dispatch ? 'radio-outline' : unit.on_duty ? 'warning-outline' : 'moon-outline'}
                  size={14}
                  color={unit.visible_to_dispatch ? '#00C265' : stale ? '#FFB547' : t.textMuted}
                />
                <Text style={[s.detailText, {
                  color: unit.visible_to_dispatch ? '#00C265' : stale ? '#FFB547' : t.textMuted, flex: 1,
                }]}>
                  {unit.visible_to_dispatch
                    ? 'Visible to dispatch — you can receive jobs'
                    : stale
                      ? locationDenied
                        ? 'On duty, but location is off. Dispatch cannot see you.'
                        : 'On duty, but your position is stale. Keep this screen open to stay dispatchable.'
                      : 'Off duty — you will not receive any jobs'}
                </Text>
              </View>
            </View>
          )
        })}

        <Text style={[s.title, { color: t.textPrimary }]}>{activeJob ? 'Active Job' : 'Pending Offers'}</Text>

        {activeJob ? (
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={s.row}>
              <View style={[s.triageBadge, { backgroundColor: `${triageColor(activeJob.triage_level)}18`, borderColor: `${triageColor(activeJob.triage_level)}40` }]}>
                <Text style={[s.triageBadgeText, { color: triageColor(activeJob.triage_level) }]}>
                  {activeJob.triage_level ? `Triage ${activeJob.triage_level}` : 'Scheduled'}
                </Text>
              </View>
              <Text style={[s.bookingRef, { color: t.textMuted }]}>{activeJob.booking_ref}</Text>
            </View>

            <Text style={[s.statusLabel, { color: t.accent }]}>{TRANSPORT_STATUS_LABEL[activeJob.status as TransportStatus] ?? activeJob.status}</Text>
            <Text style={[s.symptom, { color: t.textPrimary }]}>{activeJob.symptom_description ?? 'No condition details provided'}</Text>

            {activeJob.pickup_address && (
              <View style={s.detailRow}>
                <Ionicons name="location-outline" size={14} color={t.textMuted} />
                <Text style={[s.detailText, { color: t.textSecondary }]}>{activeJob.pickup_address}</Text>
              </View>
            )}
            {activeJob.destination_hospital_name && (
              <View style={s.detailRow}>
                <Ionicons name="business-outline" size={14} color={t.textMuted} />
                <Text style={[s.detailText, { color: t.textSecondary }]}>{activeJob.destination_hospital_name}</Text>
              </View>
            )}

            {/* Where the patient actually is, and how long until we're there.
                Both come from the server, so the crew and the patient are
                reading the same number rather than two guesses. */}
            <JobPatientMap
              requestId={activeJob.request_id}
              pickup={activeJob.pickup_lat != null && activeJob.pickup_lng != null
                ? { lat: activeJob.pickup_lat, lng: activeJob.pickup_lng }
                : null}
              etaSeconds={activeJob.eta_seconds}
            />

            <TouchableOpacity onPress={callPatient} style={[s.secondaryBtn, { borderColor: t.cardBorder, marginTop: 14 }]}>
              <Ionicons name="call-outline" size={16} color={t.textPrimary} />
              <Text style={[s.secondaryBtnText, { color: t.textPrimary }]}>Call patient</Text>
            </TouchableOpacity>

            {nextJobStatus(activeJob.status) ? (
              <TouchableOpacity onPress={handleAdvanceStatus} disabled={updatingStatus}
                style={[s.primaryBtn, { backgroundColor: t.accent, opacity: updatingStatus ? 0.6 : 1 }]}>
                {updatingStatus
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Mark: {CREW_STATUS_LABEL[nextJobStatus(activeJob.status)!]}</Text>}
              </TouchableOpacity>
            ) : (
              <View style={[s.noteBox, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.noteText, { color: t.accent }]}>
                  Arrived — the receiving facility completes handover from here.
                </Text>
              </View>
            )}
          </View>
        ) : offers.length === 0 ? (
          <View style={[s.emptyBox, { borderColor: t.cardBorder }]}>
            <Ionicons name="checkmark-done-outline" size={32} color={t.textMuted} style={{ marginBottom: 8 }} />
            <Text style={[s.emptyText, { color: t.textMuted }]}>No pending offers right now</Text>
          </View>
        ) : (
          offers.map(o => {
            const secs = countdown(o.expires_at, now)
            const busy = respondingId === o.offer_id
            return (
              <View key={o.offer_id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={s.row}>
                  <View style={[s.triageBadge, { backgroundColor: `${triageColor(o.triage_level)}18`, borderColor: `${triageColor(o.triage_level)}40` }]}>
                    <Text style={[s.triageBadgeText, { color: triageColor(o.triage_level) }]}>
                      {o.triage_level ? `Triage ${o.triage_level}` : '—'}
                    </Text>
                  </View>
                  <Text style={[s.countdown, { color: secs <= 10 ? '#FF5C5C' : t.textMuted }]}>{secs}s</Text>
                </View>
                <Text style={[s.symptom, { color: t.textPrimary }]}>{o.symptom_description ?? 'No condition details provided'}</Text>
                {o.pickup_address && (
                  <View style={s.detailRow}>
                    <Ionicons name="location-outline" size={14} color={t.textMuted} />
                    <Text style={[s.detailText, { color: t.textSecondary }]}>{o.pickup_address}</Text>
                  </View>
                )}
                <View style={s.detailRow}>
                  <Ionicons name="time-outline" size={14} color={t.textMuted} />
                  <Text style={[s.detailText, { color: t.textSecondary }]}>ETA ~{Math.round((o.eta_seconds ?? 0) / 60)} min</Text>
                </View>
                <View style={s.offerActions}>
                  <TouchableOpacity onPress={() => handleRespond(o.offer_id, 'decline')} disabled={busy}
                    style={[s.secondaryBtn, { flex: 1, borderColor: t.cardBorder, opacity: busy ? 0.6 : 1 }]}>
                    <Text style={[s.secondaryBtnText, { color: t.textPrimary }]}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRespond(o.offer_id, 'accept')} disabled={busy}
                    style={[s.primaryBtn, { flex: 1, backgroundColor: '#FF5C5C', opacity: busy ? 0.6 : 1 }]}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Accept</Text>}
                  </TouchableOpacity>
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
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 16 },
  card:  { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  triageBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  triageBadgeText: { fontSize: 11, fontWeight: '800' },
  bookingRef: { fontSize: 11 },
  countdown:  { fontSize: 16, fontWeight: '800' },
  statusLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  symptom:    { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  detailText: { fontSize: 12 },
  offerActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryBtn:   { padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  secondaryBtn: { flexDirection: 'row', gap: 6, padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  noteBox:  { borderRadius: 12, padding: 13, borderWidth: 1, marginTop: 14 },
  noteText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  emptyBox: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 13 },
})
