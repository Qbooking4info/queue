import {
  formatWait, formatQueueStanding, isWaitStale, formatAsOf, WAIT_STALE_AFTER_MS,
} from '../waitTime'

describe('formatWait', () => {
  it('has no opinion when there is no estimate', () => {
    expect(formatWait(null)).toBeNull()
    expect(formatWait(undefined)).toBeNull()
    expect(formatWait(NaN)).toBeNull()
    expect(formatWait(-1)).toBeNull()
  })

  it('stops counting minutes once the wait is in hours', () => {
    // The specific failure this replaces: "~127m" on the patient's card.
    expect(formatWait(127)).toBe('About 2 to 2½ hours')
    expect(formatWait(97)).toBe('About 1½ to 2 hours')
    expect(formatWait(60)).toBe('About 1 to 1½ hours')
    expect(formatWait(185)).toBe('About 3 to 3½ hours')
  })

  it('never promises sooner than the estimate', () => {
    for (const m of [60, 75, 90, 119, 120, 240]) {
      const text = formatWait(m)!
      const lower = parseFloat(text.replace('About ', '').split(' to ')[0].replace('½', '.5'))
      expect(lower * 60).toBeLessThanOrEqual(m)
    }
  })

  it('keeps short waits in minutes, rounded off the stopwatch', () => {
    expect(formatWait(0)).toBe('Any moment now')
    expect(formatWait(4)).toBe('Any moment now')
    expect(formatWait(12)).toBe('About 10–15 min')
    expect(formatWait(59)).toBe('About 55–60 min')
  })
})

describe('formatQueueStanding', () => {
  it('explains the queue instead of printing a rank', () => {
    expect(formatQueueStanding(0)).toBe("You're next")
    expect(formatQueueStanding(1)).toBe('1 person ahead of you')
    expect(formatQueueStanding(4)).toBe('4 people ahead of you')
  })

  it('names emergencies, so a legitimate jump does not look purchased', () => {
    expect(formatQueueStanding(3, 1)).toBe('3 people ahead of you, including an emergency case')
    expect(formatQueueStanding(5, 2)).toBe('5 people ahead of you, including 2 emergency cases')
    expect(formatQueueStanding(3, 0)).toBe('3 people ahead of you')
  })

  it('admits when it does not know', () => {
    expect(formatQueueStanding(null)).toBe('Checking the queue…')
  })
})

describe('staleness', () => {
  const now = Date.parse('2026-10-31T11:42:00Z')

  it('treats a missing or unparseable stamp as stale', () => {
    expect(isWaitStale(null, now)).toBe(true)
    expect(isWaitStale('not a date', now)).toBe(true)
  })

  it('goes stale once the poll has clearly stopped', () => {
    expect(isWaitStale(new Date(now - 10_000).toISOString(), now)).toBe(false)
    expect(isWaitStale(new Date(now - WAIT_STALE_AFTER_MS - 1).toISOString(), now)).toBe(true)
  })

  it('stamps the time the figures were true', () => {
    expect(formatAsOf('2026-10-31T11:42:00Z')).toMatch(/^as of \d{2}:\d{2}$/)
    expect(formatAsOf(null)).toBeNull()
  })
})
