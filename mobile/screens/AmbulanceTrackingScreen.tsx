import { useState, useEffect, useRef } from 'react'
import * as ExpoLocation from 'expo-location'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Alert } from '../contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { HospitalsMap } from '../components/map/HospitalsMap'
import { FallbackPanel } from '../components/emergency/FallbackPanel'
import {
  getTransportRequestById, getRequestPickupPoint, getUnitLocation,
  subscribeToTransport, subscribeToUnitLocation, cancelTransport,
  sharePatientLocation, formatEta, TRANSPORT_STATUS_LABEL,
  type TransportRequestRow, type TransportStatus,
} from '../lib/ambulance-api'

interface Props { navigation: any; route: any }

const TERMINAL: TransportStatus[] = ['completed', 'cancelled_by_requester', 'cancelled_by_provider', 'no_unit_available']
const CANCELLABLE: TransportStatus[] = ['requested', 'scheduled', 'searching', 'matched', 'en_route_to_patient']

/** Statuses that mean nobody has taken the job yet. */
const STILL_SEARCHING: TransportStatus[] = ['requested', 'scheduled', 'searching']

// While the job is live the crew needs to know where the patient actually is.
// Sharing starts when a unit is assigned — not before, since there is nobody to
// share with — and stops the moment the job ends.
const SHARING_STATUSES: TransportStatus[] = ['matched', 'en_route_to_patient', 'on_scene', 'transporting']

/**
 * Layer C of the 60s deadline (Queue-Ambulance-Stage1-Scope.md).
 *
 * The server enforces the same budget in SQL on pg_cron, but this timer is
 * deliberately independent of it: the phone knows when it sent the request and
 * does not need the backend's permission to conclude a minute has passed. If
 * realtime drops, the API 500s, or the sweeper never runs, the patient is still
 * told at 60 seconds. For a life-safety path, never rely on the failing system
 * to report its own failure.
 */
const SEARCH_DEADLINE_MS = 60_000

const STATUS_ICON: Partial<Record<TransportStatus, keyof typeof Ionicons.glyphMap>> = {
  requested: 'time-outline',
  scheduled: 'calendar-outline',
  searching: 'search-outline',
  matched: 'checkmark-circle-outline',
  en_route_to_patient: 'car-outline',
  on_scene: 'medkit-outline',
  transporting: 'car-outline',
  arrived_at_destination: 'business-outline',
  completed: 'checkmark-done-outline',
  cancelled_by_requester: 'close-circle-outline',
  cancelled_by_provider: 'close-circle-outline',
  no_unit_available: 'alert-circle-outline',
}

