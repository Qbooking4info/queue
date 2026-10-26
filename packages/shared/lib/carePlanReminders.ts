import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

/**
 * Care plan reminders, scheduled on the device.
 *
 * Local notifications rather than push: a reminder to take medication at 08:00
 * has to fire whether or not the phone has a signal, and nothing about it needs
 * the server. The times live in the database so they survive a reinstall; the
 * schedule is rebuilt from them whenever the plans are loaded.
 */

const CHANNEL = 'care-plan'

/** Android routes sound and importance through a channel, so one has to exist. */
export async function ensureCarePlanChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Care plan reminders',
    // HIGH, not MAX: this should wake the screen and make a sound, but it is a
    // reminder to drink water or take a tablet, not an emergency. MAX is
    // reserved in this app for an ambulance being dispatched.
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    showBadge: true,
  })
}

/** Which period the count is against. 'once' is a dated one-off. */
export type CarePlanPeriod = 'daily' | 'weekly' | 'monthly' | 'once'

export interface ReminderSlot {
  taskId: string
  planId: string
  title: string
  slot: number
  /** 'HH:MM' or 'HH:MM:SS' as stored. */
  timeOfDay: string
  enabled: boolean
  cadence: CarePlanPeriod
  /** ISO weekday, 1 = Monday. Set for a weekly task. */
  dayOfWeek?: number | null
  /** 1-28. Set for a monthly task. */
  dayOfMonth?: number | null
  /** Last day the task is asked for; null runs as long as the plan does. */
  endsOn?: string | null
}

function parseTime(t: string): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})/.exec(t)
  if (!m) return null
  const hour = Number(m[1]), minute = Number(m[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/** Stable id so a reschedule replaces the right notification rather than stacking. */
const idFor = (s: ReminderSlot) => `careplan:${s.taskId}:${s.slot}`

/**
 * The repeat rule for one occurrence.
 *
 * A weekly or monthly task cannot use a daily trigger -- it would ring every
 * day, which is how a reminder earns being switched off. Each period gets the
 * trigger that actually repeats on it, and a slot missing the day it needs is
 * skipped rather than scheduled wrongly.
 */
function triggerFor(
  s: ReminderSlot,
  at: { hour: number; minute: number },
): Notifications.NotificationTriggerInput | null {
  const channelId = CHANNEL

  if (s.cadence === 'weekly') {
    if (!s.dayOfWeek) return null
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      // Expo counts weekdays from Sunday = 1; the database stores ISO, Monday = 1.
      weekday: (s.dayOfWeek % 7) + 1,
      hour: at.hour, minute: at.minute, channelId,
    } as Notifications.WeeklyTriggerInput
  }

  if (s.cadence === 'monthly') {
    if (!s.dayOfMonth) return null
    return {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: s.dayOfMonth, hour: at.hour, minute: at.minute, channelId,
    } as Notifications.MonthlyTriggerInput
  }

  // A one-off has a due date, not a repeat; it is reminded by the plan, not here.
  if (s.cadence === 'once') return null

  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: at.hour, minute: at.minute, channelId,
  } as Notifications.DailyTriggerInput
}

/**
 * Rebuild the device's care-plan reminders from the given slots.
 *
 * Everything this app scheduled is cleared first, so a task the doctor stopped,
 * or a time the patient removed, cannot keep firing. Other notifications the
 * app schedules are left alone -- they are matched by the `careplan:` prefix.
 */
export async function syncCarePlanReminders(slots: ReminderSlot[]): Promise<number> {
  const perm = await Notifications.getPermissionsAsync()
  if (!perm.granted) {
    const asked = await Notifications.requestPermissionsAsync()
    if (!asked.granted) return 0
  }

  await ensureCarePlanChannel()

  const existing = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    existing
      .filter(n => typeof n.identifier === 'string' && n.identifier.startsWith('careplan:'))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  )

  const today = new Date().toISOString().slice(0, 10)

  let scheduled = 0
  for (const s of slots) {
    if (!s.enabled) continue
    // A finished task keeps its history but stops asking. Without this, a
    // one-week course of antibiotics would go on ringing for good.
    if (s.endsOn && s.endsOn < today) continue
    const at = parseTime(s.timeOfDay)
    if (!at) continue
    try {
      const trigger = triggerFor(s, at)
      if (!trigger) continue
      await Notifications.scheduleNotificationAsync({
        identifier: idFor(s),
        content: {
          title: 'Care plan',
          body: s.title,
          sound: 'default',
          data: { type: 'care_plan', planId: s.planId, taskId: s.taskId, slot: s.slot },
        },
        trigger,
      })
      scheduled++
    } catch {
      // One bad slot must not stop the rest being scheduled.
    }
  }
  return scheduled
}

/** Clear every care-plan reminder, e.g. on sign-out. */
export async function clearCarePlanReminders() {
  const existing = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    existing
      .filter(n => typeof n.identifier === 'string' && n.identifier.startsWith('careplan:'))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  )
}

// ── the patient's chosen times ────────────────────────────────────────────────

/** Sensible defaults when a patient first turns a task's reminders on. */
export function defaultTimes(timesPerPeriod: number): string[] {
  const presets: Record<number, string[]> = {
    1: ['08:00'],
    2: ['08:00', '20:00'],
    3: ['08:00', '14:00', '20:00'],
    4: ['08:00', '12:00', '16:00', '20:00'],
  }
  if (presets[timesPerPeriod]) return presets[timesPerPeriod]
  // Spread the rest evenly across a waking day rather than round the clock.
  const start = 8, end = 21
  const step = (end - start) / Math.max(1, timesPerPeriod - 1)
  return Array.from({ length: timesPerPeriod }, (_, i) => {
    const h = Math.round(start + step * i)
    return `${String(Math.min(h, 23)).padStart(2, '0')}:00`
  })
}

