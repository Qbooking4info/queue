import { useState, useCallback } from 'react'
import { View, ActivityIndicator, RefreshControl, Modal, TouchableOpacity } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { Dropdown, type DropdownOption } from '@queue/shared/components/ui/Dropdown'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtLocalDate, fmtDate, todayLocalDate } from '@queue/shared/lib/format'
import { getMyDoctorAnalytics, type DoctorAnalyticsStats } from '@queue/shared/lib/api'
import { CalendarPicker } from '@queue/shared/components/CalendarPicker'
import {
  Screen, AppBar, Body, Card, CardLabel, Hair, SectionHead, Stat, StatStrip,
  Btn, Notice, Mono, Empty,
} from '@queue/shared/components/q'

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
  const { doctorProfile } = useAuth()

  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [pickedDate, setPickedDate] = useState<string>(todayLocalDate())
  const [pickedMonth, setPickedMonth] = useState<Date>(new Date())
  const [visitType, setVisitType] = useState<VisitType>('all')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [hospitalFilter, setHospitalFilter] = useState<string>('all')

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
    const res = await getMyDoctorAnalytics(from, to, type, hospitalFilter === 'all' ? undefined : hospitalFilter)
    if (res.ok) setStats(res.data)
    else setError(res.error)
    setLoading(false)
    setRefreshing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMode, pickedDate, pickedMonth, visitType, hospitalFilter])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const showUp = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0
  const typeSum = stats.byType.inPerson + stats.byType.virtual + stats.byType.homeVisit
  // Divide-by-zero guard only. The bar itself is hidden when the sum is 0 --
  // with `|| 1` the last segment's flex:1 painted a full "home visit" bar out
  // of no data at all.
  const typeTotal = typeSum || 1

  // Labels carry the resolved value for the two custom modes, so the pill reads
  // "12 Mar 2026" rather than a generic "Custom date" once one is applied.
  const PERIOD_OPTIONS: DropdownOption<PeriodMode>[] = [
    { key: 'today',       label: 'Today' },
    { key: 'week',        label: 'Last 7 days' },
    { key: 'month',       label: 'This month' },
    { key: 'year',        label: 'This year' },
    { key: 'date',        label: periodMode === 'date' ? fmtDate(pickedDate) : 'Pick a date…' },
    { key: 'pickedMonth', label: periodMode === 'pickedMonth'
        ? `${MONTH_NAMES_FULL[pickedMonth.getMonth()].slice(0, 3)} ${pickedMonth.getFullYear()}`
        : 'Pick a month…' },
  ]

  const VISIT_TYPE_OPTIONS: DropdownOption<VisitType>[] = [
    { key: 'all',        label: 'All types' },
    { key: 'in-person',  label: 'Physical' },
    { key: 'virtual',    label: 'Virtual' },
    { key: 'home_visit', label: 'Home visit' },
  ]

  // linkedHospitals is every hospital this account is linked to, already resolved by
  // AuthContext, so the filter needs no fetch of its own. "All" is not merely the
  // union of the links: it also includes direct bookings, which have no hospital.
  const HOSPITAL_OPTIONS: DropdownOption<string>[] = [
    { key: 'all', label: 'All practice', hint: 'Every hospital, plus direct bookings' },
    ...(doctorProfile?.linkedHospitals ?? []).map(h => ({
      key: h.hospitalId,
      label: h.hospitalName,
    })),
  ]

  const periodLabel = PERIOD_OPTIONS.find(o => o.key === periodMode)?.label ?? ''
  const hospitalLabel = HOSPITAL_OPTIONS.find(o => o.key === hospitalFilter)?.label ?? 'All practice'

  return (
    <Screen>
      <AppBar large title="My analytics" sub={`${hospitalLabel} · ${periodLabel}`}
        onBack={navigation.canGoBack?.() ? () => navigation.goBack() : undefined} />

      {/* Three filters on one row: when, what kind of visit, and which hospital.
          Dropdowns rather than chip rows -- the period list alone has six entries
          including two that open pickers, which never fit as chips and forced a
          horizontal scroll that hid the later options off-screen. */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Dropdown
          label="Period" icon="calendar-outline" value={periodMode} options={PERIOD_OPTIONS}
          onChange={key => {
            haptics.tap()
            // The two custom entries open a picker instead of selecting directly;
            // periodMode only moves once the picker is applied.
            if (key === 'date') { setShowDatePicker(true); return }
            if (key === 'pickedMonth') { setShowMonthPicker(true); return }
            setPeriodMode(key)
          }} />
        <Dropdown
          label="Consultation type" icon="medkit-outline" value={visitType} options={VISIT_TYPE_OPTIONS}
          onChange={key => { haptics.tap(); setVisitType(key) }} />
        <Dropdown
          label="Hospital" icon="business-outline" value={hospitalFilter} options={HOSPITAL_OPTIONS}
          onChange={key => { haptics.tap(); setHospitalFilter(key) }}
          disabled={HOSPITAL_OPTIONS.length <= 1} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          {!!error && <Notice tone="red" icon="alert-circle">{error}</Notice>}

          {stats.total === 0 && !error ? (
            <Card style={{ marginTop: 12 }}>
              <Empty icon="trending-up-outline" title="No visits in this period"
                body="Change the period or the filters above to see further back." />
            </Card>
          ) : (
            <>
              <Card style={{ marginTop: 12 }}>
                <StatStrip>
                  <Stat label="Total visits" value={stats.total} note="booked" />
                  <Stat label="Patients seen" value={stats.uniquePatients} note="unique people" />
                  <Stat label="Show-up" value={`${showUp}%`} note={`${stats.completed} completed`} last />
                </StatStrip>
                <Hair inset={0} />
                <StatStrip>
                  <Stat label="No-show" value={stats.noShow} tone={stats.noShow > 0 ? 'amber' : undefined} note="did not arrive" />
                  <Stat label="Cancelled" value={stats.cancelled} note="called off" />
                  <Stat label="Upcoming" value={stats.open} note="still to happen" last />
                </StatStrip>
              </Card>

              <SectionHead title="How long people wait" />
              <Card>
                <StatStrip>
                  <Stat label="Avg patient wait" value={fmtMinutes(stats.avgWaitMinutes)}
                    note="check-in to called" />
                  <Stat label="Avg consultation" value={fmtMinutes(stats.avgConsultMinutes)}
                    note="start to end" last />
                </StatStrip>
              </Card>

              <SectionHead title="Rating" />
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: t.q.sel, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="star" size={18} color={t.q.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.q.ink }}>
                      {stats.rating.avg != null ? `${stats.rating.avg.toFixed(1)} average` : 'No rating yet'}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: t.q.ink60, marginTop: 2 }}>
                      {stats.rating.count} review{stats.rating.count === 1 ? '' : 's'} in this period
                    </Text>
                  </View>
                </View>
              </Card>

              {visitType === 'all' && (
                <>
                  <SectionHead title="Visit type split" />
                  <Card>
                    <View style={{ padding: 14, gap: 12 }}>
                      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: t.q.muted }}>
                        {typeSum > 0 && (
                          <>
                            <View style={{ width: `${Math.round(stats.byType.inPerson / typeTotal * 100)}%`, backgroundColor: t.q.primary }} />
                            <View style={{ width: `${Math.round(stats.byType.virtual / typeTotal * 100)}%`, backgroundColor: '#5B9EFF' }} />
                            <View style={{ flex: 1, backgroundColor: t.q.amberFill }} />
                          </>
                        )}
                      </View>
                      {[
                        { label: 'In person', count: stats.byType.inPerson, color: t.q.primary },
                        { label: 'Video', count: stats.byType.virtual, color: '#5B9EFF' },
                        { label: 'Home visit', count: stats.byType.homeVisit, color: t.q.amberFill },
                      ].map(tp => (
                        <View key={tp.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: tp.color }} />
                          <Text style={{ flex: 1, fontSize: 13, color: t.q.ink70 }}>{tp.label}</Text>
                          <Mono size={13} weight="700">{tp.count}</Mono>
                          <Mono size={12} color={t.q.ink60}>{typeSum > 0 ? Math.round(tp.count / typeTotal * 100) : 0}%</Mono>
                        </View>
                      ))}
                    </View>
                  </Card>
                </>
              )}

              {stats.monthly.length > 0 && (
                <>
                  <SectionHead title="Visits by month" />
                  <Card>
                    <View style={{ padding: 14 }}>
                      <CardLabel>This year so far</CardLabel>
                      {(() => {
                        const maxV = Math.max(...stats.monthly.map(m => m.count), 1)
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130, marginTop: 12 }}>
                            {stats.monthly.map((m, i) => {
                              const h = Math.max((m.count / maxV) * 100, 4)
                              const isLast = i === stats.monthly.length - 1
                              return (
                                <View key={m.month} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: t.q.ink60 }}>{m.count}</Text>
                                  <View style={{ width: '100%', height: h, borderRadius: 3, backgroundColor: isLast ? t.q.primary : t.q.muted }} />
                                  <Text style={{ fontSize: 10, color: t.q.ink60 }}>{m.month}</Text>
                                </View>
                              )
                            })}
                          </View>
                        )
                      })()}
                    </View>
                  </Card>
                </>
              )}
            </>
          )}
        </Body>
      )}

      {showDatePicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <View style={{ width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, borderColor: t.q.line, backgroundColor: t.q.surface, padding: 20 }}>
              <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: t.q.ink, marginBottom: 14 }}>
                Pick a date
              </Text>
              <CalendarPicker value={pickedDate} onChange={setPickedDate} maxDate={todayLocalDate()} theme={t} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Btn grow label="Cancel" variant="secondary" onPress={() => setShowDatePicker(false)} />
                <Btn grow label="Apply" onPress={() => { setPeriodMode('date'); setShowDatePicker(false) }} />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {showMonthPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <View style={{ width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, borderColor: t.q.line, backgroundColor: t.q.surface, padding: 20 }}>
              <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: t.q.ink, marginBottom: 16 }}>
                Pick a month
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10}
                  onPress={() => { haptics.tap(); setPickedMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }}>
                  <Ionicons name="chevron-back" size={20} color={t.q.ink} />
                </TouchableOpacity>
                <Text style={{ fontSize: 16, fontWeight: '700', color: t.q.ink }}>
                  {MONTH_NAMES_FULL[pickedMonth.getMonth()]} {pickedMonth.getFullYear()}
                </Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10}
                  onPress={() => { haptics.tap(); setPickedMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }}>
                  <Ionicons name="chevron-forward" size={20} color={t.q.ink} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Btn grow label="Cancel" variant="secondary" onPress={() => setShowMonthPicker(false)} />
                <Btn grow label="Apply" onPress={() => { setPeriodMode('pickedMonth'); setShowMonthPicker(false) }} />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Screen>
  )
}
