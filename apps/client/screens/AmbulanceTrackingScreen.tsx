import { useState, useEffect, useRef } from 'react'
import * as ExpoLocation from 'expo-location'
import { View, ActivityIndicator, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, DetailRow, Journey,
  Notice, Btn, BottomBar, IconBtn, Mono,
} from '@queue/shared/components/q'
import { HospitalsMap } from '@queue/shared/components/map/HospitalsMap'
import { FallbackPanel } from '@queue/shared/components/emergency/FallbackPanel'
import {
  getRequestPickupPoint, getUnitLocation,
  subscribeToTransport, subscribeToUnitLocation, cancelTransport,
  sharePatientLocation, formatEta, TRANSPORT_STATUS_LABEL,
  getTransportDetails, DISPOSITION_LABEL,
  type TransportRequestRow, type TransportStatus, type TransportDetails,
} from '@queue/shared/lib/ambulance-api'
import { startTransportSync, TRANSPORT_POLL_MS } from '@queue/shared/lib/transport-sync'

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
  const [syncKey,    setSyncKey]  = useState(0)

  const unitChannelRef = useRef<{ unsubscribe: () => void } | null>(null)

  // The row, kept current by polling and on app resume as well as realtime (below):
  // a dropped websocket reports nothing, so realtime alone could leave the status
  // frozen. A failed first read ends loading and shows a retry, never a spinner
  // that waits forever. The pickup point is a separate one-time read — it isn't
  // in the realtime payload and never changes.
  useEffect(() => {
    let cancelled = false
    getRequestPickupPoint(requestId).then(pt => { if (!cancelled) setPickup(pt) }).catch(() => {})
    const stop = startTransportSync(requestId, {
      onRow: row => {
        if (cancelled) return
        if (row) setRequest(row)
        setLoading(false)
      },
      onError: err => {
        if (cancelled) return
        console.warn('[tracking] failed to load request', err)
        setLoading(false)
      },
    })
    return () => { cancelled = true; stop() }
  }, [requestId, syncKey])

  // Unit, operator and destination. Re-read on every status change and when the
  // crew picks or changes the hospital, which the realtime row tells us about.
  const [details, setDetails] = useState<TransportDetails | null>(null)
  useEffect(() => {
    if (!request?.assigned_unit_id) return
    let cancelled = false
    getTransportDetails(requestId).then(d => { if (!cancelled) setDetails(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [requestId, request?.assigned_unit_id, request?.status, request?.destination_hospital_id])

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
    const refresh = () => getUnitLocation(unitId).then(pos => { if (!cancelled && pos) setUnitPos(pos) }).catch(() => {})
    refresh()
    // Same reason as the request poll: realtime alone goes quiet on a dropped socket.
    const poll = setInterval(refresh, TRANSPORT_POLL_MS)
    const channel = subscribeToUnitLocation(unitId, setUnitPos)
    unitChannelRef.current = channel

    return () => { cancelled = true; clearInterval(poll); channel.unsubscribe() }
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

  if (!request && loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.red} />
        </View>
      </Screen>
    )
  }

  if (!request) {
    return (
      <Screen>
        <AppBar title="Ambulance request" />
        <Body>
          <Notice tone="red" icon="alert-circle-outline">
            We could not load your ambulance request. It may still be active. Check your connection and
            try again — and if this is life-threatening, call an emergency number now.
          </Notice>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <Btn label="Try again" onPress={() => { setLoading(true); setSyncKey(k => k + 1) }} />
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <FallbackPanel variant="urgent" />
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Btn label="Back to home" variant="secondary" onPress={backToHome} />
          </View>
        </Body>
      </Screen>
    )
  }

  const status = request.status
  const isTerminal = TERMINAL.includes(status)
  const canCancel = CANCELLABLE.includes(status)

  const markers = [
    ...(pickup ? [{ id: 'pickup', latitude: pickup.lat, longitude: pickup.lng, title: 'Pickup location' }] : []),
    ...(unitPos ? [{ id: 'unit', latitude: unitPos.lat, longitude: unitPos.lng, title: 'Ambulance' }] : []),
  ]

  // The ambulance journey, in the same rail language the hospital visit uses.
  // Terminal states are deliberately NOT placed on it: a cancelled job did not
  // reach "arrived", and a rail that shows it there would be a lie told at the
  // worst possible moment.
  const STOPS = ['Accepted', 'On the way', 'Arrived', 'To hospital', 'At hospital']
  const stopIndex =
    status === 'matched' ? 0
    : status === 'en_route_to_patient' ? 1
    : status === 'on_scene' ? 2
    : status === 'transporting' ? 3
    : status === 'arrived_at_destination' || status === 'completed' ? 4
    : -1

  const etaText = searching
    ? (deadlinePassed ? 'Still searching' : `Finding a crew · ${secondsLeft}s`)
    : formatEta(request.eta_seconds)

  return (
    <Screen>
      <AppBar
        title="Ambulance request"
        sub={request.booking_ref ?? undefined}
        right={<IconBtn name="close" label="Close" onPress={backToHome} />}
      />

      <Body>
        {stopIndex >= 0 && !isTerminal && (
          <Journey steps={STOPS} activeIndex={stopIndex} />
        )}

        <Card>
          <Row
            icon={STATUS_ICON[status] ?? 'help-circle-outline'}
            iconTone={isTerminal ? 'neutral' : 'red'}
            title={TRANSPORT_STATUS_LABEL[status]}
            sub={isTerminal ? null : etaText}
            right={!isTerminal && !searching && request.eta_seconds != null
              ? <Mono size={15} weight="700" color={t.q.red}>{formatEta(request.eta_seconds)}</Mono>
              : undefined}
          />
          {!!unitPos && (
            <>
              <Hair />
              <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                <Mono size={11} color={t.q.ink60}>
                  Unit last seen {Math.max(0, Math.round((Date.now() - Date.parse(unitPos.recordedAt)) / 1000))}s ago
                </Mono>
              </View>
            </>
          )}
        </Card>

        {(status === 'no_unit_available' || deadlinePassed) && (
          <Notice tone="red" icon="alert-circle-outline">
            {status === 'no_unit_available'
              ? 'No ambulance could be reached.'
              : 'We have not been able to reach an ambulance yet.'}
            {' '}Do not keep waiting on this request — call one of the numbers below now.
          </Notice>
        )}

        {/* Always mounted while the outcome is still open, not gated behind
            failure: someone watching a countdown is someone not dialling, and
            both paths can run at once. It only changes tone at the deadline.
            The number list is device-cached, so it renders with no network. */}
        {(searching || status === 'no_unit_available') && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <FallbackPanel variant={deadlinePassed || status === 'no_unit_available' ? 'urgent' : 'calm'} />
          </View>
        )}

        {markers.length > 0 && (
          <Card>
            <HospitalsMap
              style={{ height: 220 }}
              markers={markers}
              initialRegion={{
                latitude: markers[0].latitude,
                longitude: markers[0].longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
              interactive
            />
          </Card>
        )}

        {status === 'completed' && (
          <Notice tone="green" icon="checkmark-circle-outline">
            {details?.disposition ? DISPOSITION_LABEL[details.disposition] ?? 'Trip completed' : 'Trip completed'}
            {details?.disposition === 'transported' && details.destination_name ? ` — ${details.destination_name}` : ''}.
            {' '}Thank you for using Queue. Take care.
          </Notice>
        )}

        {/* Who is coming. Shown from the moment a crew accepts, so the patient
            can recognise the vehicle and reach the operator without hunting
            for a number. */}
        {details?.plate_number && !isTerminal && (
          <>
            <SectionHead title="Your ambulance" />
            <Card>
              <Row
                icon="medkit" iconTone="red"
                title={details.call_sign ?? details.plate_number}
                sub={[
                  details.plate_number !== details.call_sign ? details.plate_number : null,
                  details.vehicle_tier,
                  details.provider_name,
                ].filter(Boolean).join(' · ')}
                right={details.provider_phone
                  ? <Btn label="Call" variant="secondary" small icon="call-outline"
                      onPress={() => Linking.openURL(`tel:${details.provider_phone}`)
                        .catch(() => Alert.alert('Error', 'Could not start a call.'))} />
                  : undefined}
              />
            </Card>
          </>
        )}

        <SectionHead title="The request" />
        <Card>
          <DetailRow label="Condition" value={request.symptom_description ?? '—'} />
          <DetailRow label="Pickup" value={request.pickup_address ?? 'Current location'} />
          {!!details?.destination_name && <DetailRow label="Taking you to" value={details.destination_name} />}
          <DetailRow label="Reference" value={request.booking_ref ?? '—'} mono last />
        </Card>
      </Body>

      {(canCancel || isTerminal) && (
        <BottomBar meta={
          !isTerminal ? (
            <>
              <Mono size={12} color={t.q.red} weight="700">{TRANSPORT_STATUS_LABEL[status]}</Mono>
              {!!details?.call_sign && (
                <>
                  <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
                  <Mono size={12}>{details.call_sign}</Mono>
                </>
              )}
            </>
          ) : undefined
        }>
          {canCancel && (
            <Btn grow label="Cancel request" variant="danger" loading={cancelling} onPress={handleCancel} />
          )}
          {isTerminal && (
            <Btn grow label="Back to home" onPress={backToHome} />
          )}
        </BottomBar>
      )}
    </Screen>
  )
}
