import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme }  from '../../contexts/ThemeContext'
import { useAuth }   from '../../contexts/AuthContext'
import { supabase }  from '../../lib/supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Range = 'today' | 'week' | 'month' | 'year'

interface Stats { total: number; completed: number; cancelled: number; pending: number }
interface SpecialtyRow { name: string; count: number; pct: number }

const SPEC_COLORS = ['#00E87A','#5B9EFF','#A78BFA','#EF9F27','#FF8C42']

export function StaffAnalyticsScreen() {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()

  const [range,      setRange]      = useState<Range>('month')
  const [stats,      setStats]      = useState<Stats>({ total: 0, completed: 0, cancelled: 0, pending: 0 })
  const [specialty,  setSpecialty]  = useState<SpecialtyRow[]>([])
  const [inperson,   setInperson]   = useState(0)
  const [virtual,    setVirtual]    = useState(0)
  const [ytdMonths,  setYtdMonths]  = useState<string[]>([])
  const [ytdCounts,  setYtdCounts]  = useState<number[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const hospitalId = staffProfile?.hospitalId

  function getBounds(r: Range): { from: string; to: string } {
    const now = new Date()
    const pad  = (n: number) => String(n).padStart(2, '0')
    const fmt  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const today = fmt(now)
    if (r === 'today') return { from: today, to: today }
    if (r === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { from: fmt(d), to: today }
    }
    if (r === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmt(d), to: today }
    }
    return { from: `${now.getFullYear()}-01-01`, to: today }
  }

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)
    const { from, to } = getBounds(range)
    const year = new Date().getFullYear()
    const ytdTo = new Date().toISOString().split('T')[0]

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {}

      const [statsRes, apptsRes, ytdRes] = await Promise.all([
        fetch(`${API_URL}/api/appointments/stats?from=${from}&to=${to}`, { headers }),
        fetch(`${API_URL}/api/appointments?from=${from}&to=${to}`, { headers }),
        fetch(`${API_URL}/api/appointments?from=${year}-01-01&to=${ytdTo}`, { headers }),
      ])

      if (statsRes.ok) setStats(await statsRes.json())

      if (apptsRes.ok) {
        const { appointments = [] } = await apptsRes.json()
        // specialty breakdown
        const counts: Record<string, number> = {}
        let ip = 0, vt = 0
        appointments.forEach((a: any) => {
          const name = a.specialty_name ?? 'General'
          counts[name] = (counts[name] ?? 0) + 1
          if (a.type === 'virtual') vt++; else ip++
        })
        const total = appointments.length || 1
        setSpecialty(
          Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }))
        )
        setInperson(ip); setVirtual(vt)
      }

      if (ytdRes.ok) {
        const { appointments: ytd = [] } = await ytdRes.json()
        const cur = new Date().getMonth()
        const counts2 = Array(cur + 1).fill(0)
        ytd.forEach((a: any) => {
          const m = new Date(a.appointment_date).getMonth()
          if (m <= cur) counts2[m]++
        })
        setYtdMonths(MONTH_NAMES.slice(0, cur + 1))
        setYtdCounts(counts2)
      }
    } catch { /* silent */ }

    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, range])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const showUp = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0
  const total  = inperson + virtual || 1

  const RANGES: { key: Range; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: '7 days' },
    { key: 'month', label: 'Month' },
    { key: 'year',  label: 'Year' },
  ]

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: t.textPrimary }]}>Analytics</Text>
      </View>

      {/* Range selector */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 16 }}>
        {RANGES.map(r => (
          <TouchableOpacity key={r.key} onPress={() => setRange(r.key)}
            style={[s.rangeBtn, { borderColor: range === r.key ? t.accent : t.cardBorder, backgroundColor: range === r.key ? `${t.accent}18` : t.cardBg }]}>
            <Text style={[s.rangeBtnText, { color: range === r.key ? t.accent : t.textMuted }]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {/* KPI grid */}
          <View style={s.kpiGrid}>
            {[
              { label: 'Total',      value: stats.total,     color: t.accent },
              { label: 'Completed',  value: stats.completed, color: '#00C265' },
              { label: 'Cancelled',  value: stats.cancelled, color: '#FF5C5C' },
              { label: 'Show-up %', value: `${showUp}%`,    color: '#5B9EFF' },
            ].map(k => (
              <View key={k.label} style={[s.kpiCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.kpiValue, { color: k.color }]}>{k.value}</Text>
                <Text style={[s.kpiLabel, { color: t.textMuted }]}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Visit type split */}
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginBottom: 12 }]}>
            <Text style={[s.cardTitle, { color: t.textPrimary }]}>Visit Type Split</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'In-person', count: inperson, color: t.accent },
                { label: 'Virtual',   count: virtual,  color: '#5B9EFF' },
              ].map(tp => (
                <View key={tp.label} style={[s.typeCard, { backgroundColor: `${tp.color}12`, flex: 1 }]}>
                  <Text style={[s.typeCount, { color: tp.color }]}>{tp.count}</Text>
                  <Text style={[s.typeLabel, { color: t.textMuted }]}>{tp.label}</Text>
                  <Text style={[s.typePct, { color: t.textMuted }]}>{Math.round(tp.count / total * 100)}%</Text>
                </View>
              ))}
            </View>
            <View style={{ height: 8, borderRadius: 99, overflow: 'hidden', flexDirection: 'row' }}>
              <View style={{ width: `${Math.round(inperson / total * 100)}%`, backgroundColor: t.accent }} />
              <View style={{ flex: 1, backgroundColor: '#5B9EFF' }} />
            </View>
          </View>

          {/* Top specialties */}
          {specialty.length > 0 && (
            <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginBottom: 12 }]}>
              <Text style={[s.cardTitle, { color: t.textPrimary }]}>Top Specialties</Text>
              <View style={{ gap: 10 }}>
                {specialty.map((sp, i) => (
                  <View key={sp.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[s.specName, { color: t.textMuted }]} numberOfLines={1}>{sp.name}</Text>
                    <View style={{ flex: 1, height: 8, backgroundColor: `${t.cardBorder}`, borderRadius: 99, overflow: 'hidden' }}>
                      <View style={{ width: `${sp.pct}%`, height: '100%', backgroundColor: SPEC_COLORS[i] ?? t.accent, borderRadius: 99 }} />
                    </View>
                    <Text style={[s.specPct, { color: t.textPrimary }]}>{sp.pct}%</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Monthly bookings YTD bar chart */}
          {ytdMonths.length > 0 && (
            <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[s.cardTitle, { color: t.textPrimary }]}>Monthly Bookings (YTD)</Text>
              {(() => {
                const maxV = Math.max(...ytdCounts, 1)
                const barMaxH = 100
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130, marginTop: 8 }}>
                    {ytdMonths.map((m, i) => {
                      const h = Math.max((ytdCounts[i] / maxV) * barMaxH, 4)
                      const isLast = i === ytdMonths.length - 1
                      return (
                        <View key={m} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                          <Text style={[s.barVal, { color: t.textMuted }]}>{ytdCounts[i]}</Text>
                          <View style={{ width: '100%', height: h, borderRadius: 4, backgroundColor: isLast ? t.accent : `${t.accent}60` }} />
                          <Text style={[s.barLabel, { color: t.textMuted }]}>{m}</Text>
                        </View>
                      )
                    })}
                  </View>
                )
              })()}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  title:       { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  rangeBtn:    { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  rangeBtnText: { fontSize: 12, fontWeight: '700' },
  kpiGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpiCard:     { flexBasis: '47%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 14 },
  kpiValue:    { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel:    { fontSize: 11, marginTop: 3 },
  card:        { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle:   { fontSize: 14, fontWeight: '700', marginBottom: 14 },
  typeCard:    { borderRadius: 12, padding: 14 },
  typeCount:   { fontSize: 24, fontWeight: '800' },
  typeLabel:   { fontSize: 11, marginTop: 2 },
  typePct:     { fontSize: 11 },
  specName:    { width: 90, fontSize: 12, fontWeight: '500' },
  specPct:     { width: 30, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  barVal:      { fontSize: 9, fontWeight: '700' },
  barLabel:    { fontSize: 9 },
})
