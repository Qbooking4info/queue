import { useState } from 'react'
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { Alert } from '../contexts/AlertContext'
import { haptics } from '../lib/haptics'
import { fmtLocalDate } from '../lib/format'
import { createCarePlan, type NewCarePlanTask } from '../lib/api'
import { SchedulePicker, type Schedule } from '../components/ui/SchedulePicker'
import {
  Screen, AppBar, Body, Card, CardLabel, Hair, SectionHead, Chip, Field,
  Btn, BottomBar, IconBtn, Mono,
} from '../components/q'

interface Props {
  navigation: any
  route: { params: { patientId: string; patientName?: string } }
}

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

interface Draft extends Schedule { id: string; title: string; dueOn: string }

const blankTask = (title = ''): Draft => ({
  id: nextId(), title, dueOn: '',
  cadence: 'daily', timesPerPeriod: 1,
  // Null is "as long as the plan": the common case, and what every task did
  // before a task could end on its own.
  durationWeeks: null,
})

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
  const [tasks, setTasks]         = useState<Draft[]>([blankTask()])
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
      return [...list, blankTask(text)]
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
      ...(x.cadence === 'once'
        ? { dueOn: x.dueOn.trim() }
        : { timesPerPeriod: x.timesPerPeriod, durationWeeks: x.durationWeeks }),
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
    Alert.alert('Plan shared', `${patientName ?? 'Your patient'} can see it in My care now.`)
    navigation.goBack()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <Screen>
        <AppBar title="New care plan" sub={patientName} onBack={() => navigation.goBack()} />

        <Body keyboardShouldPersistTaps="handled">
          <SectionHead title="The plan" />
          <Card>
            <View style={{ padding: 14, gap: 14 }}>
              <Field label="Plan name" value={title} onChangeText={setTitle}
                placeholder="e.g. Blood pressure control" />
              <Field label="Condition (optional)" value={condition} onChangeText={setCondition}
                placeholder="e.g. Hypertension" />
              <View style={{ gap: 8 }}>
                <CardLabel>Runs for</CardLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[2, 4, 8, 12].map(w => (
                    <Chip key={w} label={`${w} weeks`} on={weeks === w}
                      onPress={() => { haptics.tap(); setWeeks(w) }} />
                  ))}
                  <Chip label="Ongoing" on={weeks === null}
                    onPress={() => { haptics.tap(); setWeeks(null) }} />
                </View>
              </View>
            </View>
          </Card>

          <SectionHead title={`Daily tasks · ${filled.length}`} />
          <Card>
            {tasks.map((x, i) => (
              <View key={x.id}>
                {i > 0 && <Hair />}
                <View style={{ padding: 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      value={x.title}
                      onChangeText={v => setTask(x.id, { title: v })}
                      placeholder={`Task ${i + 1}`}
                      placeholderTextColor={t.q.ink60}
                      accessibilityLabel={`Task ${i + 1}`}
                      style={{
                        flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: t.q.line,
                        backgroundColor: t.q.field, paddingHorizontal: 12, fontSize: 15, color: t.q.ink,
                      }} />
                    {tasks.length > 1 && (
                      <IconBtn name="close" label={`Remove task ${i + 1}`}
                        onPress={() => setTasks(l => l.filter(y => y.id !== x.id))} />
                    )}
                  </View>

                  {/* How often, not when. The patient sets the clock times -- and
                      the weekday or day of the month -- in their own app: a doctor
                      cannot know when this person eats or sleeps, and a reminder at
                      the wrong hour gets dismissed until it is ignored altogether. */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Chip label="Repeating" on={x.cadence !== 'once'}
                      onPress={() => { haptics.tap(); setTask(x.id, { cadence: 'daily' }) }} />
                    <Chip label="Once, on a date" on={x.cadence === 'once'}
                      onPress={() => { haptics.tap(); setTask(x.id, { cadence: 'once', timesPerPeriod: 1, durationWeeks: null }) }} />
                  </View>

                  {x.cadence !== 'once' && (
                    <SchedulePicker compact value={x} onChange={next => setTask(x.id, next)} />
                  )}

                  {x.cadence === 'once' && (
                    <TextInput
                      value={x.dueOn}
                      onChangeText={v => setTask(x.id, { dueOn: v })}
                      placeholder="Due date — YYYY-MM-DD"
                      placeholderTextColor={t.q.ink60}
                      accessibilityLabel="Due date"
                      style={{
                        minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: t.q.line,
                        backgroundColor: t.q.field, paddingHorizontal: 12, fontSize: 15, color: t.q.ink,
                      }} />
                  )}
                </View>
              </View>
            ))}
            <Hair />
            <View style={{ padding: 14 }}>
              <Btn label="Add a task" variant="secondary" icon="add" onPress={() => addTask()} />
            </View>
          </Card>

          <SectionHead title="Common tasks" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
            {COMMON.map(c => (
              <Chip key={c} label={c} onPress={() => { haptics.tap(); addTask(c) }} />
            ))}
          </View>

          <SectionHead title="Notes for the patient" />
          <Card>
            <View style={{ padding: 14, gap: 6 }}>
              <CardLabel>Optional</CardLabel>
              <TextInput
                value={notes} onChangeText={setNotes} multiline textAlignVertical="top"
                placeholder="Anything they should know alongside the tasks"
                placeholderTextColor={t.q.ink60}
                accessibilityLabel="Notes for the patient"
                style={{
                  minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                  backgroundColor: t.q.field, padding: 12, fontSize: 14, lineHeight: 20, color: t.q.ink,
                }} />
            </View>
          </Card>
        </Body>

        <BottomBar meta={
          <Mono size={12} weight="600" color={t.q.ink70}>
            {filled.length} task{filled.length === 1 ? '' : 's'} · {weeks ? `${weeks} weeks` : 'ongoing'}
          </Mono>
        }>
          <Btn grow label="Start plan" loading={saving} disabled={!canSave} onPress={save} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
