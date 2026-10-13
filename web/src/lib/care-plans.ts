// Care plan progress, shared by /api/care-plans routes.
// Adherence over a window = ticks logged / ticks expected, per task cadence:
// daily = one per day, weekly = one per started week, once = one if due in the window.

export type Cadence = 'daily' | 'weekly' | 'once'
export interface PlanTask { id: string; title: string; cadence: Cadence; due_on: string | null; sort_order: number }
export interface TaskLog { task_id: string; done_on: string; done_at: string }

const DAY = 86_400_000
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function adherence(
  tasks: PlanTask[], logs: TaskLog[], plan: { starts_on: string; ends_on: string | null }, days = 7,
  asOf: string = isoDay(new Date()),
): { expected: number; done: number; pct: number | null } {
  const today = asOf
  const winStart = [isoDay(new Date(new Date(asOf + 'T00:00:00Z').getTime() - (days - 1) * DAY)), plan.starts_on].sort()[1]
  const winEnd = plan.ends_on && plan.ends_on < today ? plan.ends_on : today
  if (winEnd < winStart) return { expected: 0, done: 0, pct: null }
  const span = Math.round((new Date(winEnd).getTime() - new Date(winStart).getTime()) / DAY) + 1

  let expected = 0, done = 0
  for (const t of tasks) {
    const tLogs = logs.filter(l => l.task_id === t.id && l.done_on >= winStart && l.done_on <= winEnd)
    if (t.cadence === 'daily') { expected += span; done += Math.min(span, tLogs.length) }
    else if (t.cadence === 'weekly') { const w = Math.ceil(span / 7); expected += w; done += Math.min(w, tLogs.length) }
    else if (t.due_on && t.due_on >= winStart && t.due_on <= winEnd) { expected += 1; done += tLogs.length ? 1 : 0 }
  }
  return { expected, done, pct: expected ? Math.round((done / expected) * 100) : null }
}
