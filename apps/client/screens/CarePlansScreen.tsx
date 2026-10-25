import { useCallback, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Switch } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import {
  getTaskTimes, setTaskTimes, syncCarePlanReminders, defaultTimes,
  type ReminderSlot,
} from '@queue/shared/lib/carePlanReminders'
import { haptics } from '@queue/shared/lib/haptics'
import { Header, HeaderTail, Card, SectionTitle, EmptyState, PrimaryButton } from '@queue/shared/components/ui/v3'

interface Props { navigation: any }

// v3.1 My Care > Care plans (p-careplan). Plans come from the hospital (web Care
// Plans); the patient ticks tasks here. Each tick is one care_plan_task_logs row
// (RLS: own active plans, today or yesterday, within the plan's dates), timed by
// the server. Caretakers see the plans of whoever they're managing.

type Cadence = 'daily' | 'weekly' | 'once'
interface Task { id: string; title: string; cadence: Cadence; due_on: string | null; sort_order: number; times_per_day: number }
interface Plan {
  id: string; title: string; condition: string | null; notes: string | null; starts_on: string; ends_on: string | null
  next_check_in: string | null; hospital: { name: string } | null; doctor: { full_name: string | null } | null; tasks: Task[]
}
interface Log { id: string; task_id: string; plan_id: string; done_on: string; slot: number }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// Monday of this week, so "weekly" means once per calendar week.
function weekStart(): string {
  const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d)
}

