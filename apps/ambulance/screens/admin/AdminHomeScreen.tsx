import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Glass } from '@queue/shared/components/ui/Glass'
import { IconOrb } from '@queue/shared/components/ui/ValueChip'
import { MetricCard } from '@queue/shared/components/ui/MetricCard'
import { Spark, Ticks, Pill } from '@queue/shared/components/ui/DataViz'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import {
  getFleet, getFleetRequests,
  type FleetUnit, type FleetRequestRow,
} from '@queue/shared/lib/ambulance-admin-api'
import { TRANSPORT_STATUS_LABEL, type TransportStatus } from '@queue/shared/lib/ambulance-api'

const ACTIVE_STATUSES: TransportStatus[] = [
  'requested', 'scheduled', 'searching', 'matched',
  'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination',
]

const POLL_INTERVAL_MS = 15_000

function embeddedName(x: { full_name: string } | { full_name: string }[] | null): string | null {
  return (Array.isArray(x) ? x[0]?.full_name : x?.full_name) ?? null
}

function embeddedUnit(u: FleetRequestRow['unit']): { plate_number: string; call_sign: string | null; vehicle_tier: string } | null {
  return Array.isArray(u) ? u[0] ?? null : u
}

function isToday(iso: string): boolean {
  const d = new Date(iso), now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

// triageColor() tinted a bespoke triage badge; <Pill> now carries triage via the
// theme's own status tones, leaving the helper with no callers.

export function AdminHomeScreen() {
  const { theme: t } = useTheme()
  const { providerAdminProfile } = useAuth()
  const [units, setUnits] = useState<FleetUnit[]>([])
  const [requests, setRequests] = useState<FleetRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'active' | 'history'>('active')

  const providerName = providerAdminProfile?.providerName

  const load = useCallback(async () => {
    try {
      const [fleet, reqs] = await Promise.all([getFleet(), getFleetRequests()])
      setUnits(fleet.ambulances)
      setRequests(reqs.requests)
    } catch (err) {
      console.warn('[admin] load failed', err)
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

  const active = requests.filter(r => ACTIVE_STATUSES.includes(r.status))
  const history = requests.filter(r => !ACTIVE_STATUSES.includes(r.status))
  const todayRequests = requests.filter(r => isToday(r.created_at))
  const respondedToday = todayRequests.filter(r => r.matched_at)
  const avgResponseMin = respondedToday.length
    ? Math.round(respondedToday.reduce((sum, r) => sum + (new Date(r.matched_at!).getTime() - new Date(r.created_at).getTime()) / 60000, 0) / respondedToday.length)
    : null
  const unitsAvailable = units.filter(u => u.visible_to_dispatch).length

  // Real series for the metric charts. Every one is derived from data already on
  // this screen -- a chart drawn from a decorative fixed path would imply a trend
  // that isn't there, which is worse than showing the bare number.
  //
  // Response minutes in the order the calls came in, so the line shows whether
  // dispatch is speeding up or falling behind across the day.
  const responseSeries = respondedToday
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(r => (new Date(r.matched_at!).getTime() - new Date(r.created_at).getTime()) / 60000)

  // Today in 2-hour buckets, midnight to midnight.
  const callsByBucket = Array.from({ length: 12 }, (_, i) =>
    todayRequests.filter(r => Math.floor(new Date(r.created_at).getHours() / 2) === i).length)

  // One tick per unit: full height if it can actually receive a job right now,
  // stub if it's off duty or its position has gone stale.
  const unitTicks = units.length
    ? units.map(u => (u.visible_to_dispatch ? 1 : 0.28))
    : [0]

  // One tick per open call, taller the more urgent it is.
  const activeTicks = active.length
    ? active.map(r => (r.triage_level == null ? 0.3 : Math.max(0.3, (5 - r.triage_level) / 4)))
    : [0]

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    )
  }

  const list = tab === 'active' ? active : history

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
      >
        <Text style={[s.title, { color: t.textPrimary }]}>{providerName ?? 'Dispatcher'}</Text>
        <Text style={[s.subtitle, { color: t.textMuted }]}>
          {providerAdminProfile?.providerType === 'hospital_fleet' ? 'Hospital fleet' : 'Independent operator'}
        </Text>

        <View style={s.statGrid}>
          <MetricCard
            icon="alert-circle-outline" title="Active calls" sub="Open right now"
            value={active.length} unit={active.length === 1 ? 'call' : 'calls'}
            tone={active.length ? t.danger : undefined}
            iconColor={active.length ? t.danger : t.accent}
            chart={<Ticks data={activeTicks} />}
          />
          <MetricCard
            icon="bus-outline" title="Units ready" sub={`Of ${units.length} in fleet`}
            value={unitsAvailable} unit="ready"
            chart={<Ticks data={unitTicks} />}
          />
        </View>
        <View style={s.statGrid}>
          <MetricCard
            icon="timer-outline" title="Avg response" sub="Dispatched today"
            value={avgResponseMin != null ? avgResponseMin : '—'} unit={avgResponseMin != null ? 'min' : undefined}
            chart={<Spark data={responseSeries} />}
          />
          <MetricCard
            icon="calendar-outline" title="Calls today" sub="Midnight to now"
            value={todayRequests.length} unit={todayRequests.length === 1 ? 'call' : 'calls'}
            chart={<Spark data={callsByBucket} />}
          />
        </View>

        <View style={[s.tabRow, { borderColor: t.cardBorder }]}>
          {(['active', 'history'] as const).map(k => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.tabBtn, tab === k && { backgroundColor: t.accentBgMid }]}>
              <Text style={{ color: tab === k ? t.accent : t.textMuted, fontSize: 15, fontWeight: '700' }}>
                {k === 'active' ? `Active (${active.length})` : `History (${history.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {list.length === 0 ? (
          <View style={[s.emptyBox, { borderColor: t.cardBorder }]}>
            <Ionicons name={tab === 'active' ? 'checkmark-done-outline' : 'time-outline'} size={30} color={t.textMuted} style={{ marginBottom: 8 }} />
            <Text style={[s.emptyText, { color: t.textMuted }]}>
              {tab === 'active' ? 'No active jobs right now' : 'No completed jobs yet'}
            </Text>
          </View>
        ) : (
          list.map(r => {
            const unit = embeddedUnit(r.unit)
            const name = embeddedName(r.patient) ?? embeddedName(r.dependent) ?? r.caller_patient_name ?? 'Unregistered caller'
            return (
              <Glass key={r.id} radius={22} pad={14} style={{ marginBottom: 10 }}>
                <View style={s.row}>
                  <Pill
                    label={r.triage_level ? `Triage ${r.triage_level}` : r.request_type === 'scheduled' ? 'Scheduled' : 'Untriaged'}
                    tone={r.triage_level == null
                      ? (r.request_type === 'scheduled' ? 'statusVirtual' : 'statusNeutral')
                      : r.triage_level <= 2 ? 'statusCancelled' : 'statusBusy'}
                    dot={r.triage_level != null && r.triage_level <= 2}
                  />
                  <Text style={[s.bookingRef, { color: t.textSecondary }]}>{r.booking_ref}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <IconOrb
                    name={r.triage_level ? 'alert-circle-outline' : 'calendar-outline'}
                    size={40}
                    color={r.triage_level && r.triage_level <= 2 ? t.danger : t.accent}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.name, { color: t.textPrimary }]}>{name}</Text>
                <Text style={[s.statusLine, { color: t.accent }]}>{TRANSPORT_STATUS_LABEL[r.status] ?? r.status}</Text>
                {r.symptom_description && (
                  <Text style={[s.detailText, { color: t.textSecondary }]}>{r.symptom_description}</Text>
                )}
                <View style={s.metaRow}>
                  {unit && (
                    <View style={s.detailRow}>
                      <Ionicons name="car-outline" size={12} color={t.textMuted} />
                      <Text style={[s.detailText, { color: t.textMuted }]}>{unit.call_sign ?? unit.plate_number}</Text>
                    </View>
                  )}
                  {r.pickup_address && (
                    <View style={s.detailRow}>
                      <Ionicons name="location-outline" size={12} color={t.textMuted} />
                      <Text style={[s.detailText, { color: t.textMuted }]} numberOfLines={1}>{r.pickup_address}</Text>
                    </View>
                  )}
                  {r.contact_phone && (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${r.contact_phone}`)} style={s.detailRow}>
                      <Ionicons name="call-outline" size={12} color={t.accent} />
                      <Text style={[s.detailText, { color: t.accent }]}>{r.contact_phone}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                  </View>
                </View>
              </Glass>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:     { flex: 1 },
  title:    { fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 15, marginTop: 2, marginBottom: 16 },
  statGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tabRow:   { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 14, gap: 3 },
  tabBtn:   { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  card:     { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bookingRef: { fontSize: 13 },
  name:       { fontSize: 17, fontWeight: '700' },
  statusLine: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2, marginBottom: 4 },
  detailText: { fontSize: 14 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  emptyBox:   { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 32, alignItems: 'center' },
  emptyText:  { fontSize: 15 },
})
