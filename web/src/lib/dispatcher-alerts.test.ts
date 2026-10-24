import { describe, it, expect, vi } from 'vitest'

// REP-017: an alert for a request with no destination hospital matched no reader.
// Hospital scoping now comes from dispatcher_alert_ids_for_hospital(); super admins see all.
vi.mock('server-only', () => ({}))
const { loadDispatcherAlerts, canSeeDispatcherAlert } = await import('./dispatcher-alerts')
type Db = Parameters<typeof loadDispatcherAlerts>[0]
type Q = Record<string, unknown>

function db(ids: string[]) {
  const q: Q = {}
  const calls: Record<string, unknown[]> = {}
  for (const m of ['select', 'in', 'order', 'limit']) q[m] = vi.fn((...a: unknown[]) => { calls[m] = a; return q })
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'x' }], error: null }).then(r)
  const mock = {
    calls,
    from: vi.fn(() => q),
    rpc: vi.fn(async () => ({ data: ids.map(alert_id => ({ alert_id })), error: null })),
  }
  return Object.assign(mock, { db: mock as unknown as Db })
}

describe('dispatcher alert visibility', () => {
  it('scopes a hospital to the ids the database says it may see', async () => {
    const d = db(['a1', 'a2'])
    await loadDispatcherAlerts(d.db, 'h1')
    expect(d.rpc).toHaveBeenCalledWith('dispatcher_alert_ids_for_hospital', { p_hospital_id: 'h1', p_limit: 100 })
    expect(d.calls.in).toEqual(['id', ['a1', 'a2']])
  })

  it('returns nothing (not everything) when a hospital may see no alerts', async () => {
    const d = db([])
    expect(await loadDispatcherAlerts(d.db, 'h1')).toEqual({ data: [], error: null })
    expect(d.from).not.toHaveBeenCalled()
  })

  it('lets a super admin see every alert', async () => {
    const d = db([])
    await loadDispatcherAlerts(d.db, null)
    expect(d.rpc).not.toHaveBeenCalled()
    expect(d.calls.in).toBeUndefined()
  })

  it('allows acknowledging only a visible alert', async () => {
    expect(await canSeeDispatcherAlert(db(['a1']).db, 'h1', 'a1')).toBe(true)
    expect(await canSeeDispatcherAlert(db(['a1']).db, 'h1', 'zz')).toBe(false)
  })
})
