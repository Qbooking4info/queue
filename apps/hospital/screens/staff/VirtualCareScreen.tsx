import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Header, HeaderTail, Card, SegmentedControl, KpiCard, EmptyState } from '@queue/shared/components/ui/v3'
import { staffApi, fmtDay } from '../../lib/staffApi'

// v3.1 Virtual Care (web /dashboard/virtual, same GET /api/virtual): video
// consultations, which are live now, and how long calls run.

type RangeKey = 'today' | 'upcoming' | 'past'
interface Consult { id: string; date: string; time: string; status: string; patient: string; doctor: string; live: boolean; durationMins: number | null }
interface Data { consults: Consult[]; stats: { scheduled: number; live: number; completed: number; avgMins: number | null } }
interface Props { navigation: any }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
const STATUS: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' }

export function VirtualCareScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [range, setRange] = useState<RangeKey>('today')
  const [data, setData] = useState<Data | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const bounds = useMemo(() => range === 'today' ? [shift(0), shift(0)] : range === 'upcoming' ? [shift(1), shift(30)] : [shift(-30), shift(-1)], [range])
  const load = useCallback(async () => {
    const r = await staffApi<Data>(`/api/virtual?from=${bounds[0]}&to=${bounds[1]}`)
    setData(r.ok ? r.data : { consults: [], stats: { scheduled: 0, live: 0, completed: 0, avgMins: null } })
    setRefreshing(false)
  }, [bounds])
  useEffect(() => { setData(null); load() }, [load])
  useFocusEffect(useCallback(() => { const id = setInterval(load, 30_000); return () => clearInterval(id) }, [load]))

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Virtual Care" subtitle="Video consultations" onBack={() => navigation.goBack()}>
        <SegmentedControl<RangeKey> onDark value={range} onChange={setRange}
          options={[{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Next 30 days' }, { value: 'past', label: 'Last 30' }]} />
      </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}>
        <HeaderTail />
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'Live now', value: data ? data.stats.live : '…', highlight: !!data?.stats.live },
              { label: 'Scheduled', value: data ? data.stats.scheduled : '…' },
              { label: 'Completed', value: data ? data.stats.completed : '…' },
              { label: 'Avg call', value: data ? (data.stats.avgMins != null ? `${data.stats.avgMins}m` : '—') : '…' },
            ].map(k => <View key={k.label} style={{ flexBasis: '47%', flexGrow: 1 }}><KpiCard label={k.label} value={k.value} highlight={k.highlight} /></View>)}
          </View>
          {data == null ? <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
            : data.consults.length === 0 ? <EmptyState icon="videocam-outline" title="No video consultations"
                body={range === 'today' ? 'Patients book video visits from Virtual Care in the Queue app.' : undefined} />
            : data.consults.map(c => (
              <Card key={c.id} style={{ gap: 4, borderColor: c.live ? t.accentBorder : t.cardBorder }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary, flex: 1 }} numberOfLines={1}>{c.patient}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.live ? t.accent : t.textMuted }}>{c.live ? '● Live' : STATUS[c.status] ?? c.status}</Text>
                </View>
                <Text style={{ fontSize: 13, color: t.textSecondary }}>
                  {c.doctor} · {range === 'today' ? c.time : `${fmtDay(c.date)} ${c.time}`}{c.durationMins != null ? ` · ${c.durationMins} min` : ''}
                </Text>
              </Card>
            ))}
        </View>
      </ScrollView>
    </View>
  )
}
