import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
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

function triageColor(level: number | null): string {
  if (level == null) return '#7A9089'
  if (level <= 2) return '#FF5C5C'
  if (level === 3) return '#FFB547'
  return '#7A9089'
}

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

  const stats = [
    { label: 'Active calls',  value: String(active.length) },
    { label: 'Units ready',   value: `${unitsAvailable}/${units.length}` },
    { label: 'Avg response',  value: avgResponseMin != null ? `${avgResponseMin}m` : '—' },
    { label: 'Calls today',   value: String(todayRequests.length) },
  ]

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
          {stats.map(st => (
            <View key={st.label} style={[s.statCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[s.statValue, { color: t.textPrimary }]}>{st.value}</Text>
              <Text style={[s.statLabel, { color: t.textMuted }]}>{st.label}</Text>
            </View>
          ))}
        </View>

        <View style={[s.tabRow, { borderColor: t.cardBorder }]}>
          {(['active', 'history'] as const).map(k => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.tabBtn, tab === k && { backgroundColor: t.accentBgMid }]}>
              <Text style={{ color: tab === k ? t.accent : t.textMuted, fontSize: 13, fontWeight: '700' }}>
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
              <View key={r.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={s.row}>
                  <View style={[s.triageBadge, { backgroundColor: `${triageColor(r.triage_level)}18`, borderColor: `${triageColor(r.triage_level)}40` }]}>
                    <Text style={[s.triageBadgeText, { color: triageColor(r.triage_level) }]}>
                      {r.triage_level ? `Triage ${r.triage_level}` : r.request_type === 'scheduled' ? 'Scheduled' : '—'}
                    </Text>
                  </View>
                  <Text style={[s.bookingRef, { color: t.textMuted }]}>{r.booking_ref}</Text>
                </View>
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
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:     { flex: 1 },
  title:    { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2, marginBottom: 16 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  statCard: { flexGrow: 1, flexBasis: '46%', borderRadius: 16, borderWidth: 1, padding: 14 },
  statValue:{ fontSize: 20, fontWeight: '800' },
  statLabel:{ fontSize: 11, marginTop: 2 },
  tabRow:   { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 14, gap: 3 },
  tabBtn:   { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  card:     { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  triageBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  triageBadgeText: { fontSize: 11, fontWeight: '800' },
  bookingRef: { fontSize: 11 },
  name:       { fontSize: 15, fontWeight: '700' },
  statusLine: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2, marginBottom: 4 },
  detailText: { fontSize: 12 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  emptyBox:   { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 32, alignItems: 'center' },
  emptyText:  { fontSize: 13 },
})
