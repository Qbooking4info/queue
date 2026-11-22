/**
 * How a waiting patient is told how long they have left.
 *
 * The estimate itself is computed in SQL (renumber_doctor_queue). This module
 * only decides how to say it, and that turns out to matter as much as the
 * arithmetic:
 *
 * - Nigerian outpatient waits run to 97 minutes at ABUTH Zaria and "2-3 hours
 *   and above" under manual appointment systems. At that scale a figure like
 *   "127m" invites the patient to time us and catch us wrong, while "about 2
 *   to 2 1/2 hours" is both easier to act on and honest about its own
 *   precision. We do not have minute-level accuracy, so we should not print a
 *   minute-level number.
 * - The band is deliberately asymmetric around the estimate: it runs from the
 *   estimate's own half-hour floor upwards, never below it. A patient who is
 *   seen earlier than promised is pleased; one who is seen later than a
 *   promise feels lied to, and the published argument for patient-facing wait
 *   models is that they must not under-estimate.
 *
 * Nothing here is clinical and nothing here is stored -- change the wording
 * freely, but keep the never-under-promise property.
 */

/** The estimate is stale after this long; the UI should say so rather than imply it is live. */
export const WAIT_STALE_AFTER_MS = 90_000

function halves(n: number): string {
  const whole = Math.floor(n)
  const half = n - whole >= 0.5
  if (whole === 0) return '½'
  return half ? `${whole}½` : `${whole}`
}

/**
 * Renders an estimated wait in minutes as copy a waiting patient can act on.
 * Returns null when there is no estimate, so callers can choose their own
 * placeholder instead of printing a fake one.
 */
export function formatWait(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null
  if (minutes < 5) return 'Any moment now'
  if (minutes < 60) {
    // Still minute-scale, but rounded to 5 so it does not read as a stopwatch.
    const lower = Math.floor(minutes / 5) * 5
    return `About ${Math.max(lower, 5)}–${lower + 5} min`
  }
  const hours = minutes / 60
  const lower = Math.floor(hours * 2) / 2
  return `About ${halves(lower)} to ${halves(lower + 0.5)} hours`
}

/**
 * The queue in words rather than as a single rank.
 *
 * A bare position number is the thing that makes a legitimate queue change
 * look like a purchased jump: the patient sees 4 become 5 and has no way to
 * learn that an emergency arrived. Naming the emergencies separately is the
 * cheapest available answer -- the movement still happens, but it is now
 * explained rather than suspicious.
 */
export function formatQueueStanding(
  aheadOfYou: number | null | undefined,
  emergenciesAhead?: number | null,
): string {
  if (aheadOfYou == null || aheadOfYou < 0) return 'Checking the queue…'
  if (aheadOfYou === 0) return "You're next"
  const people = aheadOfYou === 1 ? '1 person ahead of you' : `${aheadOfYou} people ahead of you`
  const emg = emergenciesAhead ?? 0
  if (emg <= 0) return people
  const cases = emg === 1 ? 'an emergency case' : `${emg} emergency cases`
  return `${people}, including ${cases}`
}

/** True when the figures on screen are old enough that we should say so. */
export function isWaitStale(asOf: string | null | undefined, now: number = Date.now()): boolean {
  if (!asOf) return true
  const t = Date.parse(asOf)
  return !Number.isFinite(t) || now - t > WAIT_STALE_AFTER_MS
}

/** "as of 11:42" -- so a frozen screen cannot be mistaken for a live one. */
export function formatAsOf(asOf: string | null | undefined): string | null {
  if (!asOf) return null
  const t = new Date(asOf)
  if (Number.isNaN(t.getTime())) return null
  return `as of ${t.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
