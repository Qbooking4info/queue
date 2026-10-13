import { useCallback, useEffect, useState } from 'react'
import { View, ScrollView, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Header, HeaderTail, Card, SegmentedControl, PrimaryButton, EmptyState, SectionTitle, KpiCard } from '@queue/shared/components/ui/v3'
import { staffApi, fmtDay } from '../../lib/staffApi'
import { fmtLocalDate } from '@queue/shared/lib/format'

// v3.1 Care Plans in Queue Hospital: list, create and follow plans. Same API as
// the web dashboard (/api/care-plans); patients tick tasks in the Queue app.

type Status = 'active' | 'completed' | 'stopped'
type Cadence = 'daily' | 'weekly' | 'once'
interface PlanRow {
  id: string; title: string; condition: string | null; status: Status; nextCheckIn: string | null
  patient: string; doctor: string | null; taskCount: number; adherence: number | null; lastActivity: string | null
}

function Adherence({ pct }: { pct: number | null }) {
  const { theme: t } = useTheme()
  if (pct == null) return <Text style={{ fontSize: 13, color: t.textMuted }}>No ticks due yet</Text>
  const color = pct >= 80 ? t.statusSuccess.text : pct >= 50 ? t.statusBusy.text : t.danger
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel={`${pct} percent adherence`}>
      <View style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: t.accentBg, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '800', color }}>{pct}%</Text>
    </View>
  )
}

export function HospitalCarePlansScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const [status, setStatus] = useState<Status>('active')
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const r = await staffApi<{ plans: PlanRow[] }>(`/api/care-plans?status=${status}`)
    setPlans(r.ok ? r.data.plans : [])
    setRefreshing(false)
  }, [status])
  useEffect(() => { setPlans(null) }, [status])
  useFocusEffect(useCallback(() => { load() }, [load]))

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Care Plans" subtitle="Adherence over the last 7 days" onBack={() => navigation.goBack()}>
        <SegmentedControl<Status> onDark value={status} onChange={setStatus}
          options={[{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'stopped', label: 'Stopped' }]} />
      </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}>
        <HeaderTail />
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <PrimaryButton icon="add" label="New care plan" onPress={() => navigation.navigate('CarePlanNew', {})} />
          {plans == null ? <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
            : plans.length === 0 ? <EmptyState icon="checkbox-outline" title="No care plans here"
                body="Create a plan from Patients or with New care plan. Patients tick tasks in My Care, and adherence shows here." />
            : plans.map(p => (
              <Card key={p.id} onPress={() => navigation.navigate('CarePlanDetail', { id: p.id })} accessibilityLabel={`${p.title} for ${p.patient}`} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: t.textPrimary }} numberOfLines={1}>{p.patient}</Text>
                    <Text style={{ fontSize: 13, color: t.accent, fontWeight: '700' }} numberOfLines={1}>{p.title}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
                </View>
                <Adherence pct={p.adherence} />
                <Text style={{ fontSize: 12, color: t.textMuted }}>
                  {[`${p.taskCount} task${p.taskCount === 1 ? '' : 's'}`, p.nextCheckIn ? `check-in ${fmtDay(p.nextCheckIn)}` : null,
                    p.lastActivity ? `last tick ${fmtDay(p.lastActivity)}` : 'no ticks yet'].filter(Boolean).join(' · ')}
                </Text>
              </Card>
            ))}
        </View>
      </ScrollView>
    </View>
  )
}

// ── New plan ──────────────────────────────────────────────────────────────────

