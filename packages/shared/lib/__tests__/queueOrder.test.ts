import { compareQueueEntries, queueBand } from '../queueOrder'

// An OPD patient checks in with no doctor assigned, so renumber_doctor_queue
// never runs for them and queue_position stays null. Every queue screen sorted
// null as Infinity, which put the person who arrived FIRST at the bottom of the
// front desk's list -- below people who had not turned up at all.
const numbered = (p: number, extra: Record<string, unknown> = {}) =>
  ({ queue_position: p, checked_in_at: '2026-11-10T08:00:00Z', start_time: '09:00', ...extra })
const arrived = (at: string, extra: Record<string, unknown> = {}) =>
  ({ queue_position: null, checked_in_at: at, start_time: '09:00', ...extra })
const expected = (time: string) =>
  ({ queue_position: null, checked_in_at: null, start_time: time })

const order = (rows: Record<string, unknown>[]) => [...rows].sort(compareQueueEntries)

describe('queue bands', () => {
  it('separates numbered, arrived and not-yet-here', () => {
    expect(queueBand(numbered(1))).toBe(0)
    expect(queueBand(arrived('2026-11-10T08:10:00Z'))).toBe(1)
    expect(queueBand(expected('10:30'))).toBe(2)
  })
})

describe('compareQueueEntries', () => {
  it('puts a patient who has arrived above one who has not', () => {
    const late = arrived('2026-11-10T11:00:00Z')
    const early = expected('08:00')
    expect(order([early, late])[0]).toBe(late)
  })

  it('orders arrived-but-unassigned patients by when they walked in', () => {
    const a = arrived('2026-11-10T08:05:00Z')
    const b = arrived('2026-11-10T08:01:00Z')
    const c = arrived('2026-11-10T08:30:00Z')
    expect(order([a, b, c]).map(r => r.checked_in_at))
      .toEqual(['2026-11-10T08:01:00Z', '2026-11-10T08:05:00Z', '2026-11-10T08:30:00Z'])
  })

  it('keeps numbered patients ahead of unnumbered ones', () => {
    const n = numbered(9)
    const a = arrived('2026-11-10T06:00:00Z')
    expect(order([a, n])[0]).toBe(n)
  })

  it('sorts numbered patients by their number', () => {
    expect(order([numbered(3), numbered(1), numbered(2)]).map(r => r.queue_position))
      .toEqual([1, 2, 3])
  })

  it('puts an emergency first whatever band it is in', () => {
    const emergency = arrived('2026-11-10T12:00:00Z', { urgency: 'emergency' })
    const routine = numbered(1)
    expect(order([routine, emergency])[0]).toBe(emergency)
  })

  it('still orders within the emergency tier', () => {
    const e1 = numbered(2, { urgency: 'emergency' })
    const e2 = numbered(1, { urgency: 'emergency' })
    expect(order([e1, e2])[0]).toBe(e2)
  })

  it('falls back to start time for people who have not arrived', () => {
    expect(order([expected('11:00'), expected('09:30')]).map(r => r.start_time))
      .toEqual(['09:30', '11:00'])
  })
})
