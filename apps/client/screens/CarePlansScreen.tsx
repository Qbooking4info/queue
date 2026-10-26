import { useCallback, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Switch, TextInput } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import {
  getTaskTimes, setTaskTimes, syncCarePlanReminders,
  defaultTimes, defaultDaysOfWeek, defaultDaysOfMonth, WEEKDAY_LABELS,
  addOwnGoal, removeOwnGoal,
  type ReminderSlot, type CarePlanPeriod,
} from '@queue/shared/lib/carePlanReminders'
import { haptics } from '@queue/shared/lib/haptics'
import { Header, HeaderTail, Card, SectionTitle, EmptyState, PrimaryButton } from '@queue/shared/components/ui/v3'
import { SchedulePicker, durationLabel, type Schedule } from '@queue/shared/components/ui/SchedulePicker'

interface Props { navigation: any }

// v3.1 My Care > Care plans (p-careplan). Plans come from the hospital (web Care
// Plans); the patient ticks tasks here. Each tick is one care_plan_task_logs row
// (RLS: own active plans, today or yesterday, within the plan's dates), timed by
// the server. Caretakers see the plans of whoever they're managing.

type Cadence = CarePlanPeriod
interface Task { id: string; title: string; cadence: Cadence; due_on: string | null; sort_order: number; times_per_period: number; ends_on: string | null }
interface TaskTime { id: string; task_id: string; slot: number; time_of_day: string; enabled: boolean; day_of_week: number | null; day_of_month: number | null }
interface Plan {
  id: string; title: string; source: 'clinical' | 'self'; condition: string | null; notes: string | null; starts_on: string; ends_on: string | null
  next_check_in: string | null; hospital: { name: string } | null; doctor: { full_name: string | null } | null; tasks: Task[]
}
interface Log { id: string; task_id: string; plan_id: string; done_on: string; slot: number }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// Monday of this week, so "weekly" means once per calendar week.
function weekStart(): string {
  const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d)
}
// The 1st, so "monthly" means once per calendar month.
function monthStart(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * How often, in the words the patient chose it with: the count and the period
 * together. "Twice a week" reads as a commitment; "weekly, 2" reads as a field.
 */
function freqLabel(task: Task): string {
  if (task.cadence === 'once') return `Due ${task.due_on ? fmt(task.due_on) : 'soon'}`
  const n = Math.max(1, task.times_per_period ?? 1)
  const period = task.cadence === 'daily' ? 'day' : task.cadence === 'weekly' ? 'week' : 'month'
  if (n === 1) return task.cadence === 'daily' ? 'Every day' : `Once a ${period}`
  if (n === 2) return `Twice a ${period}`
  return `${n} times a ${period}`
}

/** The caption under one tick box: whatever of day and time the patient has set. */
function slotWhen(task: Task, at?: { time_of_day: string; day_of_week: number | null; day_of_month: number | null }): string {
  if (!at) return ''
  const time = at.time_of_day.slice(0, 5)
  if (task.cadence === 'weekly' && at.day_of_week) return `${WEEKDAY_LABELS[at.day_of_week - 1]} ${time}`
  if (task.cadence === 'monthly' && at.day_of_month) return `${ordinal(at.day_of_month)} ${time}`
  return time
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'
  return `${n}${s}`
}

export function CarePlansScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [times, setTimes] = useState<TaskTime[]>([])
  const [editing, setEditing] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const today = ymd(new Date())
  const monday = weekStart()
  const first = monthStart()
  // Ticks are counted against each task's own period, so the logs have to reach
  // back to whichever period began earlier.
  const since = monday < first ? monday : first

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('care_plans')
      .select('id, title, source, condition, notes, starts_on, ends_on, next_check_in, hospital:hospitals(name), doctor:doctors(full_name), tasks:care_plan_tasks(id, title, cadence, due_on, sort_order, times_per_period, ends_on)')
      .eq('status', 'active').order('created_at', { ascending: false })
    if (error) { setPlans([]); setRefreshing(false); return }
    const ps = ((data ?? []) as any[]).map(p => ({ ...p, tasks: (p.tasks ?? []).sort((a: Task, b: Task) => a.sort_order - b.sort_order) })) as Plan[]
    setPlans(ps)
    if (ps.length) {
      const { data: l } = await supabase.from('care_plan_task_logs').select('id, task_id, plan_id, done_on, slot')
        .in('plan_id', ps.map(p => p.id)).gte('done_on', since)
      setLogs((l ?? []) as Log[])

      // Reminder times, and the device schedule rebuilt from them. Done on every
      // load so a task the doctor stopped, or a time changed on another device,
      // stops ringing here without the patient doing anything.
      const taskIds = ps.flatMap(p => p.tasks.map(t => t.id))
      const rows = await getTaskTimes(taskIds)
      setTimes(rows as any)

      const byTask = new Map(ps.flatMap(p => p.tasks.map(t => [t.id, { plan: p, task: t }])))
      const slots: ReminderSlot[] = (rows as any[])
        .map(r => {
          const hit = byTask.get(r.task_id)
          if (!hit) return null
          return {
            taskId: r.task_id, planId: hit.plan.id, title: hit.task.title,
            slot: r.slot, timeOfDay: r.time_of_day, enabled: r.enabled,
            cadence: hit.task.cadence, dayOfWeek: r.day_of_week, dayOfMonth: r.day_of_month,
            endsOn: hit.task.ends_on,
          }
        })
        .filter(Boolean) as ReminderSlot[]
      syncCarePlanReminders(slots).catch(() => {})
    } else { setLogs([]); setTimes([]) }
    setRefreshing(false)
  }, [since])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // When the task's current period began. Every tick is counted inside it, so
  // a twice-a-week goal resets on Monday and a monthly one on the 1st.
  const periodStart = (task: Task) =>
    task.cadence === 'daily' ? today : task.cadence === 'weekly' ? monday : first

  // What "done" means for one occurrence of the current period. Three times a
  // day has three of these; twice a week also has two, ticked on any two days.
  const doneLog = (task: Task, slot = 0) => {
    if (task.cadence === 'once') return logs.find(l => l.task_id === task.id)
    const from = periodStart(task)
    return logs.find(l => l.task_id === task.id && l.done_on >= from && l.slot === slot)
  }
  const slotsOf = (task: Task) => (task.cadence === 'once' ? 1 : Math.max(1, task.times_per_period ?? 1))
  // A task that has run its course keeps its history but stops asking, so a
  // one-week course of antibiotics does not sit in the list for good.
  const live = (task: Task) => task.ends_on == null || task.ends_on >= today
  // What to show: everything live that repeats, plus one-offs due or overdue.
  const todaysTasks = (p: Plan) =>
    p.tasks.filter(task => live(task) && (task.cadence !== 'once' || (task.due_on != null && task.due_on <= today)))

  async function toggle(plan: Plan, task: Task, slot = 0) {
    if (busy) return
    setBusy(`${task.id}:${slot}`)
    const existing = doneLog(task, slot)
    if (existing && existing.done_on >= ymd(new Date(Date.now() - 86_400_000))) {
      const { error } = await supabase.from('care_plan_task_logs').delete().eq('id', existing.id)
      if (error) Alert.alert('Could not update', error.message)
    } else if (!existing) {
      // done_on is the patient's local calendar date (REP-052), and slot says
      // which occurrence of the period it is -- both, or a tick lands on the
      // wrong day for anyone off UTC, or overwrites another dose.
      const { error } = await supabase.from('care_plan_task_logs')
        .insert({ task_id: task.id, plan_id: plan.id, done_on: today, slot })
      if (error) Alert.alert('Could not tick', 'Try again in a moment.')
      else haptics.success()
    }
    await load()
    setBusy(null)
  }

  // Progress, each task measured against its own current period: today for a
  // daily task, this week for a weekly one, this month for a monthly one.
  // Mixing them into one bar is the point -- the patient wants to know whether
  // they are on top of the plan, not of a calendar week.
  const planProgress = (p: Plan) => {
    let expected = 0, done = 0
    for (const task of p.tasks) {
      if (!live(task)) continue
      const per = slotsOf(task)
      if (task.cadence === 'once') {
        if (task.due_on && task.due_on <= today) { expected += 1; done += logs.some(l => l.task_id === task.id) ? 1 : 0 }
        continue
      }
      // A daily task only asks for today's doses; a weekly or monthly one asks
      // for the whole period, so it reads as incomplete until it is kept.
      const from = [periodStart(task), p.starts_on].sort()[1]
      const tl = logs.filter(l => l.task_id === task.id && l.done_on >= from)
      expected += per
      done += Math.min(per, tl.length)
    }
    return expected ? Math.round((done / expected) * 100) : null
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Care plans" onBack={() => navigation.goBack()}>
        <Text style={{ color: '#CCFBF1', fontSize: 14 }}>Tick off today’s tasks. Your hospital sees your progress.</Text>
      </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}>
        <HeaderTail />
        {plans == null ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : plans.length === 0 ? (
          <View style={{ padding: 20, gap: 14 }}>
            <EmptyState icon="checkbox-outline" title="Nothing here yet"
              body="Your hospital or doctor can set a plan after a visit — for blood pressure, diabetes or recovery. You can also set your own goals right now." />
            <PrimaryButton label="Set your own goal" icon="add" onPress={() => setAdding(true)} />
          </View>
        ) : plans.map(p => {
          const pct = planProgress(p)
          const due = todaysTasks(p)
          return (
            <View key={p.id} style={{ paddingHorizontal: 20, paddingTop: 16, gap: 10 }}>
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: t.textPrimary }}>{p.title}</Text>
                    <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                      {[p.condition, p.doctor?.full_name, p.hospital?.name].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {pct != null && (
                    <View accessibilityLabel={`${pct} percent of this plan done so far`} style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: t.accent }}>{pct}%</Text>
                      <Text style={{ fontSize: 11, color: t.textMuted }}>so far</Text>
                    </View>
                  )}
                </View>
                {pct != null && (
                  <View style={{ height: 6, borderRadius: 99, backgroundColor: t.accentBg, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: '100%', backgroundColor: t.accent }} />
                  </View>
                )}
                {p.next_check_in && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar-outline" size={14} color={t.textMuted} />
                    <Text style={{ fontSize: 13, color: t.textSecondary }}>Next check-in · {fmt(p.next_check_in)}</Text>
                  </View>
                )}
                {!!p.notes && <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 19 }}>{p.notes}</Text>}
              </Card>

              <SectionTitle title="Today" />
              <Card style={{ paddingVertical: 4 }}>
                {due.length === 0 ? (
                  <Text style={{ padding: 12, fontSize: 13, color: t.textMuted }}>Nothing due today.</Text>
                ) : due.map((task, i) => {
                  const per = slotsOf(task)
                  const mine = times.filter(x => x.task_id === task.id)
                  const last = i === due.length - 1
                  return (
                    <View key={task.id} style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: t.cardBorder, paddingVertical: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary }}>{task.title}</Text>
                          <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                            {freqLabel(task)}{task.ends_on ? ` · until ${fmt(task.ends_on)}` : ''}
                          </Text>
                        </View>
                        {p.source === 'self' && (
                          <TouchableOpacity
                            onPress={() => Alert.alert('Remove goal?', task.title, [
                              { text: 'Keep', style: 'cancel' },
                              { text: 'Remove', style: 'destructive', onPress: async () => {
                                const err = await removeOwnGoal(task.id)
                                if (err) Alert.alert('Could not remove', err); else { haptics.success(); await load() }
                              } },
                            ])}
                            accessibilityRole="button" accessibilityLabel={`Remove ${task.title}`} hitSlop={8}
                            style={{ padding: 4 }}>
                            <Ionicons name="trash-outline" size={16} color={t.textMuted} />
                          </TouchableOpacity>
                        )}
                        {task.cadence !== 'once' && (
                          <TouchableOpacity onPress={() => setEditing(task)} accessibilityRole="button"
                            accessibilityLabel={`Set reminder times for ${task.title}`} hitSlop={8}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Ionicons name={mine.some(x => x.enabled) ? 'alarm' : 'alarm-outline'} size={16}
                              color={mine.some(x => x.enabled) ? t.accent : t.textMuted} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: mine.some(x => x.enabled) ? t.accent : t.textMuted }}>
                              {mine.some(x => x.enabled) ? 'Reminders on' : 'Remind me'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* One box per occurrence, each ticked on its own, with the
                          time beneath it when the patient has set one. */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                        {Array.from({ length: per }).map((_, slot) => {
                          const done = !!doneLog(task, slot)
                          const key = `${task.id}:${slot}`
                          const at = mine.find(x => x.slot === slot)
                          return (
                            <TouchableOpacity key={slot} onPress={() => toggle(p, task, slot)} disabled={busy === key}
                              accessibilityRole="checkbox" accessibilityState={{ checked: done, busy: busy === key }}
                              accessibilityLabel={`${task.title}${per > 1 ? `, ${slot + 1} of ${per}` : ''}${slotWhen(task, at) ? ` — ${slotWhen(task, at)}` : ''}`}
                              style={{ alignItems: 'center', gap: 4, minWidth: 54 }}>
                              <View style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                                borderColor: done ? t.accent : t.cardBorder, backgroundColor: done ? t.accent : 'transparent' }}>
                                {busy === key ? <ActivityIndicator size="small" color={done ? '#FFFFFF' : t.accent} />
                                  : done ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
                              </View>
                              <Text numberOfLines={1} style={{ fontSize: 11, color: done ? t.accent : t.textMuted, fontWeight: done ? '700' : '400' }}>
                                {slotWhen(task, at) || (per > 1 ? `#${slot + 1}` : 'Done')}
                              </Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )
                })}
              </Card>
            </View>
          )
        })}

        {!!plans?.length && (
          <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
            <PrimaryButton label="Add a goal of your own" variant="ghost" icon="add"
              onPress={() => setAdding(true)} />
          </View>
        )}
      </ScrollView>

      {adding && (
        <AddGoalSheet
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await load() }}
        />
      )}

      {editing && (
        <TimesSheet
          task={editing}
          current={times.filter(x => x.task_id === editing.id)}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      )}
    </SafeAreaView>
  )
}

