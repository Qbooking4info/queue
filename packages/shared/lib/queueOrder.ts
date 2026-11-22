/**
 * One ordering rule for every screen that shows a queue.
 *
 * The front desk, the doctor's queue and the doctor's dashboard each had their
 * own copy of this comparison, and all three sorted a null `queue_position` as
 * Infinity. That is right for a patient who has not arrived yet and wrong for
 * the one case that matters most: an OPD patient checks in with no doctor
 * assigned (that is the model -- "a doctor will be assigned when you arrive"),
 * so `renumber_doctor_queue` never runs for them and their position stays null.
 * Sorting them as Infinity put the person who physically walked in first at the
 * very bottom of the list, underneath people who had not turned up at all --
 * on the exact screen the front desk uses to decide who to assign next.
 *
 * Three bands, inside the emergency tier:
 *   0  numbered      -- checked in and renumbered; sort by the number
 *   1  arrived       -- checked in, no doctor yet; sort by when they walked in
 *   2  not yet here  -- sort by appointment start time
 *
 * Keep this in step with the same comparison in
 * web/src/app/api/appointments/queue/route.ts -- web is not in the npm
 * workspace @queue/shared lives in, so it carries its own copy.
 */
export interface QueueOrderable {
  urgency?: string | null
  queue_position?: number | null
  checked_in_at?: string | null
  start_time?: string | null
}

export function queueBand(a: QueueOrderable): 0 | 1 | 2 {
  if (a.queue_position != null) return 0
  if (a.checked_in_at) return 1
  return 2
}

export function compareQueueEntries(a: QueueOrderable, b: QueueOrderable): number {
  const aEmg = a.urgency === 'emergency' ? 0 : 1
  const bEmg = b.urgency === 'emergency' ? 0 : 1
  if (aEmg !== bEmg) return aEmg - bEmg

  const aBand = queueBand(a), bBand = queueBand(b)
  if (aBand !== bBand) return aBand - bBand

  if (aBand === 0) return (a.queue_position as number) - (b.queue_position as number)
  if (aBand === 1) return (a.checked_in_at as string).localeCompare(b.checked_in_at as string)
  return (a.start_time ?? '').localeCompare(b.start_time ?? '')
}
