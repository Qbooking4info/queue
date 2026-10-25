import { useState } from 'react'
import {
  View, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../components/ui/Typography'
import { Card, Header, PrimaryButton, SectionTitle } from '../components/ui/v3'
import { useTheme } from '../contexts/ThemeContext'
import { Alert } from '../contexts/AlertContext'
import { haptics } from '../lib/haptics'
import { fmtLocalDate } from '../lib/format'
import { createCarePlan, type CarePlanCadence, type NewCarePlanTask } from '../lib/api'

interface Props {
  navigation: any
  route: { params: { patientId: string; patientName?: string } }
}

const CADENCES: { key: CarePlanCadence; label: string }[] = [
  { key: 'daily',  label: 'Every day' },
  { key: 'weekly', label: 'Every week' },
  { key: 'once',   label: 'Once' },
]

// Starting points, not a fixed list -- every one is editable once added.
const COMMON = [
  'Take medication as prescribed',
  'Check blood pressure',
  'Check blood sugar',
  'Walk for 30 minutes',
  'Drink 2 litres of water',
  'Record symptoms',
]

let seq = 0
const nextId = () => `t${++seq}`

interface Draft { id: string; title: string; cadence: CarePlanCadence; dueOn: string; perDay: number }

/**
 * The doctor writes the patient's care plan during the consultation -- the
 * only place a plan is created now. Works the same whether the doctor is
 * seeing the patient at a hospital or through a direct booking; the server
 * resolves which from the caller, and a plan written independently simply has
 * no hospital attached.
 *
 * The patient reads it in Queue's My Care, unchanged.
 */
export function CarePlanComposeScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { patientId, patientName } = route.params

  const [title, setTitle]         = useState('')
  const [condition, setCondition] = useState('')
  const [notes, setNotes]         = useState('')
  const [weeks, setWeeks]         = useState<number | null>(4)
  const [tasks, setTasks]         = useState<Draft[]>([{ id: nextId(), title: '', cadence: 'daily', dueOn: '', perDay: 1 }])
  const [saving, setSaving]       = useState(false)

  const filled = tasks.filter(x => x.title.trim())
  const canSave = !!title.trim() && filled.length > 0 && !saving

  function setTask(id: string, patch: Partial<Draft>) {
    setTasks(list => list.map(x => (x.id === id ? { ...x, ...patch } : x)))
  }

  function addTask(text = '') {
    setTasks(list => {
      // Fill the first blank row rather than stacking another empty one under it.
      const blank = list.find(x => !x.title.trim())
      if (blank && text) return list.map(x => (x.id === blank.id ? { ...x, title: text } : x))
      return [...list, { id: nextId(), title: text, cadence: 'daily', dueOn: '', perDay: 1 }]
    })
  }

  async function save() {
    const bad = filled.find(x => x.cadence === 'once' && !x.dueOn.trim())
    if (bad) { Alert.alert('Add a date', `"${bad.title.trim()}" happens once, so it needs a date (YYYY-MM-DD).`); return }

    haptics.tap()
    setSaving(true)

    const starts = new Date()
    const ends = weeks ? new Date(starts.getTime() + weeks * 7 * 86400000) : null

    const payload: NewCarePlanTask[] = filled.map(x => ({
      title: x.title.trim(),
      cadence: x.cadence,
      ...(x.cadence === 'once' ? { dueOn: x.dueOn.trim() } : {}),
      ...(x.cadence === 'daily' ? { timesPerDay: x.perDay } : {}),
    }))

    const res = await createCarePlan({
      patientId,
      title: title.trim(),
      condition: condition.trim() || undefined,
      notes: notes.trim() || undefined,
      startsOn: fmtLocalDate(starts),
      endsOn: ends ? fmtLocalDate(ends) : undefined,
      tasks: payload,
    })
    setSaving(false)

    if (!res.ok) { haptics.error(); Alert.alert('Could not save', res.error); return }
    haptics.success()
    Alert.alert('Plan shared', `${patientName ?? 'Your patient'} can see it in My Care now.`)
    navigation.goBack()
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Care plan" subtitle={patientName} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">

          <Card style={{ gap: 14 }}>
            <SectionTitle title="The plan" />
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Blood pressure control" theme={t} />
            <Field label="Condition (optional)" value={condition} onChangeText={setCondition} placeholder="e.g. Hypertension" theme={t} />

            <View style={{ gap: 8 }}>
              <Text style={[s.label, { color: t.textPrimary }]}>Runs for</Text>
              <View style={s.row}>
                {[2, 4, 8, 12].map(w => (
                  <Chip key={w} on={weeks === w} label={`${w} wks`} onPress={() => setWeeks(w)} theme={t} />
                ))}
                <Chip on={weeks === null} label="Ongoing" onPress={() => setWeeks(null)} theme={t} />
              </View>
            </View>
          </Card>

          <Card style={{ gap: 14 }}>
            <SectionTitle title="What the patient should do" />

            {tasks.map((x, i) => (
              <View key={x.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={x.title}
                    onChangeText={v => setTask(x.id, { title: v })}
                    placeholder={`Task ${i + 1}`}
                    placeholderTextColor={t.textMuted}
                    style={[s.input, { flex: 1, backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                  />
                  {tasks.length > 1 && (
                    <TouchableOpacity
                      onPress={() => setTasks(l => l.filter(y => y.id !== x.id))}
                      accessibilityRole="button" accessibilityLabel={`Remove task ${i + 1}`} hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={21} color={t.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={s.row}>
                  {CADENCES.map(c => (
                    <Chip key={c.key} on={x.cadence === c.key} label={c.label}
                      onPress={() => setTask(x.id, { cadence: c.key })} theme={t} small />
                  ))}
                </View>

                {/* How often, not when. The patient sets the clock times in
                    their own app -- a doctor cannot know when this person eats
                    or sleeps, and a reminder at the wrong hour gets dismissed
                    until it is ignored altogether. */}
                {x.cadence === 'daily' && (
                  <View style={{ gap: 6 }}>
                    <Text style={[s.hint, { color: t.textMuted }]}>How many times a day</Text>
                    <View style={s.row}>
                      {[1, 2, 3, 4].map(n => (
                        <Chip key={n} on={x.perDay === n} label={`${n}×`}
                          onPress={() => setTask(x.id, { perDay: n })} theme={t} small />
                      ))}
                    </View>
                  </View>
                )}

                {x.cadence === 'once' && (
                  <TextInput
                    value={x.dueOn}
                    onChangeText={v => setTask(x.id, { dueOn: v })}
                    placeholder="Due date — YYYY-MM-DD"
                    placeholderTextColor={t.textMuted}
                    style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                  />
                )}
              </View>
            ))}

            <TouchableOpacity onPress={() => addTask()} accessibilityRole="button"
              style={[s.addBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
              <Ionicons name="add" size={16} color={t.accent} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.accent }}>Add a task</Text>
            </TouchableOpacity>

            <View style={{ gap: 8 }}>
              <Text style={[s.hint, { color: t.textMuted }]}>Common tasks</Text>
              <View style={[s.row, { flexWrap: 'wrap' }]}>
                {COMMON.map(c => (
                  <Chip key={c} on={false} label={c} onPress={() => addTask(c)} theme={t} small />
                ))}
              </View>
            </View>
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionTitle title="Notes for the patient (optional)" />
            <TextInput
              value={notes} onChangeText={setNotes} multiline textAlignVertical="top"
              placeholder="Anything they should know alongside the tasks"
              placeholderTextColor={t.textMuted}
              style={[s.input, { minHeight: 90, backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
            />
          </Card>

          <PrimaryButton
            label={saving ? 'Sharing…' : 'Share with patient'}
            onPress={save} loading={saving} disabled={!canSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Field({ label, value, onChangeText, placeholder, theme: t }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder: string; theme: any
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={[s.label, { color: t.textPrimary }]}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={t.textMuted}
        style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
      />
    </View>
  )
}

function Chip({ on, label, onPress, theme: t, small }: {
  on: boolean; label: string; onPress: () => void; theme: any; small?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{
        paddingHorizontal: small ? 11 : 14,
        paddingVertical: small ? 7 : 9,
        borderRadius: 99, borderWidth: 1,
        borderColor: on ? t.accentBorder : t.cardBorder,
        backgroundColor: on ? t.accentBg : t.inputBg,
      }}
    >
      <Text style={{ fontSize: small ? 12 : 13, fontWeight: '700', color: on ? t.accent : t.textMuted }}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700' },
  hint:  { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  row:   { flexDirection: 'row', gap: 8 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, borderWidth: 1,
  },
})
