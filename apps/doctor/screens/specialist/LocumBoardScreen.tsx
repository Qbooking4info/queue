import { useState, useCallback, useRef, useEffect } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Animated, Easing } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Header, Card, SegmentedControl, EmptyState, PrimaryButton } from '@queue/shared/components/ui/v3'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { getLocumJobs, type LocumJob } from '@queue/shared/lib/api'

type Tab = 'feed' | 'mine'

interface Props { navigation: any }

export const money = (n: number | null | undefined) =>
  n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`

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

  const unanswered = jobs.filter(j => tab === 'feed' && !j.myResponse).length

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header
        title="Locum board"
        subtitle={tab === 'feed'
          ? (states.length ? states.join(', ') : 'No state yet')
          : 'Shifts you have advertised'}
      >
        <SegmentedControl<Tab> onDark value={tab} onChange={setTab}
          options={[{ value: 'feed', label: 'Open to me' }, { value: 'mine', label: 'My posts' }]} />
      </Header>

      <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
        <PrimaryButton label="Post a job" icon="add" onPress={() => navigation.navigate('LocumPost')} />
      </View>

      {loading ? null : jobs.length === 0 ? (
        tab === 'feed' && reason === 'no_state' ? (
          <EmptyState
            icon="location-outline"
            title="We do not know where you work yet"
            body="The board shows shifts in your state. Set your state on your profile, or link yourself to a hospital, and posts will appear here."
          />
        ) : (
          <EmptyState
            icon={tab === 'feed' ? 'briefcase-outline' : 'document-text-outline'}
            title={tab === 'feed' ? 'No open shifts near you' : 'You have not posted anything'}
            body={tab === 'feed'
              ? 'When a doctor advertises a shift in your state it will show up here.'
              : 'Post a shift at a hospital you are attached to and doctors in that state will see it.'}
          />
        )
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 14, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.accent}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}
        >
          {tab === 'feed' && unanswered > 0 && (
            <Text style={{ fontSize: 12, color: t.textMuted }}>
              {unanswered} {unanswered === 1 ? 'shift needs' : 'shifts need'} a reply
            </Text>
          )}
          {jobs.map(j => (
            <JobCard key={j.id} job={j} tab={tab}
              onPress={() => { haptics.tap(); navigation.navigate('LocumJob', { jobId: j.id }) }} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function JobCard({ job: j, tab, onPress }: { job: LocumJob; tab: Tab; onPress: () => void }) {
  const { theme: t } = useTheme()
  // Unanswered posts pulse so a shift that needs a reply is visible without
  // reading every card. It settles once answered rather than blinking forever.
  const needsReply = tab === 'feed' && !j.myResponse && j.status === 'open'
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!needsReply) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [needsReply, pulse])

  const borderColor = needsReply
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [t.cardBorder, t.accent] })
    : t.cardBorder

  const statusTone =
    j.status === 'open' ? t.accent :
    j.status === 'filled' ? t.info : t.textMuted

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${j.hospital?.name ?? 'Shift'}, ${shiftLine(j)}, ${money(j.rate_per_hour)} per hour`}>
      <Animated.View style={[st.card, { backgroundColor: t.cardBg, borderColor }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[st.pill, { backgroundColor: t.accentBg }]}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: t.accent }}>
              {j.employment_type === 'full_time' ? 'FULL TIME' : 'LOCUM'}
            </Text>
          </View>
          {needsReply && <View style={[st.dot, { backgroundColor: t.accent }]} />}
          <View style={{ flex: 1 }} />
          {j.status !== 'open' && (
            <Text style={{ fontSize: 11, fontWeight: '700', color: statusTone, textTransform: 'capitalize' }}>
              {j.status}
            </Text>
          )}
        </View>

        <Text style={{ fontSize: 16, fontWeight: '800', color: t.textPrimary }} numberOfLines={1}>
          {j.hospital?.name ?? 'Hospital'}
        </Text>
        <Text style={{ fontSize: 13, color: t.textMuted }} numberOfLines={1}>
          {[j.lga, j.state].filter(Boolean).join(', ')}
        </Text>
        <Text style={{ fontSize: 13, color: t.textSecondary }}>{shiftLine(j)}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 2 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: t.textMuted }}>Rate</Text>
            <Text style={{ fontSize: 17, fontWeight: '800', color: t.textPrimary }}>
              {money(j.rate_per_hour)}<Text style={{ fontSize: 12, color: t.textMuted }}>/hr</Text>
            </Text>
          </View>
          {j.total_amount != null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: t.textMuted }}>{j.hours}h total</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: t.accent }}>{money(j.total_amount)}</Text>
            </View>
          )}
        </View>

        {tab === 'mine' && (
          <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
            {j.responseCount ?? 0} {j.responseCount === 1 ? 'response' : 'responses'}
            {j.selectedCount ? ' · selected' : ''}
          </Text>
        )}
        {tab === 'feed' && j.myResponse && (
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent, marginTop: 2 }}>You replied</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 4 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  dot:  { width: 7, height: 7, borderRadius: 4 },
})