export function AmbulanceTrackingScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { requestId } = route.params as { requestId: string }

  const [request,   setRequest]   = useState<TransportRequestRow | null>(null)
  const [pickup,     setPickup]   = useState<{ lat: number; lng: number } | null>(null)
  const [unitPos,    setUnitPos]  = useState<{ lat: number; lng: number; recordedAt: string } | null>(null)
  const [loading,    setLoading]  = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [elapsedMs,  setElapsedMs] = useState(0)

  const unitChannelRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Initial fetch: the row itself plus its pickup point (not included in the
  // realtime payload's select, and rarely needed elsewhere, so it's a
  // separate one-time read rather than part of TransportRequestRow).
  useEffect(() => {
    let cancelled = false
    Promise.all([getTransportRequestById(requestId), getRequestPickupPoint(requestId)]).then(([req, pt]) => {
      if (cancelled) return
      setRequest(req)
      setPickup(pt)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [requestId])

  useEffect(() => {
    const channel = subscribeToTransport(requestId, setRequest)
    return () => { channel.unsubscribe() }
  }, [requestId])

  // Re-subscribe to the assigned unit's live position whenever it changes —
  // a decline mid-search swaps which unit is assigned before one ever accepts.
  useEffect(() => {
    unitChannelRef.current?.unsubscribe()
    unitChannelRef.current = null
    setUnitPos(null)

    const unitId = request?.assigned_unit_id
    if (!unitId) return

    let cancelled = false
    getUnitLocation(unitId).then(pos => { if (!cancelled) setUnitPos(pos) })
    const channel = subscribeToUnitLocation(unitId, setUnitPos)
    unitChannelRef.current = channel

    return () => { cancelled = true; channel.unsubscribe() }
  }, [request?.assigned_unit_id])

  // ── Share position with the crew driving to us ────────────────────────────
  //
  // The pickup point captured at booking is a pin dropped once. People move:
  // out of a building to the roadside, to a landmark the driver can actually
  // find, or because someone drove them partway. Without this the crew is
  // navigating to where the caller was when they tapped, and the last hundred
  // metres — the part that costs minutes — is guesswork.
  //
  // Foreground only, and only while the job is live. record_patient_location()
  // refuses writes once the request is terminal, so the window closes
  // server-side too rather than depending on this screen unmounting cleanly.
  useEffect(() => {
    const status = request?.status
    if (!status || !SHARING_STATUSES.includes(status)) return

    let cancelled = false
    let sub: { remove: () => void } | null = null

    ;(async () => {
      const { status: perm } = await ExpoLocation.getForegroundPermissionsAsync()
      if (perm !== 'granted' || cancelled) return

      sub = await ExpoLocation.watchPositionAsync(
        // Distance filter rather than a tight interval: a stationary patient
        // should not be spending battery, and record_patient_location()
        // discards sub-10m movement anyway.
        { accuracy: ExpoLocation.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 15 },
        (loc) => {
          if (cancelled) return
          sharePatientLocation(requestId, {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            accuracyM: loc.coords.accuracy ?? undefined,
            recordedAt: new Date(loc.timestamp).toISOString(),
          }).catch(() => {/* best-effort; the static pickup point still stands */})
        },
      )
    })().catch(err => console.warn('[tracking] location share failed to start', err))

    return () => { cancelled = true; sub?.remove() }
  }, [requestId, request?.status])

  // Layer C. Anchored to the request's created_at rather than a mount timestamp,
  // so backgrounding the app or re-entering this screen can't quietly restart
  // the clock and hide the deadline from someone who has already waited.
  const searching = request ? STILL_SEARCHING.includes(request.status) : false

  // Prefer the deadline the server stamped, so the countdown the patient sees
  // and the sweeper that fails the request agree on one number. Falls back to
  // created_at + the local budget if it's missing — the timer must still fire
  // for a row written before this column existed.
  const deadlineAt = (() => {
    const stamped = request?.search_deadline_at ? Date.parse(request.search_deadline_at) : NaN
    if (!Number.isNaN(stamped)) return stamped
    const created = request ? Date.parse(request.created_at) : NaN
    return Number.isNaN(created) ? NaN : created + SEARCH_DEADLINE_MS
  })()

  useEffect(() => {
    if (!request || !searching || Number.isNaN(deadlineAt)) return

    const tick = () => setElapsedMs(Date.now() - (deadlineAt - SEARCH_DEADLINE_MS))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadlineAt, searching])

  // True when we've blown the budget but the server hasn't said so yet — either
  // it's about to (the sweeper runs on a 10s tick, so a few seconds of overshoot
  // is normal), or something upstream is broken. Either way the patient is told
  // at the deadline rather than whenever the backend gets around to it.
  const deadlinePassed = searching && !Number.isNaN(deadlineAt) && Date.now() >= deadlineAt
  const secondsLeft = Math.max(0, Math.ceil((SEARCH_DEADLINE_MS - elapsedMs) / 1000))

  function handleCancel() {
    Alert.alert(
      'Cancel ambulance request?',
      'The assigned crew will be notified this request is no longer needed.',
      [
        { text: 'Keep waiting', style: 'cancel' },
        {
          text: 'Cancel request', style: 'destructive', onPress: async () => {
            setCancelling(true)
            try {
              await cancelTransport(requestId, 'Patient cancelled from app')
            } catch (err) {
              Alert.alert('Could not cancel', err instanceof Error ? err.message : 'Please try again.')
            }
            setCancelling(false)
          },
        },
      ],
    )
  }

  function backToHome() {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] })
  }

  if (loading || !request) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#FF5C5C" />
      </SafeAreaView>
    )
  }

  const status      = request.status
  const isTerminal   = TERMINAL.includes(status)
  const canCancel    = CANCELLABLE.includes(status)
  const statusColor  = status === 'completed' ? '#00C265' : status.startsWith('cancelled') || status === 'no_unit_available' ? '#8A8A8A' : '#FF5C5C'

  const markers = [
    ...(pickup  ? [{ id: 'pickup', latitude: pickup.lat,  longitude: pickup.lng,  title: 'Pickup location' }] : []),
    ...(unitPos ? [{ id: 'unit',   latitude: unitPos.lat, longitude: unitPos.lng, title: 'Ambulance' }]       : []),
  ]

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={backToHome} style={s.backBtn}>
          <Ionicons name="close" size={22} color={t.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: t.textPrimary }]}>Ambulance request</Text>
          <Text style={[s.headerSub, { color: t.textMuted }]}>{request.booking_ref}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <View style={[s.statusCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Ionicons name={STATUS_ICON[status] ?? 'help-circle-outline'} size={32} color={statusColor} />
          <Text style={[s.statusText, { color: t.textPrimary }]}>{TRANSPORT_STATUS_LABEL[status]}</Text>
          {!isTerminal && !searching && (
            <Text style={[s.etaText, { color: t.textMuted }]}>ETA: {formatEta(request.eta_seconds)}</Text>
          )}
          {searching && !deadlinePassed && (
            <Text style={[s.etaText, { color: t.textMuted }]}>
              Finding you an ambulance · {secondsLeft}s
            </Text>
          )}
        </View>

        {(status === 'no_unit_available' || deadlinePassed) && (
          <View style={[s.noteBox, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.3)' }]}>
            <Text style={[s.noteText, { color: '#FF5C5C' }]}>
              {status === 'no_unit_available'
                ? 'No ambulance could be reached.'
                : "We haven't been able to reach an ambulance yet."}
              {' '}Don't keep waiting on this request — call one of the numbers below now.
            </Text>
          </View>
        )}

        {/* Always mounted while the outcome is still open, not gated behind
            failure: someone watching a countdown is someone not dialling, and
            both paths can run at once. It only changes tone at the deadline.
            The number list is device-cached, so it renders with no network. */}
        {(searching || status === 'no_unit_available') && (
          <FallbackPanel variant={deadlinePassed || status === 'no_unit_available' ? 'urgent' : 'calm'} />
        )}

        {markers.length > 0 && (
          <HospitalsMap
            style={s.map}
            markers={markers}
            initialRegion={{
              latitude: markers[0].latitude,
              longitude: markers[0].longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            interactive
          />
        )}

        <View style={[s.detailCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {[
            { label: 'Condition', value: request.symptom_description ?? '—' },
            { label: 'Pickup',    value: request.pickup_address ?? 'Current location' },
          ].map(row => (
            <View key={row.label} style={[s.detailRow, { borderBottomColor: t.cardBorder }]}>
              <Text style={[s.detailLabel, { color: t.textMuted }]}>{row.label}</Text>
              <Text style={[s.detailValue, { color: t.textPrimary }]} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </View>

        {canCancel && (
          <TouchableOpacity onPress={handleCancel} disabled={cancelling}
            style={[s.actionBtn, { borderColor: 'rgba(255,92,92,0.4)', opacity: cancelling ? 0.6 : 1 }]}>
            {cancelling
              ? <ActivityIndicator color="#FF5C5C" />
              : <Text style={[s.actionBtnText, { color: '#FF5C5C' }]}>Cancel request</Text>}
          </TouchableOpacity>
        )}

        {isTerminal && (
          <TouchableOpacity onPress={backToHome} style={[s.actionBtn, { borderColor: t.cardBorder }]}>
            <Text style={[s.actionBtnText, { color: t.textPrimary }]}>Back to home</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  backBtn:      { padding: 4, marginTop: 2 },
  headerTitle:  { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  headerSub:    { fontSize: 11, marginTop: 2 },
  statusCard:   { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: 'center', marginBottom: 16 },
  statusText:   { fontSize: 16, fontWeight: '700', marginTop: 10 },
  etaText:      { fontSize: 13, marginTop: 4 },
  noteBox:      { borderRadius: 12, padding: 13, borderWidth: 1, marginBottom: 16 },
  noteText:     { fontSize: 12, lineHeight: 18 },
  map:          { height: 220, borderRadius: 16, marginBottom: 16 },
  detailCard:   { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  detailRow:    { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  detailLabel:  { fontSize: 12, flexShrink: 0 },
  detailValue:  { fontSize: 12, fontWeight: '500', textAlign: 'right', flex: 1 },
  actionBtn:    { padding: 15, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', marginBottom: 10 },
  actionBtnText:{ fontSize: 14, fontWeight: '700' },
})
