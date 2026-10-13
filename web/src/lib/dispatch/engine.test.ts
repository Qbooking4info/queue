import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression for the 2026-10-13 audit M8: exhaustSearch() paged the dispatcher and
// notified the patient whether or not its own status update landed, so concurrent
// callers (sweeper + decline + deadline) duplicated both — and a request still in
// 'requested' was never moved to no_unit_available at all.

vi.mock('server-only', () => ({}))
vi.mock('./alert-relay', () => ({
  raiseDispatchAlert: vi.fn(async (db: { alerts: unknown[] }, alert: unknown) => { db.alerts.push(alert) }),
  relayDispatchAlert: vi.fn(async () => {}),
}))

type Row = { id: string; status: string; request_type: string; triage_level: number; requester_id: string }

function makeDb(row: Row) {
  const db: Record<string, unknown> & { alerts: unknown[]; notifications: unknown[] } = { alerts: [], notifications: [] }
  db.rpc = vi.fn(async () => ({ data: null, error: null }))
  db.from = vi.fn((table: string) => {
    if (table === 'notifications') return { insert: vi.fn(async (r: unknown) => { db.notifications.push(r); return { error: null } }) }
    // transport_requests
    const q: Record<string, unknown> = {}
    let patch: Partial<Row> | null = null
    let allowed: string[] = []
    q.select = vi.fn(() => q)
    q.eq = vi.fn(() => q)
    q.update = vi.fn((p: Partial<Row>) => { patch = p; return q })
    q.in = vi.fn((_col: string, vals: string[]) => { allowed = vals; return q })
    q.single = vi.fn(async () => ({ data: { ...row }, error: null }))
    // Awaiting the update chain: apply it like Postgres would, atomically.
    q.then = (resolve: (v: unknown) => unknown) => {
      if (patch && allowed.includes(row.status)) {
        Object.assign(row, patch)
        return Promise.resolve({ data: [{ id: row.id }], error: null }).then(resolve)
      }
      return Promise.resolve({ data: [], error: null }).then(resolve)
    }
    return q
  })
  return db
}

const dbRef: { current: ReturnType<typeof makeDb> | null } = { current: null }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbRef.current }))

const { runDispatchRound } = await import('./engine')

describe('exhaustSearch (via runDispatchRound past maxRounds)', () => {
  let row: Row
  beforeEach(() => {
    row = { id: 'r1', status: 'searching', request_type: 'emergency', triage_level: 2, requester_id: 'u1' }
    dbRef.current = makeDb(row)
  })

  it('alerts and notifies exactly once when several callers exhaust the same search', async () => {
    const results = await Promise.all([runDispatchRound('r1', 99), runDispatchRound('r1', 99)])

    expect(row.status).toBe('no_unit_available')
    expect(dbRef.current!.alerts).toHaveLength(1)
    expect(dbRef.current!.notifications).toHaveLength(1)
    expect(results.filter(r => r.exhausted)).toHaveLength(1)
  })

  it('also ends a search whose first round never moved it out of requested', async () => {
    row.status = 'requested'

    const result = await runDispatchRound('r1', 99)

    expect(row.status).toBe('no_unit_available')
    expect(result.exhausted).toBe(true)
    expect(dbRef.current!.alerts).toHaveLength(1)
  })
})
