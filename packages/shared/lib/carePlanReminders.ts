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

export interface ReminderSlot {
  taskId: string
  planId: string
  title: string
  slot: number
  /** 'HH:MM' or 'HH:MM:SS' as stored. */
  timeOfDay: string
  enabled: boolean
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

  let scheduled = 0
  for (const s of slots) {
    if (!s.enabled) continue
    const at = parseTime(s.timeOfDay)
    if (!at) continue
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: idFor(s),
        content: {
          title: 'Care plan',
          body: s.title,
          sound: 'default',
          data: { type: 'care_plan', planId: s.planId, taskId: s.taskId, slot: s.slot },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: at.hour,
          minute: at.minute,
          channelId: CHANNEL,
        } as Notifications.DailyTriggerInput,
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
export function defaultTimes(timesPerDay: number): string[] {
  const presets: Record<number, string[]> = {
    1: ['08:00'],
    2: ['08:00', '20:00'],
    3: ['08:00', '14:00', '20:00'],
    4: ['08:00', '12:00', '16:00', '20:00'],
  }
  if (presets[timesPerDay]) return presets[timesPerDay]
  // Spread the rest evenly across a waking day rather than round the clock.
  const start = 8, end = 21
  const step = (end - start) / Math.max(1, timesPerDay - 1)
  return Array.from({ length: timesPerDay }, (_, i) => {
    const h = Math.round(start + step * i)
    return `${String(Math.min(h, 23)).padStart(2, '0')}:00`
  })
}

export async function getTaskTimes(taskIds: string[]) {
  if (!taskIds.length) return []
  const { data } = await supabase
    .from('care_plan_task_times')
    .select('id, task_id, slot, time_of_day, enabled')
    .in('task_id', taskIds)
    .order('slot')
  return data ?? []
}

/** Replace a task's times. Upserted on (task_id, slot) so ids stay stable. */
export async function setTaskTimes(
  taskId: string,
  times: { slot: number; timeOfDay: string; enabled?: boolean }[],
): Promise<string | null> {
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

export async function addOwnGoal(input: {
  title: string
  cadence: 'daily' | 'weekly'
  timesPerDay?: number
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
    // Only meaningful daily; a weekly goal happens once when it happens.
    times_per_day: input.cadence === 'daily'
      ? Math.min(12, Math.max(1, Math.round(input.timesPerDay ?? 1)))
      : 1,
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
