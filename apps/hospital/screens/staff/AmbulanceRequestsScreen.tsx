import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'

interface TransportRequest {
  id: string
  booking_ref: string
  status: string
  triage_level: number | null
  symptom_description: string | null
  eta_seconds: number | null
  pickup_address: string | null
  contact_phone: string
  caller_patient_name: string | null
  patient: { full_name: string } | null
  dependent: { full_name: string } | null
  unit: { plate_number: string; call_sign: string | null; vehicle_tier: string; provider: { name: string } | null } | null
}

interface Props { navigation: any }

// One theme token trio per status bucket -- mirrors web's AmbulancesList.tsx
// STATUS_KEY groups (amber/blue/accent/red/muted) but reuses the app's existing,
// already-AA-verified statusX tokens instead of the web's `${C.color}1a` hex-alpha
// trick, which only works with a plain 6-digit hex and these theme trios already
// carry their own tuned bg/border at the right opacity per palette.
function statusTrio(t: any, status: string) {
  const AMBER = ['requested', 'scheduled', 'searching']
  const BLUE  = ['matched', 'en_route_to_patient', 'on_scene']
  const GOOD  = ['transporting', 'arrived_at_destination']
  const RED   = ['cancelled_by_requester', 'cancelled_by_provider', 'no_unit_available']
  if (AMBER.includes(status)) return t.statusBusy
  if (BLUE.includes(status)) return t.statusVirtual
  if (GOOD.includes(status)) return t.statusOpen
  if (RED.includes(status)) return t.statusCancelled
  return t.statusNeutral // completed, anything unrecognized
}

const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested', scheduled: 'Scheduled', searching: 'Finding ambulance',
  matched: 'Crew assigned', en_route_to_patient: 'En route to patient', on_scene: 'Crew on scene',
  transporting: 'Transporting', arrived_at_destination: 'Arrived', completed: 'Completed',
  cancelled_by_requester: 'Cancelled by patient', cancelled_by_provider: 'Cancelled by provider',
  no_unit_available: 'No unit available',
}

const ACTIVE_STATUSES = ['requested', 'scheduled', 'searching', 'matched', 'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination']

function formatEta(seconds: number | null): string {
  if (seconds == null) return '—'
  const mins = Math.round(seconds / 60)
  return mins <= 1 ? 'Arriving now' : `~${mins} min`
}

function safeName(name: string | null | undefined): string {
  return name && name.trim() ? name : 'Unregistered caller'
}

