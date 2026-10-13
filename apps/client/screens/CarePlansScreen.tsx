import { useCallback, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { Header, HeaderTail, Card, SectionTitle, EmptyState } from '@queue/shared/components/ui/v3'

interface Props { navigation: any }

// v3.1 My Care > Care plans (p-careplan). Plans come from the hospital (web Care
// Plans); the patient ticks tasks here. Each tick is one care_plan_task_logs row
// (RLS: own active plans, today or yesterday, within the plan's dates), timed by
// the server. Caretakers see the plans of whoever they're managing.

type Cadence = 'daily' | 'weekly' | 'once'
interface Task { id: string; title: string; cadence: Cadence; due_on: string | null; sort_order: number }
interface Plan {
  id: string; title: string; condition: string | null; notes: string | null; starts_on: string; ends_on: string | null
  next_check_in: string | null; hospital: { name: string } | null; doctor: { full_name: string | null } | null; tasks: Task[]
}
interface Log { id: string; task_id: string; plan_id: string; done_on: string }

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
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const today = ymd(new Date())
  const monday = weekStart()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('care_plans')
      .select('id, title, condition, notes, starts_on, ends_on, next_check_in, hospital:hospitals(name), doctor:doctors(full_name), tasks:care_plan_tasks(id, title, cadence, due_on, sort_order)')
      .eq('status', 'active').order('created_at', { ascending: false })
    if (error) { setPlans([]); setRefreshing(false); return }
    const ps = ((data ?? []) as any[]).map(p => ({ ...p, tasks: (p.tasks ?? []).sort((a: Task, b: Task) => a.sort_order - b.sort_order) })) as Plan[]
    setPlans(ps)
    if (ps.length) {
      const { data: l } = await supabase.from('care_plan_task_logs').select('id, task_id, plan_id, done_on')
        .in('plan_id', ps.map(p => p.id)).gte('done_on', monday)
      setLogs((l ?? []) as Log[])
    } else setLogs([])
    setRefreshing(false)
  }, [monday])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // What "done" means for each cadence, for the current period.
  const doneLog = (task: Task) => {
    if (task.cadence === 'daily') return logs.find(l => l.task_id === task.id && l.done_on === today)
    if (task.cadence === 'weekly') return logs.find(l => l.task_id === task.id && l.done_on >= monday)
    return logs.find(l => l.task_id === task.id)
  }
  // Tasks to show today: dailies, weeklies, and one-offs due today or overdue and not done.
  const todaysTasks = (p: Plan) => p.tasks.filter(task => task.cadence !== 'once' || (task.due_on != null && task.due_on <= today))

  async function toggle(plan: Plan, task: Task) {
    if (busy) return
    setBusy(task.id)
    const existing = doneLog(task)
    if (existing && existing.done_on >= ymd(new Date(Date.now() - 86_400_000))) {
      const { error } = await supabase.from('care_plan_task_logs').delete().eq('id', existing.id)
      if (error) Alert.alert('Could not update', error.message)
    } else if (!existing) {
      const { error } = await supabase.from('care_plan_task_logs').insert({ task_id: task.id, plan_id: plan.id, done_on: today })
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
      if (task.cadence === 'daily') { expected += days; done += Math.min(days, tl.length) }
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
                  const done = !!doneLog(task)
                  return (
                    <TouchableOpacity key={task.id} onPress={() => toggle(p, task)} disabled={busy === task.id}
                      accessibilityRole="checkbox" accessibilityState={{ checked: done, busy: busy === task.id }}
                      accessibilityLabel={`${task.title}, ${task.cadence === 'weekly' ? 'this week' : task.cadence === 'once' ? 'one-off' : 'today'}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10,
                        borderBottomWidth: i < due.length - 1 ? 1 : 0, borderBottomColor: t.cardBorder }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                        borderColor: done ? t.accent : t.cardBorder, backgroundColor: done ? t.accent : 'transparent' }}>
                        {busy === task.id ? <ActivityIndicator size="small" color={done ? '#FFFFFF' : t.accent} />
                          : done ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary, textDecorationLine: done ? 'line-through' : 'none' }}>{task.title}</Text>
                        <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                          {task.cadence === 'daily' ? 'Every day' : task.cadence === 'weekly' ? 'Once this week' : `Due ${task.due_on ? fmt(task.due_on) : ''}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </Card>
            </View>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}
