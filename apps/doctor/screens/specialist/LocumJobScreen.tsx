import { useState, useCallback } from 'react'
import {
  View, ActivityIndicator, Linking, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { EntityAvatar } from '@queue/shared/components/ui/EntityAvatar'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import {
  getLocumJob, respondToLocum, selectLocumDoctor, cancelLocumJob,
  type LocumJob, type LocumResponse,
} from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Stat, StatStrip,
  Field, Btn, BottomBar, Empty, Mono, Notice, Pill,
} from '@queue/shared/components/q'
import { money, shiftLine } from './LocumBoardScreen'

interface Props {
  navigation: any
  route: { params: { jobId: string } }
}

export function LocumJobScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { jobId } = route.params

  const [job, setJob] = useState<LocumJob | null>(null)
  const [isPoster, setIsPoster] = useState(false)
  const [responses, setResponses] = useState<LocumResponse[]>([])
  const [mine, setMine] = useState<LocumResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [counter, setCounter] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const res = await getLocumJob(jobId)
    if (res.ok) {
      setJob(res.job)
      setIsPoster(res.isPoster)
      setResponses(res.responses ?? [])
      setMine(res.myResponse ?? null)
    }
    setLoading(false)
  }, [jobId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function respond(kind: 'accept' | 'counter') {
    if (kind === 'counter') {
      const n = Number(counter.replace(/[^0-9.]/g, ''))
      if (!n || !job || n <= Number(job.rate_per_hour)) {
        Alert.alert('Higher rate needed', `Enter a rate above ${money(job?.rate_per_hour)}/hr, or accept the posted rate.`)
        return
      }
    }
    setBusy(true)
    const err = await respondToLocum(jobId, {
      kind,
      counterRate: kind === 'counter' ? Number(counter.replace(/[^0-9.]/g, '')) : undefined,
      message: message.trim() || undefined,
    })
    setBusy(false)
    if (err) { haptics.error(); Alert.alert('Could not send', err); return }
    haptics.success()
    setCounter(''); setMessage('')
    await load()
  }

  async function pick(r: LocumResponse) {
    Alert.alert(
      `Select ${r.fullName}?`,
      `They will be told, and you will see their phone number so you can reach them. Agreed rate ${money(r.effectiveRate)}/hr.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Select', onPress: async () => {
          setBusy(true)
          const err = await selectLocumDoctor(jobId, r.id)
          setBusy(false)
          if (err) { haptics.error(); Alert.alert('Could not select', err); return }
          haptics.success()
          await load()
        } },
      ],
    )
  }

  function contact(phone: string, via: 'call' | 'whatsapp') {
    const digits = phone.replace(/[^0-9]/g, '')
    // Nigerian numbers are stored E.164 (+234…); WhatsApp wants it without the +.
    const intl = digits.startsWith('234') ? digits : digits.replace(/^0/, '234')
    const url = via === 'call' ? `tel:${phone}` : `https://wa.me/${intl}`
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open', via === 'call' ? 'No phone app available.' : 'WhatsApp is not installed.'))
  }

  if (loading) {
    return (
      <Screen>
        <AppBar title="Locum job" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      </Screen>
    )
  }

  if (!job) {
    return (
      <Screen>
        <AppBar title="Locum job" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 12 }}>
          <Empty icon="alert-circle-outline" title="Post not found" body="It may have been cancelled." />
        </Card>
      </Screen>
    )
  }

  const closed = job.status !== 'open'

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar
          title="Locum job"
          sub={isPoster ? 'Your post' : (job.poster?.full_name ? `Posted by ${job.poster.full_name}` : undefined)}
          onBack={() => navigation.goBack()} />

        <Body refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />
        }>
          <Card style={{ marginTop: 12 }}>
            <Row
              icon={job.employment_type === 'full_time' ? 'business-outline' : 'moon-outline'}
              iconTone="teal"
              title={job.hospital?.name ?? 'Hospital'}
              sub={[[job.lga, job.state].filter(Boolean).join(', ') || null, shiftLine(job)].filter(Boolean).join(' · ')}
              pill={closed ? (job.status === 'filled' ? 'Filled' : 'Closed') : job.employment_type === 'full_time' ? 'Employment' : 'Locum'}
              pillTone={closed ? 'neutral' : 'teal'} />
            <Hair inset={0} />
            <StatStrip>
              <Stat label="Rate" value={money(job.rate_per_hour)} note="per hour" />
              {job.total_amount != null
                ? <Stat label="Total" value={money(job.total_amount)} note={`${job.hours} hours`} last />
                : <Stat label="Hours" value={job.hours ?? '—'} note="per shift" last />}
            </StatStrip>
            {!!job.notes && (
              <>
                <Hair inset={0} />
                <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                  <CardLabel>Details</CardLabel>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: t.q.ink70, marginTop: 6 }}>{job.notes}</Text>
                </View>
              </>
            )}
          </Card>

          {/* ── Responder's side ── */}
          {!isPoster && (
            mine ? (
              <>
                <SectionHead title="Your reply" />
                <Card>
                  <Row
                    icon={mine.selectedAt ? 'checkmark-circle' : 'time-outline'}
                    iconTone={mine.selectedAt ? 'green' : 'amber'}
                    title={mine.kind === 'accept'
                      ? 'You accepted the posted rate'
                      : `You asked for ${money(mine.effectiveRate)}/hr`}
                    sub={mine.selectedAt
                      ? 'You were selected — they have your phone number'
                      : 'Waiting on the poster. Reply again to change your mind.'} />
                </Card>
              </>
            ) : closed ? (
              <Notice tone="neutral">This post is closed.</Notice>
            ) : (
              <>
                <SectionHead title="Your reply" />
                <Card>
                  <View style={{ padding: 14, gap: 14 }}>
                    <Btn label={`Accept ${money(job.rate_per_hour)}/hr`} loading={busy}
                      onPress={() => respond('accept')} />
                    <Hair inset={0} />
                    <Field label="Or ask for more (₦ per hour)" keyboardType="number-pad"
                      value={counter} onChangeText={setCounter}
                      placeholder={`Higher than ${job.rate_per_hour}`} />
                    <Field label="A note with your reply (optional)"
                      value={message} onChangeText={setMessage}
                      placeholder="e.g. I can start an hour earlier" />
                    <Btn label="Send counter offer" variant="secondary"
                      disabled={busy || !counter} onPress={() => respond('counter')} />
                  </View>
                </Card>
              </>
            )
          )}

          {/* ── Poster's side ── */}
          {isPoster && (
            <>
              <SectionHead title={`Replies · ${responses.length}`} />
              {responses.length === 0 ? (
                <Card>
                  <Empty icon="people-outline" title="Nobody has replied yet"
                    body={`Doctors in ${job.state} have been notified.`} />
                </Card>
              ) : (
                <>
                  {responses.map(r => (
                    <Card key={r.id} style={{ marginTop: 12 }}>
                      <Row
                        leading={<EntityAvatar size={40} kind="doctor" uri={r.avatarUrl} label={r.fullName} />}
                        title={r.fullName}
                        sub={[
                          r.kind === 'accept' ? 'Accepted your rate' : 'Asked for more',
                          new Date(r.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
                        ].join(' · ')}
                        right={<Mono size={14} weight="700"
                          color={r.kind === 'accept' ? t.q.primary : t.q.ink}>{money(r.effectiveRate)}</Mono>} />
                      {!!r.message && (
                        <>
                          <Hair />
                          <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                            <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink70 }}>{r.message}</Text>
                          </View>
                        </>
                      )}
                      <Hair />
                      {r.selectedAt && r.phone ? (
                        <View style={{ padding: 14, gap: 10 }}>
                          <Pill label="Selected" tone="green" />
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Btn grow label={r.phone} variant="secondary" icon="call"
                              onPress={() => contact(r.phone as string, 'call')} />
                            <Btn label="WhatsApp" variant="secondary" icon="logo-whatsapp"
                              onPress={() => contact(r.phone as string, 'whatsapp')} />
                          </View>
                        </View>
                      ) : (
                        <View style={{ padding: 14 }}>
                          <Btn label="Select and see phone number" variant="secondary"
                            disabled={busy} onPress={() => pick(r)} />
                        </View>
                      )}
                    </Card>
                  ))}
                  <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                    <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
                      Cheapest first, then whoever replied soonest. Selecting someone shares their phone
                      number with you.
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </Body>

        {isPoster && !closed && (
          <BottomBar meta={
            <Mono size={12} weight="600" color={t.q.ink60}>
              {responses.length} {responses.length === 1 ? 'reply' : 'replies'}
            </Mono>
          }>
            <Btn grow label="Close this post" variant="danger" loading={busy}
              onPress={() => Alert.alert('Close this post?', 'Doctors will no longer see it.', [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Close post', style: 'destructive', onPress: async () => {
                  setBusy(true); const err = await cancelLocumJob(jobId); setBusy(false)
                  if (err) { Alert.alert('Could not close it', err); return }
                  await load()
                } },
              ])} />
          </BottomBar>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}
