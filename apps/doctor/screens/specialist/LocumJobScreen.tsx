import { useState, useCallback } from 'react'
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Header, Card, PrimaryButton, SectionTitle, EmptyState } from '@queue/shared/components/ui/v3'
import { EntityAvatar } from '@queue/shared/components/ui/EntityAvatar'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import {
  getLocumJob, respondToLocum, selectLocumDoctor, cancelLocumJob,
  type LocumJob, type LocumResponse,
} from '@queue/shared/lib/api'
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
      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <Header title="Shift" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    )
  }

  if (!job) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <Header title="Shift" onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Post not found" body="It may have been cancelled." />
      </SafeAreaView>
    )
  }

  const closed = job.status !== 'open'

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title={job.hospital?.name ?? 'Shift'}
        subtitle={[job.lga, job.state].filter(Boolean).join(', ')}
        onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.accent}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[st.pill, { backgroundColor: t.accentBg }]}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: t.accent }}>
                {job.employment_type === 'full_time' ? 'FULL TIME' : 'LOCUM'}
              </Text>
            </View>
            {closed && (
              <Text style={{ fontSize: 11, fontWeight: '800', color: t.textMuted, textTransform: 'uppercase' }}>
                {job.status}
              </Text>
            )}
          </View>

          <Text style={{ fontSize: 15, color: t.textSecondary }}>{shiftLine(job)}</Text>

          <View style={[st.money, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: t.textMuted }}>Rate</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: t.textPrimary }}>
                {money(job.rate_per_hour)}<Text style={{ fontSize: 13, color: t.textMuted }}>/hr</Text>
              </Text>
            </View>
            {job.total_amount != null && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: t.textMuted }}>{job.hours} hours</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: t.accent }}>{money(job.total_amount)}</Text>
              </View>
            )}
          </View>

          {!!job.notes && <Text style={{ fontSize: 14, color: t.textSecondary, lineHeight: 20 }}>{job.notes}</Text>}
          {!isPoster && !!job.poster?.full_name && (
            <Text style={{ fontSize: 12, color: t.textMuted }}>Posted by {job.poster.full_name}</Text>
          )}
        </Card>

        {/* ── Responder's side ── */}
        {!isPoster && (
          mine ? (
            <Card style={{ gap: 8 }}>
              <SectionTitle title="Your response" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>
                {mine.kind === 'accept' ? 'You accepted the posted rate' : `You asked for ${money(mine.effectiveRate)}/hr`}
              </Text>
              {mine.selectedAt ? (
                <Text style={{ fontSize: 14, color: t.accent, fontWeight: '700' }}>
                  You were selected — they have your phone number.
                </Text>
              ) : (
                <Text style={{ fontSize: 13, color: t.textMuted }}>
                  Waiting on the poster. You can change your mind by replying again.
                </Text>
              )}
            </Card>
          ) : closed ? (
            <Card><Text style={{ fontSize: 14, color: t.textMuted }}>This post is closed.</Text></Card>
          ) : (
            <Card style={{ gap: 12 }}>
              <SectionTitle title="Your reply" />
              <PrimaryButton label={`Accept ${money(job.rate_per_hour)}/hr`} onPress={() => respond('accept')} disabled={busy} />

              <Text style={[s.label, { color: t.textPrimary, marginTop: 4 }]}>Or ask for more</Text>
              <TextInput value={counter} onChangeText={setCounter} keyboardType="number-pad"
                placeholder={`Higher than ${job.rate_per_hour}`} placeholderTextColor={t.textMuted}
                style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
              <TextInput value={message} onChangeText={setMessage}
                placeholder="A note with your reply (optional)" placeholderTextColor={t.textMuted}
                style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
              <PrimaryButton label="Send counter offer" variant="ghost" onPress={() => respond('counter')} disabled={busy || !counter} />
            </Card>
          )
        )}

        {/* ── Poster's side ── */}
        {isPoster && (
          <Card style={{ gap: 14 }}>
            <SectionTitle title={`${responses.length} ${responses.length === 1 ? 'response' : 'responses'}`} />
            {responses.length === 0 ? (
              <Text style={{ fontSize: 14, color: t.textMuted }}>
                Nobody has replied yet. Doctors in {job.state} have been notified.
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: t.textMuted }}>
                  Cheapest first, then whoever replied soonest.
                </Text>
                {responses.map(r => (
                  <View key={r.id} style={[st.resp, { borderColor: r.selectedAt ? t.accent : t.cardBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <EntityAvatar size={42} kind="doctor" uri={r.avatarUrl} label={r.fullName} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }} numberOfLines={1}>
                          {r.fullName}
                        </Text>
                        <Text style={{ fontSize: 12, color: t.textMuted }}>
                          {r.kind === 'accept' ? 'Accepted your rate' : 'Asked for more'}
                          {' · '}
                          {new Date(r.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: r.kind === 'accept' ? t.accent : t.textPrimary }}>
                        {money(r.effectiveRate)}
                      </Text>
                    </View>

                    {!!r.message && (
                      <Text style={{ fontSize: 13, color: t.textSecondary, marginTop: 8 }}>{r.message}</Text>
                    )}

                    {r.selectedAt && r.phone ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TouchableOpacity onPress={() => contact(r.phone!, 'call')} accessibilityRole="button"
                          style={[st.contact, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                          <Ionicons name="call" size={15} color={t.accent} />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: t.accent }}>{r.phone}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => contact(r.phone!, 'whatsapp')} accessibilityRole="button"
                          accessibilityLabel={`WhatsApp ${r.fullName}`}
                          style={[st.contact, { backgroundColor: '#25D36618', borderColor: '#25D36655' }]}>
                          <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#25D366' }}>WhatsApp</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => pick(r)} disabled={busy} accessibilityRole="button"
                        style={[st.select, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: t.accent }}>
                          Select and see phone number
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}

            {!closed && (
              <PrimaryButton label="Cancel this post" variant="danger" disabled={busy}
                onPress={() => Alert.alert('Cancel post?', 'Doctors will no longer see it.', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel post', style: 'destructive', onPress: async () => {
                    setBusy(true); const err = await cancelLocumJob(jobId); setBusy(false)
                    if (err) { Alert.alert('Could not cancel', err); return }
                    await load()
                  } },
                ])} />
            )}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
})

const st = StyleSheet.create({
  pill:  { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  money: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  resp:  { borderRadius: 14, borderWidth: 1.5, padding: 12 },
  contact: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  select: { alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginTop: 10 },
})
