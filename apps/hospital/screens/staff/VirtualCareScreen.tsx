import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { staffApi, fmtDay } from '../../lib/staffApi'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, Stat, StatStrip,
  Empty, Initials, type PillTone,
} from '@queue/shared/components/q'

// Video consultations (web /dashboard/virtual, same GET /api/virtual): what is
// live now, what is booked, and how long calls actually run.

type RangeKey = 'today' | 'upcoming' | 'past'

interface Consult {
  id: string; date: string; time: string; status: string
  patient: string; doctor: string; live: boolean; durationMins: number | null
}
interface Data {
  consults: Consult[]
  stats: { scheduled: number; live: number; completed: number; avgMins: number | null }
}
interface Props { navigation: any }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  checked_in: { label: 'Waiting', tone: 'teal' },
  in_progress: { label: 'In the call', tone: 'teal' },
  completed: { label: 'Done', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_show: { label: 'No show', tone: 'neutral' },
}

export function VirtualCareScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [range, setRange] = useState<RangeKey>('today')
  const [data, setData] = useState<Data | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const bounds = useMemo(
    () => range === 'today' ? [shift(0), shift(0)]
      : range === 'upcoming' ? [shift(1), shift(30)]
      : [shift(-30), shift(-1)],
    [range],
  )

  const load = useCallback(async () => {
    const r = await staffApi<Data>(`/api/virtual?from=${bounds[0]}&to=${bounds[1]}`)
    setData(r.ok ? r.data : { consults: [], stats: { scheduled: 0, live: 0, completed: 0, avgMins: null } })
    setRefreshing(false)
  }, [bounds])

  useEffect(() => { setData(null); load() }, [load])
  // A live call ends without anyone telling this screen, so it re-reads itself.
  useFocusEffect(useCallback(() => {
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load]))

  const live = (data?.consults ?? []).filter(c => c.live)
  const rest = (data?.consults ?? []).filter(c => !c.live)

  return (
    <Screen>
      <AppBar title="Virtual care" sub="Video consultations" onBack={() => navigation.goBack()} />
      <Seg<RangeKey>
        value={range} onChange={setRange}
        options={[
          { key: 'today', label: 'Today' },
          { key: 'upcoming', label: 'Next 30 days' },
          { key: 'past', label: 'Last 30' },
        ]}
      />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
          tintColor={t.q.primary} colors={[t.q.primary]} />
      }>
        <StatStrip>
          <Stat label="Live now" value={data ? data.stats.live : '…'}
            tone={data?.stats.live ? 'teal' : undefined}
            note={data?.stats.live ? 'in a call' : 'nobody in a call'} />
          <Stat label="Scheduled" value={data ? data.stats.scheduled : '…'}
            note={range === 'today' ? 'today' : range === 'upcoming' ? 'next 30 days' : 'in that window'} />
          <Stat label="Avg call" value={data ? (data.stats.avgMins ?? '—') : '…'}
            unit={data?.stats.avgMins != null ? 'min' : undefined}
            note={`${data?.stats.completed ?? 0} completed`} last />
        </StatStrip>

        {data == null ? (
          <ActivityIndicator color={t.q.primary} style={{ marginTop: 24 }} />
        ) : data.consults.length === 0 ? (
          <Card style={{ marginTop: 12 }}>
            <Empty
              icon="videocam-outline"
              title="No video consultations"
              body={range === 'today'
                ? 'Patients book video visits from Virtual care in the Queue app.'
                : 'Nothing in that window.'}
            />
          </Card>
        ) : (
          <>
            {live.length > 0 && (
              <>
                <SectionHead title="Live now" />
                <Card>
                  {live.map((c, i) => (
                    <View key={c.id}>
                      {i > 0 && <Hair />}
                      <Row
                        leading={<Initials name={c.doctor} size={40} tint="#7C2D12" />}
                        tint
                        title={`${c.doctor} · ${c.patient}`}
                        sub={`Started ${c.time}${c.durationMins != null ? ` · ${c.durationMins} min so far` : ''}`}
                        pill="Live" pillTone="teal" pillSolid
                      />
                    </View>
                  ))}
                </Card>
              </>
            )}

            {rest.length > 0 && (
              <>
                <SectionHead title={range === 'past' ? 'Finished' : 'Upcoming'} />
                <Card>
                  {rest.map((c, i) => {
                    const st = STATUS[c.status] ?? { label: c.status.replace(/_/g, ' '), tone: 'neutral' as PillTone }
                    return (
                      <View key={c.id}>
                        {i > 0 && <Hair />}
                        <Row
                          leading={<Initials name={c.doctor} size={40} tint="#7C2D12" />}
                          title={`${c.doctor} · ${c.patient}`}
                          sub={`${range === 'today' ? c.time : `${fmtDay(c.date)} ${c.time}`}${c.durationMins != null ? ` · ${c.durationMins} min` : ''}`}
                          pill={st.label}
                          pillTone={st.tone}
                        />
                      </View>
                    )
                  })}
                </Card>
              </>
            )}
          </>
        )}
      </Body>
    </Screen>
  )
}