/**
 * Where the patient says *when*. The plan fixed how many times, and the period;
 * these are the days and hours inside it, each silenceable on its own.
 *
 * Half-hour steps rather than a free clock: "08:17" is not a schedule anyone
 * keeps, and a row of 48 options is faster to set than a keyboard.
 */
function TimesSheet({ task, current, onClose, onSaved }: {
  task: Task
  current: TaskTime[]
  onClose: () => void
  onSaved: () => void
}) {
  const { theme: t } = useTheme()
  const per = Math.max(1, task.times_per_period ?? 1)
  const weekly = task.cadence === 'weekly'
  const monthly = task.cadence === 'monthly'

  const [rows, setRows] = useState(() => {
    const dows = defaultDaysOfWeek(per)
    const doms = defaultDaysOfMonth(per)
    return Array.from({ length: per }, (_, slot) => {
      const hit = current.find(c => c.slot === slot)
      return {
        slot,
        time: hit ? hit.time_of_day.slice(0, 5) : defaultTimes(per)[slot] ?? '08:00',
        enabled: hit ? hit.enabled : true,
        dayOfWeek: hit?.day_of_week ?? dows[slot] ?? 1,
        dayOfMonth: hit?.day_of_month ?? doms[slot] ?? 1,
      }
    })
  })
  const [saving, setSaving] = useState(false)

  const patch = (slot: number, p: Partial<(typeof rows)[number]>) =>
    setRows(list => list.map(x => (x.slot === slot ? { ...x, ...p } : x)))

  const OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2), m = i % 2 ? '30' : '00'
    return `${String(h).padStart(2, '0')}:${m}`
  })

  async function save() {
    setSaving(true)
    const err = await setTaskTimes(task.id, rows.map(r => ({
      slot: r.slot,
      timeOfDay: r.time,
      enabled: r.enabled,
      dayOfWeek: weekly ? r.dayOfWeek : null,
      dayOfMonth: monthly ? r.dayOfMonth : null,
    })))
    setSaving(false)
    if (err) { haptics.error(); Alert.alert('Could not save', err); return }
    haptics.success()
    onSaved()
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14, maxHeight: '82%' }}>
          <View style={{ gap: 3 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: t.textPrimary }}>Remind me</Text>
            <Text style={{ fontSize: 13, color: t.textMuted }} numberOfLines={2}>
              {task.title} · {freqLabel(task)}
            </Text>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 16 }}>
            {rows.map((r, i) => (
              <View key={r.slot} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: t.textPrimary }}>
                    {per > 1 ? `${i + 1} of ${per}` : 'When'}
                    {weekly ? ` · ${WEEKDAY_LABELS[r.dayOfWeek - 1]}` : monthly ? ` · ${ordinal(r.dayOfMonth)}` : ''} · {r.time}
                  </Text>
                  <Switch
                    value={r.enabled}
                    onValueChange={v => patch(r.slot, { enabled: v })}
                    trackColor={{ true: t.accent, false: t.cardBorder }}
                  />
                </View>

                {/* Which day, when the period is longer than a day. A weekly or
                    monthly reminder with no day has nothing to ring on. */}
                {weekly && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, opacity: r.enabled ? 1 : 0.45 }}>
                    {WEEKDAY_LABELS.map((lbl, idx) => {
                      const on = r.dayOfWeek === idx + 1
                      return (
                        <TouchableOpacity key={lbl} disabled={!r.enabled}
                          onPress={() => { haptics.tap(); patch(r.slot, { dayOfWeek: idx + 1 }) }}
                          accessibilityRole="button" accessibilityState={{ selected: on }}
                          style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, borderWidth: 1,
                            borderColor: on ? t.accentBorder : t.cardBorder, backgroundColor: on ? t.accentBg : t.inputBg }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: on ? t.accent : t.textMuted }}>{lbl}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}

                {monthly && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ flexGrow: 0, flexShrink: 0, opacity: r.enabled ? 1 : 0.45 }}
                    contentContainerStyle={{ gap: 6 }}>
                    {/* Up to the 28th only, so the reminder happens in February too. */}
                    {Array.from({ length: 28 }, (_, k) => k + 1).map(d => {
                      const on = r.dayOfMonth === d
                      return (
                        <TouchableOpacity key={d} disabled={!r.enabled}
                          onPress={() => { haptics.tap(); patch(r.slot, { dayOfMonth: d }) }}
                          accessibilityRole="button" accessibilityState={{ selected: on }}
                          accessibilityLabel={ordinal(d)}
                          style={{ minWidth: 38, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, borderWidth: 1,
                            borderColor: on ? t.accentBorder : t.cardBorder, backgroundColor: on ? t.accentBg : t.inputBg }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: on ? t.accent : t.textMuted }}>{d}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, flexShrink: 0, opacity: r.enabled ? 1 : 0.45 }}
                  contentContainerStyle={{ gap: 8 }}>
                  {OPTIONS.map(opt => {
                    const on = r.time === opt
                    return (
                      <TouchableOpacity key={opt} disabled={!r.enabled}
                        onPress={() => { haptics.tap(); patch(r.slot, { time: opt }) }}
                        accessibilityRole="button" accessibilityState={{ selected: on }}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1,
                          borderColor: on ? t.accentBorder : t.cardBorder, backgroundColor: on ? t.accentBg : t.inputBg }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? t.accent : t.textMuted }}>{opt}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>
            ))}
          </ScrollView>

          <Text style={{ fontSize: 12, color: t.textMuted, lineHeight: 17 }}>
            Reminders ring on this phone. They keep working without a signal, and
            stop on their own when the plan ends.
          </Text>

          <View style={{ gap: 9 }}>
            <PrimaryButton label={saving ? 'Saving…' : 'Save reminders'} onPress={save} loading={saving} />
            <PrimaryButton label="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

