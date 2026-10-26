// Care plan progress, shared by /api/care-plans routes.
//
// Adherence over a window = ticks logged / ticks expected. What a task expects
// is its count against its own period: `times_per_period` every day, every
// week, or every month. A one-off expects one tick if it fell in the window.

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'once'
export interface PlanTask {
  id: string
  title: string
  cadence: Cadence
  due_on: string | null
  sort_order: number
  /** How many times within one period. Older rows predate the column. */
  times_per_period?: number | null
  /** Last day the task is asked for; null runs as long as the plan does. */
  ends_on?: string | null
}
export interface TaskLog { task_id: string; done_on: string; done_at: string }

const DAY = 86_400_000
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The ceiling on occurrences per period, mirroring the column's CHECK.
 *
 * The routes clamp to it so a number over the top comes back as a saved plan
 * with a sane count, rather than a 500 from a constraint the caller cannot see.
 */
export const MAX_PER_PERIOD: Record<Cadence, number> = { daily: 12, weekly: 7, monthly: 31, once: 1 }

/** A task may run for at most a year, whatever the client asks for. */
export const MAX_DURATION_WEEKS = 52

/**
 * The last day a task running `weeks` from `startsOn` is asked for, or null
 * for a task that runs as long as its plan. Inclusive of the start day: one
 * week beginning Monday ends the following Sunday.
 */
export function endsOnFrom(startsOn: string, weeks: unknown): string | null {
  const n = Math.round(Number(weeks))
  if (!Number.isFinite(n) || n < 1) return null
  const d = new Date(`${startsOn}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + Math.min(MAX_DURATION_WEEKS, n) * 7 - 1)
  return isoDay(d)
}

/** Whole periods a window of `span` days covers, at least one. */
function periodsIn(cadence: Cadence, span: number): number {
  if (cadence === 'daily') return span
  if (cadence === 'weekly') return Math.ceil(span / 7)
  if (cadence === 'monthly') return Math.ceil(span / 30)
  return 1
}

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
    // A finished task is not owed anything for the days after it ended, so the
    // window is clipped to it -- otherwise a kept one-week course would drag
    // the plan's adherence down for every week that followed.
    const tEnd = t.ends_on && t.ends_on < winEnd ? t.ends_on : winEnd
    if (tEnd < winStart) continue
    const tSpan = Math.round((new Date(tEnd).getTime() - new Date(winStart).getTime()) / DAY) + 1
    const tLogs = logs.filter(l => l.task_id === t.id && l.done_on >= winStart && l.done_on <= tEnd)
    if (t.cadence === 'once') {
      if (t.due_on && t.due_on >= winStart && t.due_on <= tEnd) { expected += 1; done += tLogs.length ? 1 : 0 }
      continue
    }
    // Twice a week over a two-week window expects four ticks, not two. Without
    // the count, every multi-occurrence task read as fully kept on one tick.
    const want = periodsIn(t.cadence, tSpan) * Math.max(1, t.times_per_period ?? 1)
    expected += want
    done += Math.min(want, tLogs.length)
  }
  return { expected, done, pct: expected ? Math.round((done / expected) * 100) : null }
}
