import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ExpoLocation from 'expo-location'
import { useTheme } from '../../contexts/ThemeContext'
import {
  getMyPendingOffers, getMyActiveJob, respondToOffer, updateJobStatus,
  sendLocationPing, nextJobStatus, CREW_STATUS_LABEL,
  type PendingOffer, type ActiveJob,
} from '../../lib/crew-api'
import { TRANSPORT_STATUS_LABEL, type TransportStatus } from '../../lib/ambulance-api'

// Foreground-only pings while this screen has an active job open — background
// tracking (app minimized) is a separate, larger feature (needs a TaskManager
// background task + always-allow location permission) not built yet.
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

  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const job = await getMyActiveJob()
      setActiveJob(job)
      setOffers(job ? [] : await getMyPendingOffers())
    } catch (err) {
      console.warn('[crew] load failed', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

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

  // Send a location ping on an interval while there's an active job. Stops
  // cleanly whenever the job clears (completed, cancelled, or reassigned).
  useEffect(() => {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null }
    if (!activeJob) return

    async function pingOnce() {
      if (!activeJob) return
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
        if (status !== 'granted') return
        const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
        await sendLocationPing(activeJob.assigned_unit_id, [{
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
    return () => { if (pingTimer.current) clearInterval(pingTimer.current) }
  }, [activeJob?.request_id, activeJob?.assigned_unit_id])

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
