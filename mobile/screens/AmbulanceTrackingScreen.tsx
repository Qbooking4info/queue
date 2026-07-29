import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { HospitalsMap } from '../components/map/HospitalsMap'
import {
  getTransportRequestById, getRequestPickupPoint, getUnitLocation,
  subscribeToTransport, subscribeToUnitLocation, cancelTransport,
  formatEta, TRANSPORT_STATUS_LABEL,
  type TransportRequestRow, type TransportStatus,
} from '../lib/ambulance-api'

interface Props { navigation: any; route: any }

const TERMINAL: TransportStatus[] = ['completed', 'cancelled_by_requester', 'cancelled_by_provider', 'no_unit_available']
const CANCELLABLE: TransportStatus[] = ['requested', 'scheduled', 'searching', 'matched', 'en_route_to_patient']

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
          {!isTerminal && (
            <Text style={[s.etaText, { color: t.textMuted }]}>ETA: {formatEta(request.eta_seconds)}</Text>
          )}
        </View>

        {status === 'no_unit_available' && (
          <View style={[s.noteBox, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.3)' }]}>
            <Text style={[s.noteText, { color: '#FF5C5C' }]}>
              No ambulance could be reached. If this is life-threatening, call{' '}
              <Text style={{ fontWeight: '800' }}>112</Text> directly instead of waiting on this request.
            </Text>
          </View>
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
