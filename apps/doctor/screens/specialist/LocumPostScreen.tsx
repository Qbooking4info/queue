import { useState, useMemo } from 'react'
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth, type LinkedHospital } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtLocalDate } from '@queue/shared/lib/format'
import { postLocumJob } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, CardLabel, Hair, SectionHead, Seg, Chip, Field,
  Btn, BottomBar, Empty, Mono,
} from '@queue/shared/components/q'

interface Props { navigation: any }

const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 ? '30' : '00'
  return `${String(h).padStart(2, '0')}:${m}`
})

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return { iso: fmtLocalDate(d), label: d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) }
  })
}
const DATES = nextDays(30)

/** Hours between two HH:MM strings, wrapping past midnight — mirrors the
 *  generated column in 20261021000002 so the preview matches what is stored. */
function hoursBetween(start: string, end: string): number | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const s = sh * 60 + sm, e = eh * 60 + em
  const mins = e > s ? e - s : 1440 - (s - e)
  return Math.round((mins / 60) * 100) / 100
}

export function LocumPostScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { doctorProfile } = useAuth()

  // Only hospitals this doctor is attached to. The server re-checks, but
  // offering anything else here would be a form that fails on submit.
  //
  // linkedHospitals hangs off doctorProfile, not off the context root. Reading
  // it from the root returned undefined for everyone, so every doctor saw "not
  // attached to a hospital" no matter how many links they had.
  const hospitals: LinkedHospital[] = doctorProfile?.linkedHospitals ?? []

  const [hospitalId, setHospitalId] = useState<string>(hospitals[0]?.hospitalId ?? '')
  const [kind, setKind]     = useState<'locum' | 'full_time'>('locum')
  const [lga, setLga]       = useState('')
  const [date, setDate]     = useState(DATES[0].iso)
  const [start, setStart]   = useState('08:00')
  const [end, setEnd]       = useState('17:00')
  const [rate, setRate]     = useState('')
  const [notes, setNotes]   = useState('')
  const [busy, setBusy]     = useState(false)

  const rateNum = Number(rate.replace(/[^0-9.]/g, '')) || 0
  const hours = useMemo(() => (kind === 'locum' ? hoursBetween(start, end) : null), [kind, start, end])
  const total = hours != null ? Math.round(hours * rateNum * 100) / 100 : null

  const canPost = !!hospitalId && !!date && rateNum > 0 && !busy

  async function submit() {
    haptics.tap()
    setBusy(true)
    const res = await postLocumJob({
      hospitalId,
      employmentType: kind,
      lga: lga.trim() || undefined,
      startsOn: date,
      // A permanent post has no shift window, so the total is not meaningful.
      startTime: kind === 'locum' ? start : undefined,
      endTime: kind === 'locum' ? end : undefined,
      ratePerHour: rateNum,
      notes: notes.trim() || undefined,
    })
    setBusy(false)
    if (!res.ok) { haptics.error(); Alert.alert('Could not post', res.error); return }
    haptics.success()
    Alert.alert('Posted', 'Doctors in that state have been notified.')
    navigation.goBack()
  }

  if (hospitals.length === 0) {
    return (
      <Screen>
        <AppBar title="Post a job" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 12 }}>
          <Empty
            icon="business-outline"
            title="You are not attached to a hospital"
            body="A shift can only be advertised for a hospital you work at. Link yourself to one from Hospitals, then come back."
            action="Open hospitals"
            onAction={() => navigation.navigate('Hospitals')} />
        </Card>
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Post a job"
          sub={hospitals.find(h => h.hospitalId === hospitalId)?.hospitalName ?? undefined}
          onBack={() => navigation.goBack()} />

        <Seg<'locum' | 'full_time'>
          value={kind} onChange={setKind}
          options={[{ key: 'locum', label: 'Locum shift' }, { key: 'full_time', label: 'Full employment' }]} />

        <Body keyboardShouldPersistTaps="handled">
          <SectionHead title="Where" />
          <Card>
            <View style={{ padding: 14, gap: 12 }}>
              <CardLabel>Hospital</CardLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {hospitals.map(h => (
                  <Chip key={h.hospitalId} label={h.hospitalName} on={hospitalId === h.hospitalId}
                    onPress={() => { haptics.tap(); setHospitalId(h.hospitalId) }} />
                ))}
              </View>
              <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60 }}>
                Only hospitals you are attached to can be advertised. The state comes from the hospital,
                and every doctor in it is notified.
              </Text>
              <Field label="Area or LGA (optional)" value={lga} onChangeText={setLga} placeholder="e.g. Ikeja" />
            </View>
          </Card>

          <SectionHead title={kind === 'locum' ? 'When' : 'Start date'} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {DATES.map(d => (
              <Chip key={d.iso} label={d.label} on={date === d.iso}
                onPress={() => { haptics.tap(); setDate(d.iso) }} />
            ))}
          </ScrollView>

          {kind === 'locum' && (
            <>
              <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
                <CardLabel>From</CardLabel>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                {TIMES.map(x => (
                  <Chip key={x} label={x} on={start === x} onPress={() => { haptics.tap(); setStart(x) }} />
                ))}
              </ScrollView>
              <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
                <CardLabel>To</CardLabel>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                {TIMES.map(x => (
                  <Chip key={x} label={x} on={end === x} onPress={() => { haptics.tap(); setEnd(x) }} />
                ))}
              </ScrollView>
            </>
          )}

          <SectionHead title="Pay" />
          <Card>
            <View style={{ padding: 14, gap: 12 }}>
              <Field label="Rate per hour (₦)" value={rate} onChangeText={setRate} keyboardType="number-pad"
                placeholder="e.g. 5000" style={{ fontSize: 18, fontWeight: '700' }} />
              {kind === 'locum' ? (
                <>
                  <Hair inset={0} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Mono size={12} color={t.q.ink60}>
                        {hours ?? 0} hours × ₦{rateNum.toLocaleString()}
                      </Mono>
                      <Text style={{ fontSize: 11, color: t.q.ink60, marginTop: 2 }}>
                        {end <= start ? 'Runs past midnight' : 'Same day'}
                      </Text>
                    </View>
                    <Mono size={20} weight="700" color={t.q.primary}>₦{(total ?? 0).toLocaleString()}</Mono>
                  </View>
                </>
              ) : (
                <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60 }}>
                  Quoted per hour. Doctors can counter with their own rate.
                </Text>
              )}
            </View>
          </Card>

          <SectionHead title="Anything else" />
          <Card>
            <View style={{ padding: 14, gap: 6 }}>
              <CardLabel>Details (optional)</CardLabel>
              <TextInput value={notes} onChangeText={setNotes} multiline textAlignVertical="top"
                placeholder="Department, what the shift covers, who to report to…"
                placeholderTextColor={t.q.ink60}
                accessibilityLabel="Details"
                style={{
                  minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                  backgroundColor: t.q.field, padding: 12, fontSize: 14, lineHeight: 20, color: t.q.ink,
                }} />
            </View>
          </Card>
        </Body>

        <BottomBar meta={
          <Mono size={12} weight="600" color={t.q.ink70}>
            {kind === 'locum' && total != null
              ? `₦${total.toLocaleString()} for ${hours ?? 0} h`
              : rateNum > 0 ? `₦${rateNum.toLocaleString()} per hour` : 'Set a rate'}
          </Mono>
        }>
          <Btn grow label="Post and notify" loading={busy} disabled={!canPost} onPress={submit} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