export function CarePlansScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [times, setTimes] = useState<{ id: string; task_id: string; slot: number; time_of_day: string; enabled: boolean }[]>([])
  const [editing, setEditing] = useState<Task | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const today = ymd(new Date())
  const monday = weekStart()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('care_plans')
      .select('id, title, condition, notes, starts_on, ends_on, next_check_in, hospital:hospitals(name), doctor:doctors(full_name), tasks:care_plan_tasks(id, title, cadence, due_on, sort_order, times_per_day)')
      .eq('status', 'active').order('created_at', { ascending: false })
    if (error) { setPlans([]); setRefreshing(false); return }
    const ps = ((data ?? []) as any[]).map(p => ({ ...p, tasks: (p.tasks ?? []).sort((a: Task, b: Task) => a.sort_order - b.sort_order) })) as Plan[]
    setPlans(ps)
    if (ps.length) {
      const { data: l } = await supabase.from('care_plan_task_logs').select('id, task_id, plan_id, done_on, slot')
        .in('plan_id', ps.map(p => p.id)).gte('done_on', monday)
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
          }
        })
        .filter(Boolean) as ReminderSlot[]
      syncCarePlanReminders(slots).catch(() => {})
    } else { setLogs([]); setTimes([]) }
    setRefreshing(false)
  }, [monday])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // What "done" means for each cadence, for one occurrence of the current
  // period. A three-times-a-day task has three of these, ticked separately.
  const doneLog = (task: Task, slot = 0) => {
    if (task.cadence === 'daily') return logs.find(l => l.task_id === task.id && l.done_on === today && l.slot === slot)
    if (task.cadence === 'weekly') return logs.find(l => l.task_id === task.id && l.done_on >= monday)
    return logs.find(l => l.task_id === task.id)
  }
  const slotsOf = (task: Task) => (task.cadence === 'daily' ? Math.max(1, task.times_per_day ?? 1) : 1)
  // Tasks to show today: dailies, weeklies, and one-offs due today or overdue and not done.
  const todaysTasks = (p: Plan) => p.tasks.filter(task => task.cadence !== 'once' || (task.due_on != null && task.due_on <= today))

  async function toggle(plan: Plan, task: Task, slot = 0) {
    if (busy) return
    setBusy(`${task.id}:${slot}`)
    const existing = doneLog(task, slot)
    if (existing && existing.done_on >= ymd(new Date(Date.now() - 86_400_000))) {
      const { error } = await supabase.from('care_plan_task_logs').delete().eq('id', existing.id)
      if (error) Alert.alert('Could not update', error.message)
    } else if (!existing) {
      const { error } = await supabase.from('care_plan_task_logs').insert({ task_id: task.id, plan_id: plan.id, slot })
      if (error) Alert.alert('Could not tick', 'Try again in a moment.')
      else haptics.success()
    }
    await load()
    setBusy(null)
  }

  // This week's progress: ticks done against what the week asks for so far.
  const weekProgress = (p: Plan) => {
    const start = [monday, p.starts_on].sort()[1]
    const days = Math.max(0, Math.round((new Date(today).getTime() - new Date(start).getTime()) / 86_400_000) + 1)
    let expected = 0, done = 0
    for (const task of p.tasks) {
      const tl = logs.filter(l => l.task_id === task.id && l.done_on >= start)
      if (task.cadence === 'daily') { const per = slotsOf(task); expected += days * per; done += Math.min(days * per, tl.length) }
      else if (task.cadence === 'weekly') { expected += 1; done += tl.length ? 1 : 0 }
      else if (task.due_on && task.due_on >= start && task.due_on <= today) { expected += 1; done += logs.some(l => l.task_id === task.id) ? 1 : 0 }
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
          <View style={{ padding: 20 }}>
            <EmptyState icon="checkbox-outline" title="No care plan yet"
              body="Care plans are set by your hospital or doctor after a visit, for things like blood pressure, diabetes or recovery. When they create one, it appears here." />
          </View>
        ) : plans.map(p => {
          const pct = weekProgress(p)
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
                    <View accessibilityLabel={`${pct} percent done this week`} style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: t.accent }}>{pct}%</Text>
                      <Text style={{ fontSize: 11, color: t.textMuted }}>this week</Text>
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
                            {task.cadence === 'daily'
                              ? (per > 1 ? `${per} times a day` : 'Every day')
                              : task.cadence === 'weekly' ? 'Once this week' : `Due ${task.due_on ? fmt(task.due_on) : ''}`}
                          </Text>
                        </View>
                        {task.cadence === 'daily' && (
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
                              accessibilityLabel={`${task.title}${per > 1 ? `, dose ${slot + 1} of ${per}` : ''}${at ? ` at ${at.time_of_day.slice(0, 5)}` : ''}`}
                              style={{ alignItems: 'center', gap: 4, minWidth: 54 }}>
                              <View style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                                borderColor: done ? t.accent : t.cardBorder, backgroundColor: done ? t.accent : 'transparent' }}>
                                {busy === key ? <ActivityIndicator size="small" color={done ? '#FFFFFF' : t.accent} />
                                  : done ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
                              </View>
                              <Text style={{ fontSize: 11, color: done ? t.accent : t.textMuted, fontWeight: done ? '700' : '400' }}>
                                {at ? at.time_of_day.slice(0, 5) : per > 1 ? `#${slot + 1}` : 'Done'}
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
      </ScrollView>

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
 * Where the patient says *when*. The doctor fixed how many times a day; these
 * are the hours, and each one can be silenced without losing the time.
 *
 * Half-hour steps rather than a free clock: "08:17" is not a schedule anyone
 * keeps, and a wheel of 48 options is faster to set than a keyboard.
 */
function TimesSheet({ task, current, onClose, onSaved }: {
  task: Task
  current: { slot: number; time_of_day: string; enabled: boolean }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { theme: t } = useTheme()
  const per = Math.max(1, task.times_per_day ?? 1)

  const [rows, setRows] = useState(() =>
    Array.from({ length: per }, (_, slot) => {
      const hit = current.find(c => c.slot === slot)
      return {
        slot,
        time: hit ? hit.time_of_day.slice(0, 5) : defaultTimes(per)[slot] ?? '08:00',
        enabled: hit ? hit.enabled : true,
      }
    }))
  const [saving, setSaving] = useState(false)

  const OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2), m = i % 2 ? '30' : '00'
    return `${String(h).padStart(2, '0')}:${m}`
  })

  async function save() {
    setSaving(true)
    const err = await setTaskTimes(task.id, rows.map(r => ({ slot: r.slot, timeOfDay: r.time, enabled: r.enabled })))
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
              {task.title}{per > 1 ? ` · ${per} times a day` : ''}
            </Text>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 16 }}>
            {rows.map((r, i) => (
              <View key={r.slot} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: t.textPrimary }}>
                    {per > 1 ? `Dose ${i + 1}` : 'Time'} · {r.time}
                  </Text>
                  <Switch
                    value={r.enabled}
                    onValueChange={v => setRows(list => list.map(x => x.slot === r.slot ? { ...x, enabled: v } : x))}
                    trackColor={{ true: t.accent, false: t.cardBorder }}
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, flexShrink: 0, opacity: r.enabled ? 1 : 0.45 }}
                  contentContainerStyle={{ gap: 8 }}>
                  {OPTIONS.map(opt => {
                    const on = r.time === opt
                    return (
                      <TouchableOpacity key={opt} disabled={!r.enabled}
                        onPress={() => { haptics.tap(); setRows(list => list.map(x => x.slot === r.slot ? { ...x, time: opt } : x)) }}
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
