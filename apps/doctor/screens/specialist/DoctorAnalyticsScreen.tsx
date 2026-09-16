import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtLocalDate, fmtDate, todayLocalDate } from '@queue/shared/lib/format'
import { getMyDoctorAnalytics, type DoctorAnalyticsStats } from '@queue/shared/lib/api'
import { CalendarPicker } from '@queue/shared/components/CalendarPicker'

type PeriodMode = 'today' | 'week' | 'month' | 'year' | 'date' | 'pickedMonth'
type VisitType = 'all' | 'in-person' | 'virtual' | 'home_visit'

const EMPTY_STATS: DoctorAnalyticsStats = {
  total: 0, completed: 0, cancelled: 0, noShow: 0, open: 0, uniquePatients: 0,
  byType: { inPerson: 0, virtual: 0, homeVisit: 0 },
  avgWaitMinutes: null, avgConsultMinutes: null,
  rating: { avg: null, count: 0 }, monthly: [],
}

function fmtMinutes(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props { navigation: { goBack: () => void; canGoBack?: () => boolean } }

export function DoctorAnalyticsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()

  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [pickedDate, setPickedDate] = useState<string>(todayLocalDate())
  const [pickedMonth, setPickedMonth] = useState<Date>(new Date())
  const [visitType, setVisitType] = useState<VisitType>('all')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)

  const [stats, setStats] = useState<DoctorAnalyticsStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  function getBounds(): { from: string; to: string } {
    const now = new Date()
    const today = fmtLocalDate(now)
    if (periodMode === 'today') return { from: today, to: today }
    if (periodMode === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { from: fmtLocalDate(d), to: today }
    }
    if (periodMode === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmtLocalDate(d), to: today }
    }
    if (periodMode === 'year') return { from: `${now.getFullYear()}-01-01`, to: today }
    if (periodMode === 'date') return { from: pickedDate, to: pickedDate }
    // pickedMonth -- the full calendar month, past or future, not capped at today
    const start = new Date(pickedMonth.getFullYear(), pickedMonth.getMonth(), 1)
    const end   = new Date(pickedMonth.getFullYear(), pickedMonth.getMonth() + 1, 0)
    return { from: fmtLocalDate(start), to: fmtLocalDate(end) }
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    const { from, to } = getBounds()
    const type = visitType === 'all' ? undefined : visitType
    const res = await getMyDoctorAnalytics(from, to, type)
    if (res.ok) setStats(res.data)
    else setError(res.error)
    setLoading(false)
    setRefreshing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMode, pickedDate, pickedMonth, visitType])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const showUp = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0
  const typeTotal = stats.byType.inPerson + stats.byType.virtual + stats.byType.homeVisit || 1

  const PERIODS: { key: PeriodMode; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: '7 Days' },
    { key: 'month', label: 'This Month' },
    { key: 'year',  label: 'This Year' },
  ]
  const VISIT_TYPES: { key: VisitType; label: string }[] = [
    { key: 'all',        label: 'All' },
    { key: 'in-person',  label: 'Physical' },
    { key: 'virtual',    label: 'Virtual' },
    { key: 'home_visit', label: 'Home Visit' },
  ]

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={[s.header, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        {navigation.canGoBack?.() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <Text style={[s.title, { color: t.textPrimary }]}>My Analytics</Text>
      </View>

      {/* Period filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {PERIODS.map(p => (
          <TouchableOpacity key={p.key} onPress={() => { haptics.tap(); setPeriodMode(p.key) }}
            style={[s.chip, { borderColor: periodMode === p.key ? t.accent : t.cardBorder, backgroundColor: periodMode === p.key ? `${t.accent}18` : t.cardBg }]}>
            <Text style={[s.chipText, { color: periodMode === p.key ? t.accent : t.textMuted }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => { haptics.tap(); setShowDatePicker(true) }}
          style={[s.chip, { flexDirection: 'row', alignItems: 'center', gap: 5, borderColor: periodMode === 'date' ? t.accent : t.cardBorder, backgroundColor: periodMode === 'date' ? `${t.accent}18` : t.cardBg }]}>
          <Ionicons name="calendar-outline" size={13} color={periodMode === 'date' ? t.accent : t.textMuted} />
          <Text style={[s.chipText, { color: periodMode === 'date' ? t.accent : t.textMuted }]}>
            {periodMode === 'date' ? fmtDate(pickedDate) : 'Pick Date'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptics.tap(); setShowMonthPicker(true) }}
          style={[s.chip, { flexDirection: 'row', alignItems: 'center', gap: 5, borderColor: periodMode === 'pickedMonth' ? t.accent : t.cardBorder, backgroundColor: periodMode === 'pickedMonth' ? `${t.accent}18` : t.cardBg }]}>
          <Ionicons name="calendar-clear-outline" size={13} color={periodMode === 'pickedMonth' ? t.accent : t.textMuted} />
          <Text style={[s.chipText, { color: periodMode === 'pickedMonth' ? t.accent : t.textMuted }]}>
            {periodMode === 'pickedMonth' ? `${MONTH_NAMES_FULL[pickedMonth.getMonth()].slice(0, 3)} ${pickedMonth.getFullYear()}` : 'Pick Month'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Visit type filter */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 }}>
        {VISIT_TYPES.map(vt => (
          <TouchableOpacity key={vt.key} onPress={() => { haptics.tap(); setVisitType(vt.key) }}
            style={[s.typeChip, { borderColor: visitType === vt.key ? t.info : t.cardBorder, backgroundColor: visitType === vt.key ? `${t.info}18` : t.cardBg }]}>
            <Text style={[s.chipText, { color: visitType === vt.key ? t.info : t.textMuted }]}>{vt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {error ? (
            <View style={[s.card, { backgroundColor: t.dangerSubtle, borderColor: t.danger, marginBottom: 12 }]}>
              <Text style={{ color: t.danger, fontSize: 12.5 }}>{error}</Text>
            </View>
          ) : null}

          {/* KPI grid */}
          <View style={s.kpiGrid}>
            {[
              { label: 'Total Visits', value: stats.total,       color: t.accent },
              { label: 'Completed',    value: stats.completed,   color: t.accentDark },
              { label: 'Cancelled',    value: stats.cancelled,   color: t.danger },
              { label: 'No-Show',      value: stats.noShow,      color: t.statusBusy.text },
              { label: 'Upcoming',     value: stats.open,        color: t.info },
              { label: 'Show-up %',    value: `${showUp}%`,      color: t.info },
              { label: 'Patients Seen', value: stats.uniquePatients, color: t.accent },
            ].map(k => (
              <View key={k.label} style={[s.kpiCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.kpiValue, { color: k.color }]}>{k.value}</Text>
                <Text style={[s.kpiLabel, { color: t.textMuted }]}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Wait / consult time */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={[s.typeCard, { backgroundColor: t.infoSubtle, flex: 1 }]}>
              <Text style={[s.typeCount, { color: t.info }]}>{fmtMinutes(stats.avgWaitMinutes)}</Text>
              <Text style={[s.typeLabel, { color: t.textMuted }]}>Avg Patient Wait</Text>
            </View>
            <View style={[s.typeCard, { backgroundColor: t.accentBgMid, flex: 1 }]}>
              <Text style={[s.typeCount, { color: t.accent }]}>{fmtMinutes(stats.avgConsultMinutes)}</Text>
              <Text style={[s.typeLabel, { color: t.textMuted }]}>Avg Consultation</Text>
            </View>
          </View>

          {/* Rating */}
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <View style={[s.ratingBadge, { backgroundColor: `${t.accent}18` }]}>
              <Ionicons name="star" size={20} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: t.textPrimary, marginBottom: 2 }]}>
                {stats.rating.avg != null ? stats.rating.avg.toFixed(1) : '—'} average rating
              </Text>
              <Text style={{ fontSize: 12, color: t.textMuted }}>
                {stats.rating.count} review{stats.rating.count === 1 ? '' : 's'} in this period
              </Text>
            </View>
          </View>

          {/* Visit type split -- only meaningful when not already filtered to one type */}
          {visitType === 'all' && (
            <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginBottom: 12 }]}>
              <Text style={[s.cardTitle, { color: t.textPrimary }]}>Visit Type Split</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                {[
                  { label: 'Physical',   count: stats.byType.inPerson,  color: t.accent },
                  { label: 'Virtual',    count: stats.byType.virtual,   color: t.info },
                  { label: 'Home Visit', count: stats.byType.homeVisit, color: '#FF8C42' },
                ].map(tp => (
                  <View key={tp.label} style={[s.typeCard, { backgroundColor: `${tp.color}12`, flex: 1 }]}>
                    <Text style={[s.typeCount, { color: tp.color }]}>{tp.count}</Text>
                    <Text style={[s.typeLabel, { color: t.textMuted }]} numberOfLines={1}>{tp.label}</Text>
                    <Text style={[s.typePct, { color: t.textMuted }]}>{Math.round(tp.count / typeTotal * 100)}%</Text>
                  </View>
                ))}
              </View>
              <View style={{ height: 8, borderRadius: 99, overflow: 'hidden', flexDirection: 'row' }}>
                <View style={{ width: `${Math.round(stats.byType.inPerson / typeTotal * 100)}%`, backgroundColor: t.accent }} />
                <View style={{ width: `${Math.round(stats.byType.virtual / typeTotal * 100)}%`, backgroundColor: t.info }} />
                <View style={{ flex: 1, backgroundColor: '#FF8C42' }} />
              </View>
            </View>
          )}

          {/* Monthly bookings YTD bar chart */}
          {stats.monthly.length > 0 && (
            <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[s.cardTitle, { color: t.textPrimary }]}>Monthly Visits (YTD)</Text>
              {(() => {
                const maxV = Math.max(...stats.monthly.map(m => m.count), 1)
                const barMaxH = 100
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130, marginTop: 8 }}>
                    {stats.monthly.map((m, i) => {
                      const h = Math.max((m.count / maxV) * barMaxH, 4)
                      const isLast = i === stats.monthly.length - 1
                      return (
                        <View key={m.month} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                          <Text style={[s.barVal, { color: t.textMuted }]}>{m.count}</Text>
                          <View style={{ width: '100%', height: h, borderRadius: 4, backgroundColor: isLast ? t.accent : `${t.accent}60` }} />
                          <Text style={[s.barLabel, { color: t.textMuted }]}>{m.month}</Text>
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

      {showDatePicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={s.overlay}>
            <View style={[s.pickerCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[s.title, { color: t.textPrimary, fontSize: 17, marginBottom: 14 }]}>Pick a Date</Text>
              <CalendarPicker value={pickedDate} onChange={setPickedDate} maxDate={todayLocalDate()} theme={t} />
              <View style={s.pickerBtnRow}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={[s.pickerBtn, { borderColor: t.cardBorder }]}>
                  <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPeriodMode('date'); setShowDatePicker(false) }}
                  style={[s.pickerBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
                  <Text style={{ color: t.accent, fontWeight: '800', fontSize: 14 }}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {showMonthPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
          <View style={s.overlay}>
            <View style={[s.pickerCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[s.title, { color: t.textPrimary, fontSize: 17, marginBottom: 16 }]}>Pick a Month</Text>
              <View style={s.monthStepper}>
                <TouchableOpacity onPress={() => { haptics.tap(); setPickedMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }} hitSlop={10}>
                  <Ionicons name="chevron-back" size={20} color={t.textPrimary} />
                </TouchableOpacity>
                <Text style={[s.monthStepperLabel, { color: t.textPrimary }]}>
                  {MONTH_NAMES_FULL[pickedMonth.getMonth()]} {pickedMonth.getFullYear()}
                </Text>
                <TouchableOpacity onPress={() => { haptics.tap(); setPickedMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }} hitSlop={10}>
                  <Ionicons name="chevron-forward" size={20} color={t.textPrimary} />
                </TouchableOpacity>
              </View>
              <View style={s.pickerBtnRow}>
                <TouchableOpacity onPress={() => setShowMonthPicker(false)} style={[s.pickerBtn, { borderColor: t.cardBorder }]}>
                  <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPeriodMode('pickedMonth'); setShowMonthPicker(false) }}
                  style={[s.pickerBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
                  <Text style={{ color: t.accent, fontWeight: '800', fontSize: 14 }}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  title:       { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipText:    { fontSize: 12, fontWeight: '700' },
  typeChip:    { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  kpiGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpiCard:     { flexBasis: '31%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 12 },
  kpiValue:    { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  kpiLabel:    { fontSize: 10.5, marginTop: 3 },
  card:        { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle:   { fontSize: 14, fontWeight: '700' },
  typeCard:    { borderRadius: 12, padding: 14 },
  typeCount:   { fontSize: 22, fontWeight: '800' },
  typeLabel:   { fontSize: 10.5, marginTop: 2 },
  typePct:     { fontSize: 11 },
  ratingBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  barVal:      { fontSize: 9, fontWeight: '700' },
  barLabel:    { fontSize: 9 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  pickerCard:  { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 20 },
  pickerBtnRow:{ flexDirection: 'row', gap: 10, marginTop: 16 },
  pickerBtn:   { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  monthStepper:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  monthStepperLabel: { fontSize: 15, fontWeight: '800' },
})