/**
 * Default weekdays for a task happening n times a week, spread apart.
 *
 * Twice a week defaults to Monday and Thursday, not Monday and Tuesday: a goal
 * is easier to keep when its occurrences are not back to back.
 */
export function defaultDaysOfWeek(timesPerPeriod: number): number[] {
  const n = Math.min(7, Math.max(1, timesPerPeriod))
  return Array.from({ length: n }, (_, i) => Math.round((i * 7) / n) + 1)
}

/** Default days of the month, spread over the first 28 so February works too. */
export function defaultDaysOfMonth(timesPerPeriod: number): number[] {
  const n = Math.min(28, Math.max(1, timesPerPeriod))
  return Array.from({ length: n }, (_, i) => Math.round((i * 28) / n) + 1)
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function getTaskTimes(taskIds: string[]) {
  if (!taskIds.length) return []
  const { data } = await supabase
    .from('care_plan_task_times')
    .select('id, task_id, slot, time_of_day, enabled, day_of_week, day_of_month')
    .in('task_id', taskIds)
    .order('slot')
  return data ?? []
}

export interface TaskTimeInput {
  slot: number
  timeOfDay: string
  enabled?: boolean
  dayOfWeek?: number | null
  dayOfMonth?: number | null
}

/** Replace a task's times. Upserted on (task_id, slot) so ids stay stable. */
export async function setTaskTimes(taskId: string, times: TaskTimeInput[]): Promise<string | null> {
  const { error: delErr } = await supabase
    .from('care_plan_task_times')
    .delete()
    .eq('task_id', taskId)
    .gte('slot', times.length)
  if (delErr) return delErr.message

  if (!times.length) return null

  const { error } = await supabase.from('care_plan_task_times').upsert(
    times.map(t => ({
      task_id: taskId,
      slot: t.slot,
      time_of_day: t.timeOfDay.length === 5 ? `${t.timeOfDay}:00` : t.timeOfDay,
      enabled: t.enabled ?? true,
      day_of_week: t.dayOfWeek ?? null,
      day_of_month: t.dayOfMonth ?? null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'task_id,slot' },
  )
  return error?.message ?? null
}

// ── the patient's own goals ──────────────────────────────────────────────────
//
// Goals the patient sets for themselves -- "no alcohol today", "walk after
// dinner" -- kept in a care plan of their own with source='self'. They tick,
// log and remind exactly like a prescribed task; only the author differs.
//
// Everything here is scoped by RLS to the caller's own self-authored plan, so
// none of it can reach a plan a doctor wrote.

const OWN_GOALS_TITLE = 'My own goals'

/** The patient's goal list, created the first time they add something. */
export async function getOrCreateOwnGoalPlan(): Promise<{ id: string } | { error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }

  const { data: me } = await supabase.from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (!me) return { error: 'Profile not found.' }

  const { data: existing } = await supabase
    .from('care_plans')
    .select('id')
    .eq('patient_id', me.id)
    .eq('source', 'self')
    .eq('status', 'active')
    .maybeSingle()
  if (existing) return { id: existing.id }

  const { data: made, error } = await supabase
    .from('care_plans')
    .insert({
      patient_id: me.id,
      title: OWN_GOALS_TITLE,
      starts_on: new Date().toISOString().slice(0, 10),
      source: 'self',
      created_by: me.id,
    } as never)
    .select('id')
    .single()

  if (error || !made) return { error: error?.message ?? 'Could not start your goal list.' }
  return { id: made.id }
}

/** The ceiling on occurrences for each period, matching the column's CHECK. */
export const MAX_PER_PERIOD: Record<CarePlanPeriod, number> = {
  daily: 12, weekly: 7, monthly: 31, once: 1,
}

export function clampPerPeriod(cadence: CarePlanPeriod, n: number): number {
  const max = MAX_PER_PERIOD[cadence] ?? 1
  if (!Number.isFinite(n)) return 1
  return Math.min(max, Math.max(1, Math.round(n)))
}

/** The last day a task running `weeks` from today is asked for. */
export function endsOnInWeeks(weeks: number | null): string | null {
  if (weeks == null) return null
  const d = new Date()
  // Inclusive of today: "1 week" is seven days, today being the first.
  d.setDate(d.getDate() + weeks * 7 - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function addOwnGoal(input: {
  title: string
  cadence: CarePlanPeriod
  timesPerPeriod?: number
  /** How many weeks it runs for. Null or omitted means ongoing. */
  durationWeeks?: number | null
}): Promise<string | null> {
  const plan = await getOrCreateOwnGoalPlan()
  if ('error' in plan) return plan.error

  const { data: last } = await supabase
    .from('care_plan_tasks').select('sort_order')
    .eq('plan_id', plan.id).order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { error } = await supabase.from('care_plan_tasks').insert({
    plan_id: plan.id,
    title: input.title.trim().slice(0, 160),
    cadence: input.cadence,
    // Clamped here so the column's CHECK, which caps each period differently,
    // never has to answer with a database error the patient cannot read.
    times_per_period: clampPerPeriod(input.cadence, input.timesPerPeriod ?? 1),
    ends_on: endsOnInWeeks(input.durationWeeks ?? null),
    sort_order: (last?.sort_order ?? -1) + 1,
  } as never)

  return error?.message ?? null
}

/**
 * Remove one of the patient's own goals. RLS refuses this for a prescribed
 * task, so a mistyped id cannot delete something a doctor set.
 */
export async function removeOwnGoal(taskId: string): Promise<string | null> {
  const { error } = await supabase.from('care_plan_tasks').delete().eq('id', taskId)
  return error?.message ?? null
}
