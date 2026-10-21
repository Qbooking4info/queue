import { useState, useMemo } from 'react'
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Header, Card, PrimaryButton, SectionTitle } from '@queue/shared/components/ui/v3'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtLocalDate } from '@queue/shared/lib/format'
import { postLocumJob } from '@queue/shared/lib/api'

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
  const { linkedHospitals, doctorProfile } = useAuth() as any

  // Only hospitals this doctor is attached to. The server re-checks, but
  // offering anything else here would be a form that fails on submit.
  const hospitals: { doctorId: string; hospitalId: string; hospitalName: string }[] = linkedHospitals ?? []

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
      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <Header title="Post a job" onBack={() => navigation.goBack()} />
        <View style={{ padding: 24, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: t.textPrimary }}>
            You are not attached to a hospital
          </Text>
          <Text style={{ fontSize: 14, color: t.textMuted, lineHeight: 20 }}>
            A shift can only be advertised for a hospital you work at. Link yourself to
            one from Hospitals, then come back.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Post a job" subtitle={doctorProfile?.fullName ?? undefined} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">

          <Card style={{ gap: 14 }}>
            <SectionTitle title="Where" />
            <Text style={[s.label, { color: t.textPrimary }]}>Hospital</Text>
            <View style={s.wrapRow}>
              {hospitals.map(h => (
                <Chip key={h.hospitalId} on={hospitalId === h.hospitalId}
                  label={h.hospitalName} onPress={() => setHospitalId(h.hospitalId)} theme={t} />
              ))}
            </View>
            <Text style={[s.hint, { color: t.textMuted }]}>
              Only hospitals you are attached to can be advertised. The state is taken
              from the hospital, and every doctor in it is notified.
            </Text>

            <Text style={[s.label, { color: t.textPrimary, marginTop: 4 }]}>LGA (optional)</Text>
            <TextInput value={lga} onChangeText={setLga} placeholder="e.g. Ikeja"
              placeholderTextColor={t.textMuted}
              style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
          </Card>

          <Card style={{ gap: 14 }}>
            <SectionTitle title="What" />
            <View style={s.row}>
              <Chip on={kind === 'locum'} label="Locum shift" onPress={() => setKind('locum')} theme={t} />
              <Chip on={kind === 'full_time'} label="Full employment" onPress={() => setKind('full_time')} theme={t} />
            </View>

            <Text style={[s.label, { color: t.textPrimary }]}>
              {kind === 'locum' ? 'Date' : 'Start date'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
              {DATES.map(d => (
                <Chip key={d.iso} on={date === d.iso} label={d.label} onPress={() => setDate(d.iso)} theme={t} small />
              ))}
            </ScrollView>

            {kind === 'locum' && (
              <>
                <Text style={[s.label, { color: t.textPrimary }]}>From</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
                  {TIMES.map(x => <Chip key={x} on={start === x} label={x} onPress={() => setStart(x)} theme={t} small />)}
                </ScrollView>
                <Text style={[s.label, { color: t.textPrimary }]}>To</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
                  {TIMES.map(x => <Chip key={x} on={end === x} label={x} onPress={() => setEnd(x)} theme={t} small />)}
                </ScrollView>
              </>
            )}
          </Card>

          <Card style={{ gap: 12 }}>
            <SectionTitle title="Pay" />
            <Text style={[s.label, { color: t.textPrimary }]}>Rate per hour (₦)</Text>
            <TextInput value={rate} onChangeText={setRate} keyboardType="number-pad"
              placeholder="e.g. 5000" placeholderTextColor={t.textMuted}
              style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary, fontSize: 18, fontWeight: '700' }]} />

            {kind === 'locum' && (
              <View style={[s.total, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: t.textMuted }}>
                    {hours ?? 0} hours × ₦{rateNum.toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                    {end <= start ? 'Runs past midnight' : 'Same day'}
                  </Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: '800', color: t.accent }}>
                  ₦{(total ?? 0).toLocaleString()}
                </Text>
              </View>
            )}
            {kind === 'full_time' && (
              <Text style={[s.hint, { color: t.textMuted }]}>
                Quoted per hour. Doctors can counter with their own rate.
              </Text>
            )}
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionTitle title="Anything else (optional)" />
            <TextInput value={notes} onChangeText={setNotes} multiline textAlignVertical="top"
              placeholder="Department, what the shift covers, who to report to…"
              placeholderTextColor={t.textMuted}
              style={[s.input, { minHeight: 90, backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
          </Card>

          <PrimaryButton label={busy ? 'Posting…' : 'Post and notify'} onPress={submit} loading={busy} disabled={!canPost} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Chip({ on, label, onPress, theme: t, small }: {
  on: boolean; label: string; onPress: () => void; theme: any; small?: boolean
}) {
  return (
    <TouchableOpacity onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{
        paddingHorizontal: small ? 11 : 14, paddingVertical: small ? 7 : 10,
        borderRadius: 99, borderWidth: 1,
        borderColor: on ? t.accentBorder : t.cardBorder,
        backgroundColor: on ? t.accentBg : t.inputBg,
      }}>
      <Text style={{ fontSize: small ? 12 : 13, fontWeight: '700', color: on ? t.accent : t.textMuted }}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700' },
  hint:  { fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  row:     { flexDirection: 'row', gap: 8 },
  wrapRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  total: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
})