export function AmbulanceRequestsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [requests, setRequests] = useState<TransportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const isAdmin = staffProfile?.role === 'hospital_admin'
  const hospitalId = staffProfile?.hospitalId

  const load = useCallback(async () => {
    if (!hospitalId) return
    const { data } = await supabase
      .from('transport_requests')
      .select(`
        id, booking_ref, status, triage_level, symptom_description,
        eta_seconds, pickup_address, contact_phone, caller_patient_name,
        patient:users!transport_requests_patient_id_fkey(full_name),
        dependent:dependents(full_name),
        unit:ambulances(plate_number, call_sign, vehicle_tier, provider:ambulance_providers(name))
      `)
      .eq('destination_hospital_id', hospitalId)
      .order('created_at', { ascending: false })
      .limit(50)
    setRequests((data as any) ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useFocusEffect(useCallback(() => {
    if (!hospitalId) return
    const channel = supabase
      .channel(`hospital-ambulances:${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `destination_hospital_id=eq.${hospitalId}` },
        () => load())
      .subscribe()
    const fallback = setInterval(load, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(fallback) }
  }, [hospitalId, load]))

  const active = requests.filter(r => ACTIVE_STATUSES.includes(r.status))
  const history = requests.filter(r => !ACTIVE_STATUSES.includes(r.status))

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>Ambulances</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={st.linkRow}>
        <TouchableOpacity onPress={() => navigation.navigate('AmbulanceAlerts')}
          style={[st.linkBtn, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[st.linkText, { color: t.textPrimary }]}>Alerts</Text>
        </TouchableOpacity>
        {isAdmin && (
          <>
            <TouchableOpacity onPress={() => navigation.navigate('AmbulanceCoverage')}
              style={[st.linkBtn, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.linkText, { color: t.textPrimary }]}>Coverage</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('AmbulanceFleet')}
              style={[st.linkBtn, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.linkText, { color: t.textPrimary }]}>Manage Fleet</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={t.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {!active.length ? (
            <View style={[st.empty, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Ionicons name="medical-outline" size={32} color={t.textMuted} />
              <Text style={[st.emptyText, { color: t.textSecondary }]}>No ambulances inbound right now</Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginBottom: active.length ? 24 : 0 }}>
              {active.map(r => {
                const name = safeName(r.patient?.full_name ?? r.dependent?.full_name ?? r.caller_patient_name)
                const isCritical = (r.triage_level ?? 5) <= 2
                const sc = statusTrio(t, r.status)
                return (
                  <View key={r.id} style={[st.card, {
                    borderColor: isCritical ? t.dangerBorder : t.cardBorder,
                    backgroundColor: isCritical ? t.dangerSubtle : t.cardBg,
                  }]}>
                    <View style={st.cardTop}>
                      <View style={{ flex: 1 }}>
                        <View style={st.nameRow}>
                          <Text style={[st.name, { color: t.textPrimary }]}>{name}</Text>
                          {r.triage_level != null && (
                            <View style={[st.badge, { borderColor: r.triage_level <= 2 ? t.dangerBorder : t.statusBusy.border, backgroundColor: r.triage_level <= 2 ? t.dangerSubtle : t.statusBusy.bg }]}>
                              <Text style={[st.badgeText, { color: r.triage_level <= 2 ? t.danger : t.statusBusy.text }]}>Triage {r.triage_level}</Text>
                            </View>
                          )}
                          {isCritical && (
                            <View style={[st.badge, { borderColor: t.dangerBorder, backgroundColor: t.dangerStrong }]}>
                              <Ionicons name="warning" size={10} color={t.danger} />
                              <Text style={[st.badgeText, { color: t.danger }]}>CRITICAL</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[st.symptom, { color: t.textSecondary }]}>{r.symptom_description ?? 'No condition details provided'}</Text>
                        <View style={st.metaRow}>
                          {!!r.contact_phone && (
                            <View style={st.metaItem}><Ionicons name="call-outline" size={11} color={t.textMuted} /><Text style={[st.metaText, { color: t.textMuted }]}>{r.contact_phone}</Text></View>
                          )}
                          <View style={st.metaItem}><Ionicons name="time-outline" size={11} color={t.textMuted} /><Text style={[st.metaText, { color: t.textMuted }]}>ETA {formatEta(r.eta_seconds)}</Text></View>
                        </View>
                        {!!r.pickup_address && (
                          <View style={st.metaItem}><Ionicons name="location-outline" size={11} color={t.textMuted} /><Text style={[st.metaText, { color: t.textMuted }]} numberOfLines={1}>{r.pickup_address}</Text></View>
                        )}
                        {!!r.unit && (
                          <Text style={[st.unitText, { color: t.textMuted }]}>
                            {r.unit.provider?.name ?? 'Ambulance'} · {r.unit.call_sign ?? r.unit.plate_number} · {r.unit.vehicle_tier}
                          </Text>
                        )}
                      </View>
                      <View style={[st.statusBadge, { borderColor: sc.border, backgroundColor: sc.bg }]}>
                        <Text style={[st.statusText, { color: sc.text }]}>{STATUS_LABEL[r.status] ?? r.status}</Text>
                      </View>
                    </View>
                    <Text style={[st.ref, { color: t.textMuted }]}>{r.booking_ref}</Text>
                  </View>
                )
              })}
            </View>
          )}

          {!!history.length && (
            <>
              <Text style={[st.sectionLabel, { color: t.textSecondary }]}>RECENT HISTORY</Text>
              <View style={{ gap: 8 }}>
                {history.map(r => {
                  const sc = statusTrio(t, r.status)
                  return (
                    <View key={r.id} style={[st.historyRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                      <Text style={[st.historyText, { color: t.textSecondary }]} numberOfLines={1}>{r.booking_ref} · {r.symptom_description ?? '—'}</Text>
                      <View style={[st.statusBadge, { borderColor: sc.border, backgroundColor: sc.bg }]}>
                        <Text style={[st.statusText, { color: sc.text }]}>{STATUS_LABEL[r.status] ?? r.status}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  linkRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, flexWrap: 'wrap' },
  linkBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  linkText: { fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 48, borderRadius: 16, borderWidth: 1, gap: 10 },
  emptyText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  symptom: { fontSize: 12, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 11, flexShrink: 1 },
  unitText: { fontSize: 11, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },
  ref: { fontSize: 11, marginTop: 8 },
  historyRow: { borderRadius: 14, padding: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  historyText: { fontSize: 13, flex: 1 },
})
