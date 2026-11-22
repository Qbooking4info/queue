import { useState, useCallback } from 'react'
import { View, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { getLocumJobs, type LocumJob } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, Btn, BottomBar,
  Empty, Mono, type PillTone,
} from '@queue/shared/components/q'

type Tab = 'feed' | 'mine'

interface Props { navigation: any }

export const money = (n: number | null | undefined) =>
  n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`

/** "Closes in 6h" / "Closes tomorrow" — how long a post is still an offer. */
export function closesIn(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Closed'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return `Closes in ${Math.max(1, Math.round(ms / 60_000))} min`
  if (hours < 24) return `Closes in ${hours}h`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Closes tomorrow' : `Closes in ${days} days`
}

export function shiftLine(j: LocumJob) {
  const date = new Date(j.starts_on + 'T00:00:00')
    .toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
  if (!j.start_time || !j.end_time) return date
  return `${date} · ${j.start_time.slice(0, 5)}–${j.end_time.slice(0, 5)}`
}

/**
 * The locum board. "Open to me" is every post in a state this doctor works in;
 * "My posts" is what they have advertised.
 */
export function LocumBoardScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [tab, setTab] = useState<Tab>('feed')
  const [jobs, setJobs] = useState<LocumJob[]>([])
  const [states, setStates] = useState<string[]>([])
  const [reason, setReason] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const res = await getLocumJobs(tab)
    setJobs(res.jobs)
    setStates(res.states)
    setReason(res.reason)
    setLoading(false)
  }, [tab])

  useFocusEffect(useCallback(() => { setLoading(true); load() }, [load]))

  const unanswered = jobs.filter(j => tab === 'feed' && !j.myResponse && j.status === 'open').length

  function rowFor(j: LocumJob) {
    const needsReply = tab === 'feed' && !j.myResponse && j.status === 'open'
    const closesLabel = closesIn(j.expires_at)
    // Only shown when the deadline is close enough to matter -- a month out it
    // is noise, a few hours out it is the reason to reply now.
    const closingSoon = closesLabel && !/days/.test(closesLabel) ? closesLabel : null
    const full = j.employment_type === 'full_time'

    let pill: string | undefined
    let tone: PillTone = 'neutral'
    if (j.status !== 'open') { pill = j.status === 'filled' ? 'Filled' : 'Closed' }
    else if (tab === 'mine') { pill = `${j.responseCount ?? 0} ${j.responseCount === 1 ? 'reply' : 'replies'}`; tone = (j.responseCount ?? 0) > 0 ? 'teal' : 'neutral' }
    else if (j.myResponse) { pill = 'You replied'; tone = 'green' }
    else if (full) { pill = 'Employment'; tone = 'neutral' }
    else if (needsReply) { pill = 'New'; tone = 'teal' }

    return (
      <Row
        key={j.id}
        icon={full ? 'business-outline' : 'moon-outline'}
        iconTone={needsReply ? 'teal' : 'neutral'}
        title={j.hospital?.name ?? 'Hospital'}
        sub={[
          [j.lga, j.state].filter(Boolean).join(', ') || null,
          shiftLine(j),
          closingSoon,
        ].filter(Boolean).join(' · ')}
        pill={pill}
        pillTone={tone}
        right={j.rate_per_hour != null
          ? <View style={{ alignItems: 'flex-end' }}>
              <Mono size={13} weight="700">{money(j.rate_per_hour)}</Mono>
              <Text style={{ fontSize: 10.5, color: t.q.ink60 }}>per hour</Text>
            </View>
          : undefined}
        chevron
        onPress={() => { haptics.tap(); navigation.navigate('LocumJob', { jobId: j.id }) }} />
    )
  }

  return (
    <Screen>
      <AppBar large title="Locum board"
        sub={tab === 'feed'
          ? (states.length ? states.join(', ') : 'No state set yet')
          : 'Shifts you have advertised'}
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

      <Seg<Tab>
        value={tab} onChange={setTab}
        options={[{ key: 'feed', label: 'Open to me' }, { key: 'mine', label: 'My posts' }]} />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />
      }>
        {loading ? null : jobs.length === 0 ? (
          <Card style={{ marginTop: 12 }}>
            {tab === 'feed' && reason === 'no_state' ? (
              <Empty
                icon="location-outline"
                title="We do not know where you work yet"
                body="The board shows shifts in your state. Set your state on your profile, or link yourself to a hospital, and posts will appear here." />
            ) : (
              <Empty
                icon={tab === 'feed' ? 'briefcase-outline' : 'document-text-outline'}
                title={tab === 'feed' ? 'No open shifts near you' : 'You have not posted anything'}
                body={tab === 'feed'
                  ? 'When a doctor advertises a shift in your state it shows up here.'
                  : 'Post a shift at a hospital you are attached to and doctors in that state will see it.'} />
            )}
          </Card>
        ) : (
          <>
            <SectionHead title={tab === 'feed'
              ? (unanswered > 0 ? `${unanswered} need${unanswered === 1 ? 's' : ''} a reply` : 'Open shifts')
              : `Your posts · ${jobs.length}`} />
            <Card>
              {jobs.map((j, i) => (
                <View key={j.id}>
                  {i > 0 && <Hair />}
                  {rowFor(j)}
                </View>
              ))}
            </Card>
          </>
        )}
      </Body>

      <BottomBar meta={
        <Mono size={12} weight="600" color={t.q.ink60}>
          {tab === 'feed'
            ? (states.length ? `Near ${states.join(', ')}` : 'State not set')
            : `${jobs.length} post${jobs.length === 1 ? '' : 's'}`}
        </Mono>
      }>
        <Btn grow label="Post a job" icon="add" onPress={() => navigation.navigate('LocumPost')} />
      </BottomBar>
    </Screen>
  )
}