/**
 * A goal the patient sets for themselves -- "no alcohol today", "walk after
 * dinner". It behaves exactly like a prescribed task once saved: ticked the
 * same way, remindable the same way. Only the author differs, and RLS keeps
 * these separate from anything a doctor wrote.
 */
function AddGoalSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { theme: t } = useTheme()
  const [title, setTitle] = useState('')
  const [sched, setSched] = useState<Schedule>({ cadence: 'daily', timesPerPeriod: 1, durationWeeks: null })
  const [saving, setSaving] = useState(false)

  // Starting points, not a fixed menu. Chosen to cover the common shapes: a
  // thing to avoid, a thing to do, and a thing to do several times a day.
  const SUGGESTIONS = [
    'No alcohol today',
    'No smoking today',
    'Walk 30 minutes',
    'Drink 2 litres of water',
    'Take blood pressure reading',
    '30 minutes of exercise',
  ]

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    const err = await addOwnGoal({
      title,
      cadence: sched.cadence,
      timesPerPeriod: sched.timesPerPeriod,
      durationWeeks: sched.durationWeeks,
    })
    setSaving(false)
    if (err) { haptics.error(); Alert.alert('Could not add', err); return }
    haptics.success()
    onSaved()
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 16, maxHeight: '86%' }}>
          <View style={{ gap: 3 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: t.textPrimary }}>Your own goal</Text>
            <Text style={{ fontSize: 13, color: t.textMuted, lineHeight: 18 }}>
              Something you want to hold yourself to. It sits alongside your doctor&apos;s plan
              and only you can see it.
            </Text>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={title} onChangeText={setTitle} autoFocus
              placeholder="e.g. No alcohol today"
              placeholderTextColor={t.textMuted}
              style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map(x => (
                <TouchableOpacity key={x} onPress={() => { haptics.tap(); setTitle(x) }}
                  accessibilityRole="button"
                  style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, borderWidth: 1,
                    borderColor: t.cardBorder, backgroundColor: t.inputBg }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: t.textMuted }}>{x}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <SchedulePicker value={sched} onChange={setSched} />

            <Text style={{ fontSize: 12, color: t.textMuted, lineHeight: 17 }}>
              {durationLabel(sched.durationWeeks) === 'Ongoing'
                ? 'This goal keeps going until you remove it.'
                : 'It stops on its own when the time is up — the ticks you have made stay.'}
              {' '}You can set the days and times, and turn reminders on, once it is added.
            </Text>

          </ScrollView>

          <View style={{ gap: 9 }}>
            <PrimaryButton label={saving ? 'Adding…' : 'Add goal'} onPress={save} loading={saving} disabled={saving || !title.trim()} />
            <PrimaryButton label="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
          </View>
        </View>
      </View>
    </Modal>
  )
}
