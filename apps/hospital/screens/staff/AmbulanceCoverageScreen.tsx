import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Attempt {
  id: string; round: number; radius_m: number
  candidates_found: number; candidates_after_filter: number
  reject_reasons: Record<string, number> | null
  offers_made: number; nearest_unit_m: number | null
  active_units_total: number | null; on_duty_units_total: number | null
  created_at: string
  request: { id: string; booking_ref: string; triage_level: number | null; pickup_address: string | null } | null
}

const REASON_LABEL: Record<string, string> = {
  tier_too_low: 'Crew/vehicle tier below what the call required',
  missing_capability: 'Missing required equipment',
  shift_too_short: 'Could not finish the job inside the shift',
  no_eta: 'No usable position for the unit',
}

const km = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`

interface Props { navigation: any }

export function AmbulanceCoverageScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) return
      const res = await fetch(`${API_URL}/api/ambulances/coverage`, { headers: { Authorization: `Bearer ${jwt}` } })
      const body = await res.json()
      if (res.ok) { setAttempts(body.attempts ?? []); setDays(body.days ?? 30) }
    } catch {
      /* silent -- a failed background load leaves the last-known state on screen */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const unserved = attempts.filter(a => a.candidates_after_filter === 0)
  const nearestVals = unserved.map(a => a.nearest_unit_m).filter((n): n is number => n != null)
  const avgNearest = nearestVals.length ? nearestVals.reduce((s, n) => s + n, 0) / nearestVals.length : null
  const minNearest = nearestVals.length ? Math.min(...nearestVals) : null
  const noneInRange = unserved.filter(a => a.candidates_found === 0).length
  const allFiltered = unserved.filter(a => a.candidates_found > 0).length

  const reasonTally: Record<string, number> = {}
  for (const a of attempts) for (const [k, v] of Object.entries(a.reject_reasons ?? {})) reasonTally[k] = (reasonTally[k] ?? 0) + (typeof v === 'number' ? v : 0)

  const dutySamples = attempts.map(a => a.on_duty_units_total).filter((n): n is number => n != null)
  const avgOnDuty = dutySamples.length ? dutySamples.reduce((s, n) => s + n, 0) / dutySamples.length : null
  const activeTotal = attempts.find(a => a.active_units_total != null)?.active_units_total ?? null

  let diagnosis = ''
  if (attempts.length === 0) diagnosis = 'No dispatch rounds recorded yet — nothing to diagnose.'
  else if (unserved.length === 0) diagnosis = 'Every dispatch round found at least one usable unit.'
  else if (avgOnDuty !== null && avgOnDuty < 0.5 && activeTotal != null && activeTotal > 0)
    diagnosis = `Adoption gap: ${activeTotal} unit(s) registered but almost none on duty when calls came in. The fleet exists; it is not signed on.`
  else if (avgNearest !== null && avgNearest > 10000)
    diagnosis = `Coverage gap: when a call went unserved, the nearest unit averaged ${km(avgNearest)} away. You need supply closer to these pickups.`
  else if (allFiltered > noneInRange)
    diagnosis = 'Capacity/clinical gap: units were in range but none were usable — see the rejection reasons below.'
  else diagnosis = 'Coverage gap: no units were within the search radius for most failed rounds.'

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>Coverage Gaps</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={[st.subtitle, { color: t.textSecondary }]}>What dispatch actually saw over the last {days} days.</Text>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={t.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          <View style={[st.diagnosisBox, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
            <Text style={[st.diagnosisLabel, { color: t.textMuted }]}>DIAGNOSIS</Text>
            <Text style={[st.diagnosisText, { color: t.textPrimary }]}>{diagnosis}</Text>
          </View>

          <View style={st.statGrid}>
            <View style={[st.statTile, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.statLabel, { color: t.textMuted }]}>ROUNDS</Text>
              <Text style={[st.statValue, { color: t.textPrimary }]}>{attempts.length}</Text>
              <Text style={[st.statSub, { color: t.textSecondary }]}>{unserved.length} found nothing usable</Text>
            </View>
            <View style={[st.statTile, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.statLabel, { color: t.textMuted }]}>NEAREST UNIT</Text>
              <Text style={[st.statValue, { color: t.textPrimary }]}>{avgNearest !== null ? km(avgNearest) : '—'}</Text>
              <Text style={[st.statSub, { color: t.textSecondary }]}>{minNearest !== null ? `closest was ${km(minNearest)}` : 'no data'}</Text>
            </View>
            <View style={[st.statTile, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.statLabel, { color: t.textMuted }]}>AVG ON DUTY</Text>
              <Text style={[st.statValue, { color: t.textPrimary }]}>{avgOnDuty !== null ? avgOnDuty.toFixed(1) : '—'}</Text>
              {activeTotal !== null && <Text style={[st.statSub, { color: t.textSecondary }]}>of {activeTotal} registered</Text>}
            </View>
            <View style={[st.statTile, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.statLabel, { color: t.textMuted }]}>OFFERS MADE</Text>
              <Text style={[st.statValue, { color: t.textPrimary }]}>{attempts.reduce((s, a) => s + a.offers_made, 0)}</Text>
              <Text style={[st.statSub, { color: t.textSecondary }]}>across all rounds</Text>
            </View>
          </View>

          {unserved.length > 0 && (
            <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.sectionTitle, { color: t.textPrimary }]}>Why rounds failed</Text>
              <View style={st.failRow}>
                <View style={st.failItem}><Ionicons name="location-outline" size={14} color={t.textSecondary} /><Text style={[st.failText, { color: t.textSecondary }]}><Text style={{ fontWeight: '800', color: t.textPrimary }}>{noneInRange}</Text> had no unit in radius</Text></View>
                <View style={st.failItem}><Ionicons name="people-outline" size={14} color={t.textSecondary} /><Text style={[st.failText, { color: t.textSecondary }]}><Text style={{ fontWeight: '800', color: t.textPrimary }}>{allFiltered}</Text> had units nearby but unusable</Text></View>
              </View>
              {Object.keys(reasonTally).length > 0 && (
                <View style={[st.reasonList, { borderTopColor: t.cardBorder }]}>
                  {Object.entries(reasonTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <View key={k} style={st.reasonRow}>
                      <Text style={[st.reasonLabel, { color: t.textSecondary }]}>{REASON_LABEL[k] ?? k}</Text>
                      <Text style={[st.reasonValue, { color: t.textPrimary }]}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder, padding: 0, overflow: 'hidden' }]}>
            <Text style={[st.sectionTitle, { color: t.textPrimary, padding: 16, paddingBottom: 12, marginBottom: 0, borderBottomWidth: 1, borderBottomColor: t.cardBorder }]}>
              Unserved rounds{unserved.length > 0 ? ' · newest first' : ''}
            </Text>
            {unserved.length === 0 ? (
              <Text style={[st.emptyText, { color: t.textMuted }]}>
                {attempts.length === 0 ? 'No dispatch rounds recorded in this window.' : 'Nothing here — every round found a usable unit.'}
              </Text>
            ) : (
              unserved.slice(0, 40).map(a => (
                <View key={a.id} style={[st.roundRow, { borderBottomColor: t.cardBorder }]}>
                  <View style={st.roundTop}>
                    <Text style={[st.roundRef, { color: t.textPrimary }]}>{a.request?.booking_ref ?? '—'}</Text>
                    {a.request?.triage_level != null && <Text style={[st.roundMeta, { color: t.textSecondary }]}>Triage {a.request.triage_level}</Text>}
                  </View>
                  <Text style={[st.roundMeta, { color: t.textSecondary }]}>round {a.round} · {km(a.radius_m)} radius · {a.on_duty_units_total ?? 0} on duty</Text>
                  <View style={st.metaItem}>
                    <Ionicons name="radio-outline" size={12} color={a.nearest_unit_m != null && a.nearest_unit_m > 10000 ? t.statusProgress.text : t.textSecondary} />
                    <Text style={[st.roundMeta, { color: a.nearest_unit_m != null && a.nearest_unit_m > 10000 ? t.statusProgress.text : t.textSecondary }]}>
                      nearest {a.nearest_unit_m != null ? km(a.nearest_unit_m) : 'unknown'}
                    </Text>
                  </View>
                  {!!a.request?.pickup_address && <Text style={[st.roundAddr, { color: t.textMuted }]} numberOfLines={1}>{a.request.pickup_address}</Text>}
                </View>
              ))
            )}
          </View>
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
  diagnosisBox: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  diagnosisLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  diagnosisText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statTile: { flexBasis: '47%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 14 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  statSub: { fontSize: 11, marginTop: 3 },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  failRow: { gap: 8, marginBottom: 4 },
  failItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  failText: { fontSize: 13 },
  reasonList: { borderTopWidth: 1, marginTop: 10, paddingTop: 10, gap: 4 },
  reasonRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  reasonLabel: { fontSize: 12, flex: 1 },
  reasonValue: { fontSize: 12, fontWeight: '800' },
  emptyText: { padding: 32, textAlign: 'center', fontSize: 13 },
  roundRow: { padding: 14, borderBottomWidth: 1, gap: 3 },
  roundTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundRef: { fontSize: 13, fontWeight: '700' },
  roundMeta: { fontSize: 11.5 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roundAddr: { fontSize: 11.5, marginTop: 2 },
})