export function CarePlanNewScreen({ navigation, route }: { navigation: any; route: any }) {
  const { theme: t } = useTheme()
  const preset = route.params?.patientId ? { id: route.params.patientId as string, name: (route.params.patientName as string) ?? 'Patient' } : null
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(preset)
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<{ id: string; name: string; patientNumber: string | null }[]>([])
  const [title, setTitle] = useState('')
  const [condition, setCondition] = useState('')
  const [notes, setNotes] = useState('')
  const [checkInDays, setCheckInDays] = useState<'none' | '7' | '14' | '30'>('14')
  const [tasks, setTasks] = useState<{ title: string; cadence: Cadence }[]>([{ title: '', cadence: 'daily' }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (patient || search.trim().length < 2) { setMatches([]); return }
    const id = setTimeout(async () => {
      const r = await staffApi<{ patients: any[] }>(`/api/patients?q=${encodeURIComponent(search.trim())}`)
      setMatches(r.ok ? r.data.patients.slice(0, 6) : [])
    }, 250)
    return () => clearTimeout(id)
  }, [search, patient])

  const input = { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg,
    color: t.textPrimary, paddingHorizontal: 12, fontSize: 15 } as const

  async function save() {
    if (!patient) { Alert.alert('Choose a patient'); return }
    if (!title.trim()) { Alert.alert('Add a plan title'); return }
    const clean = tasks.filter(x => x.title.trim())
    if (!clean.length) { Alert.alert('Add at least one task'); return }
    setSaving(true)
    const d = new Date(); d.setDate(d.getDate() + Number(checkInDays))
    const r = await staffApi<{ id: string }>('/api/care-plans', { method: 'POST', body: {
      patientId: patient.id, title, condition, notes, tasks: clean,
      nextCheckIn: checkInDays === 'none' ? null : fmtLocalDate(d),
    } })
    setSaving(false)
    if (!r.ok) { Alert.alert('Could not create the plan', r.error); return }
    navigation.replace('CarePlanDetail', { id: r.data.id })
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="New care plan" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <SectionTitle title="Patient" />
        {patient ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary, flex: 1 }}>{patient.name}</Text>
            <TouchableOpacity onPress={() => { setPatient(null); setSearch('') }} accessibilityRole="button" hitSlop={10}>
              <Text style={{ color: t.accent, fontWeight: '700' }}>Change</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <View style={{ gap: 6 }}>
            <TextInput value={search} onChangeText={setSearch} placeholder="Search name, phone or QB number" placeholderTextColor={t.textMuted}
              accessibilityLabel="Search patient" style={input} autoCorrect={false} />
            {matches.map(m => (
              <TouchableOpacity key={m.id} onPress={() => setPatient({ id: m.id, name: m.name })} accessibilityRole="button"
                style={{ padding: 12, borderRadius: 12, backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.cardBorder }}>
                <Text style={{ fontWeight: '700', color: t.textPrimary }}>{m.name}</Text>
                {!!m.patientNumber && <Text style={{ fontSize: 12, color: t.textMuted }}>{m.patientNumber}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <SectionTitle title="Plan" />
        <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. Blood pressure control" placeholderTextColor={t.textMuted} maxLength={120} accessibilityLabel="Plan title" style={input} />
        <TextInput value={condition} onChangeText={setCondition} placeholder="Condition (optional)" placeholderTextColor={t.textMuted} maxLength={120} accessibilityLabel="Condition" style={input} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.textSecondary }}>Next check-in</Text>
        <SegmentedControl<'none' | '7' | '14' | '30'> value={checkInDays} onChange={setCheckInDays}
          options={[{ value: '7', label: '1 week' }, { value: '14', label: '2 weeks' }, { value: '30', label: '1 month' }, { value: 'none', label: 'None' }]} />

        <SectionTitle title="Tasks the patient ticks off" />
        {tasks.map((task, i) => (
          <Card key={i} style={{ gap: 8 }}>
            <TextInput value={task.title} onChangeText={v => setTasks(ts => ts.map((x, j) => j === i ? { ...x, title: v } : x))}
              placeholder="e.g. Take amlodipine 5 mg" placeholderTextColor={t.textMuted} maxLength={160} accessibilityLabel={`Task ${i + 1}`} style={input} />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <SegmentedControl<'daily' | 'weekly'> value={task.cadence === 'weekly' ? 'weekly' : 'daily'}
                  onChange={v => setTasks(ts => ts.map((x, j) => j === i ? { ...x, cadence: v } : x))}
                  options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
              </View>
              {tasks.length > 1 && (
                <TouchableOpacity onPress={() => setTasks(ts => ts.filter((_, j) => j !== i))} accessibilityLabel={`Remove task ${i + 1}`} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={t.danger} />
                </TouchableOpacity>
              )}
            </View>
          </Card>
        ))}
        <PrimaryButton variant="ghost" icon="add" label="Add task" onPress={() => setTasks(ts => [...ts, { title: '', cadence: 'daily' }])} />

        <TextInput value={notes} onChangeText={setNotes} placeholder="Notes for the patient (optional)" placeholderTextColor={t.textMuted}
          multiline maxLength={2000} accessibilityLabel="Notes" style={[input, { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }]} />
        <PrimaryButton label="Create plan" loading={saving} onPress={save} />
      </ScrollView>
    </View>
  )
}

// ── Plan detail ───────────────────────────────────────────────────────────────

interface Detail {
  plan: { id: string; title: string; condition: string | null; notes: string | null; status: Status; starts_on: string; ends_on: string | null
    next_check_in: string | null; patient: { full_name: string | null } | null; doctor: { full_name: string | null } | null
    tasks: { id: string; title: string; cadence: Cadence; due_on: string | null }[] }
  logs: { task_id: string; done_on: string; done_at: string }[]
  adherence7: number | null
  weeks: { from: string; to: string; pct: number | null; done: number; expected: number }[]
}

export function CarePlanDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const { theme: t } = useTheme()
  const id = route.params?.id as string
  const [d, setD] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [newTask, setNewTask] = useState('')

  const load = useCallback(async () => {
    const r = await staffApi<Detail>(`/api/care-plans/${id}`)
    if (r.ok) setD(r.data); else Alert.alert('Could not load the plan', r.error)
  }, [id])
  useFocusEffect(useCallback(() => { load() }, [load]))

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    const r = await staffApi(`/api/care-plans/${id}`, { method: 'PATCH', body })
    setBusy(false)
    if (!r.ok) { Alert.alert('Could not save', r.error); return false }
    await load(); return true
  }

  if (!d) return <View style={{ flex: 1, backgroundColor: t.canvasBg }}><Header title="Care plan" onBack={() => navigation.goBack()} /><ActivityIndicator color={t.accent} style={{ marginTop: 40 }} /></View>

  const { plan, logs } = d
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - (6 - i)); return fmtLocalDate(x) })

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title={plan.title} subtitle={[plan.patient?.full_name, plan.condition, plan.status !== 'active' ? plan.status : null].filter(Boolean).join(' · ')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexBasis: '47%', flexGrow: 1 }}><KpiCard label="Adherence · 7 days" value={d.adherence7 != null ? `${d.adherence7}%` : '—'} /></View>
          <View style={{ flexBasis: '47%', flexGrow: 1 }}><KpiCard label="Next check-in" value={fmtDay(plan.next_check_in)} /></View>
        </View>

        <SectionTitle title="By week" />
        <Card style={{ gap: 8 }}>
          {d.weeks.map(w => (
            <View key={w.from} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: t.textSecondary }}>{fmtDay(w.from)} – {fmtDay(w.to)}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>{w.pct != null ? `${w.pct}% · ${w.done}/${w.expected}` : '—'}</Text>
            </View>
          ))}
        </Card>

        <SectionTitle title="Tasks · last 7 days" />
        <Card style={{ gap: 12 }}>
          {plan.tasks.map(task => (
            <View key={task.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: t.textPrimary, flex: 1 }}>{task.title}</Text>
                <Text style={{ fontSize: 12, color: t.textMuted }}>{task.cadence === 'daily' ? 'Daily' : task.cadence === 'weekly' ? 'Weekly' : 'Once'}</Text>
                {plan.status === 'active' && plan.tasks.length > 1 && (
                  <TouchableOpacity accessibilityLabel={`Remove ${task.title}`} hitSlop={10}
                    onPress={() => Alert.alert('Remove task?', task.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => patch({ removeTaskIds: [task.id] }) }])}>
                    <Ionicons name="trash-outline" size={18} color={t.danger} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {days.map(day => {
                  const hit = logs.some(l => l.task_id === task.id && l.done_on === day)
                  return (
                    <View key={day} accessibilityLabel={`${day} ${hit ? 'done' : 'not ticked'}`}
                      style={{ flex: 1, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: hit ? t.statusSuccess.text : t.accentBg }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: hit ? '#FFFFFF' : t.textMuted }}>{new Date(day + 'T00:00:00').getDate()}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
          {plan.status === 'active' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={newTask} onChangeText={setNewTask} placeholder="Add a daily task" placeholderTextColor={t.textMuted} maxLength={160}
                accessibilityLabel="New task" style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: t.cardBorder, paddingHorizontal: 12, color: t.textPrimary }} />
              <PrimaryButton label="Add" height={46} disabled={!newTask.trim() || busy}
                onPress={async () => { if (await patch({ addTasks: [{ title: newTask, cadence: 'daily' }] })) setNewTask('') }} />
            </View>
          )}
        </Card>

        {!!plan.notes && <Card><Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 19 }}>{plan.notes}</Text></Card>}

        {plan.status === 'active' ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><PrimaryButton variant="ghost" label="Mark completed" loading={busy} onPress={() => patch({ status: 'completed' })} /></View>
            <View style={{ flex: 1 }}><PrimaryButton variant="danger" label="Stop plan" disabled={busy}
              onPress={() => Alert.alert('Stop this plan?', 'The patient will no longer see tasks to tick.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Stop', style: 'destructive', onPress: () => patch({ status: 'stopped' }) }])} /></View>
          </View>
        ) : <PrimaryButton variant="ghost" label="Reactivate" loading={busy} onPress={() => patch({ status: 'active' })} />}
      </ScrollView>
    </View>
  )
}
