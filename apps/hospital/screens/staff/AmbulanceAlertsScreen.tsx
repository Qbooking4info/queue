import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'

// dispatcher_alerts and dispatch_attempts (Coverage screen) have RLS enabled with
// zero policies -- unlike transport_requests, which hospital_admins/clinic_admins
// can read directly (see the RLS policy check that shaped this screen), a direct
// query here returns silently empty. Both routed through the API instead, same as
// every write this app already makes.
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface AlertRow {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  kind: string
  message: string
  created_at: string
  acknowledged_at: string | null
  request: {
    id: string; booking_ref: string; triage_level: number | null
    symptom_description: string | null; pickup_address: string | null
    contact_phone: string; caller_patient_name: string | null; failure_reason: string | null
  } | null
  ack: { full_name: string } | null
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const
const KIND_LABEL: Record<string, string> = { no_unit_available: 'No ambulance found', tracking_stale: 'Crew position went stale' }

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

interface Props { navigation: any }

export function AmbulanceAlertsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const severityTrio = (s: AlertRow['severity']) =>
    s === 'critical' ? { text: t.danger, bg: t.dangerSubtle, border: t.dangerBorder }
    : s === 'high'   ? t.statusProgress
    : s === 'medium' ? t.statusBusy
    : { text: t.textMuted, bg: t.statusNeutral.bg, border: t.statusNeutral.border }

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) return
      const res = await fetch(`${API_URL}/api/ambulances/alerts`, { headers: { Authorization: `Bearer ${jwt}` } })
      const body = await res.json()
      if (res.ok) setAlerts(body.alerts ?? [])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function acknowledge(id: string) {
    setBusyId(id)
    haptics.tap()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      const res = await fetch(`${API_URL}/api/ambulances/alerts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ alertId: id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        Alert.alert('Could not acknowledge', body?.error ?? 'Try again.')
        return
      }
      await load()
    } catch {
      Alert.alert('Could not acknowledge', 'Check your connection and try again.')
    } finally {
      setBusyId(null)
    }
  }

  const sorted = [...alerts].sort((a, b) => {
    const ackA = a.acknowledged_at ? 1 : 0, ackB = b.acknowledged_at ? 1 : 0
    if (ackA !== ackB) return ackA - ackB
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  const openCritical = sorted.filter(a => !a.acknowledged_at && a.severity === 'critical').length

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>Dispatcher Alerts</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={[st.subtitle, { color: t.textSecondary }]}>Raised when a search finds no ambulance, or an assigned crew stops reporting its position.</Text>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={t.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {openCritical > 0 && (
            <View style={[st.criticalBanner, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
              <Ionicons name="warning" size={16} color={t.danger} />
              <Text style={[st.criticalText, { color: t.danger }]}>
                {openCritical} unacknowledged critical {openCritical === 1 ? 'alert' : 'alerts'} — a high-acuity request went unserved
              </Text>
            </View>
          )}

          {!sorted.length ? (
            <View style={[st.empty, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.emptyText, { color: t.textMuted }]}>No alerts. Every transport request so far has found a unit.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {sorted.map(a => {
                const sc = severityTrio(a.severity)
                const done = !!a.acknowledged_at
                return (
                  <View key={a.id} style={[st.card, { backgroundColor: t.cardBg, borderColor: done ? t.cardBorder : sc.border, borderLeftColor: done ? t.cardBorder : sc.text, opacity: done ? 0.65 : 1 }]}>
                    <View style={st.cardHeadRow}>
                      <View style={[st.sevBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                        <Text style={[st.sevText, { color: sc.text }]}>{a.severity.toUpperCase()}</Text>
                      </View>
                      <Text style={[st.kind, { color: t.textPrimary }]}>{KIND_LABEL[a.kind] ?? a.kind}</Text>
                      {a.request?.triage_level != null && <Text style={[st.meta, { color: t.textSecondary }]}>Triage {a.request.triage_level}</Text>}
                      <Text style={[st.meta, { color: t.textMuted }]}>· {ago(a.created_at)}</Text>
                    </View>

                    <Text style={[st.message, { color: t.textSecondary }]}>{a.message}</Text>

                    {!!a.request && (
                      <View style={st.reqRow}>
                        <Text style={[st.reqRef, { color: t.textPrimary }]}>{a.request.booking_ref}</Text>
                        {!!a.request.caller_patient_name && <Text style={[st.reqMeta, { color: t.textSecondary }]}>{a.request.caller_patient_name}</Text>}
                        {!!a.request.pickup_address && (
                          <View style={st.metaItem}><Ionicons name="location-outline" size={11} color={t.textSecondary} /><Text style={[st.reqMeta, { color: t.textSecondary }]} numberOfLines={1}>{a.request.pickup_address}</Text></View>
                        )}
                        {!!a.request.contact_phone && (
                          <TouchableOpacity onPress={() => Linking.openURL(`tel:${a.request!.contact_phone}`)} style={st.metaItem}>
                            <Ionicons name="call-outline" size={11} color={t.textPrimary} />
                            <Text style={[st.reqMeta, { color: t.textPrimary, fontWeight: '700' }]}>{a.request.contact_phone}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {done ? (
                      <Text style={[st.ackText, { color: t.textMuted }]}>
                        Acknowledged{a.ack?.full_name ? ` by ${a.ack.full_name}` : ''} · {ago(a.acknowledged_at!)}
                      </Text>
                    ) : (
                      <TouchableOpacity onPress={() => acknowledge(a.id)} disabled={busyId === a.id}
                        style={[st.ackBtn, { borderColor: t.cardBorder }]}>
                        {busyId === a.id ? <ActivityIndicator size="small" color={t.textPrimary} /> : (
                          <><Ionicons name="checkmark" size={14} color={t.textPrimary} /><Text style={[st.ackBtnText, { color: t.textPrimary }]}>Acknowledge</Text></>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, paddingHorizontal: 20, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  criticalBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 16 },
  criticalText: { fontSize: 13, fontWeight: '700', flex: 1 },
  empty: { padding: 40, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center' },
  card: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 3, padding: 14 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sevBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  sevText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  kind: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 11 },
  message: { fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  reqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  reqRef: { fontSize: 12, fontWeight: '700' },
  reqMeta: { fontSize: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ackText: { fontSize: 11, marginTop: 8 },
  ackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 8, marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 14 },
  ackBtnText: { fontSize: 12, fontWeight: '700' },
})
