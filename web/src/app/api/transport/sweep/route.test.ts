import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const runDispatchRoundMock = vi.fn()
vi.mock('@/lib/dispatch/engine', () => ({
  runDispatchRound: (...args: unknown[]) => runDispatchRoundMock(...args),
}))

type Row = Record<string, unknown>

// Minimal PostgREST-ish builder. Rows are keyed by the `status` the query
// filters on, because the route runs two different queries against
// transport_requests ('searching' and 'scheduled') and a mock that ignored the
// filter would feed the same rows to both branches.
function mockDb(byStatus: Record<string, Row[]>) {
  return {
    from: vi.fn(() => {
      let status = ''
      const builder: any = {}
      for (const m of ['select', 'not', 'lte', 'order', 'limit']) {
        builder[m] = vi.fn(() => builder)
      }
      builder.eq = vi.fn((col: string, val: string) => {
        if (col === 'status') status = val
        return builder
      })
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: byStatus[status] ?? [], error: null }).then(resolve)
      return builder
    }),
  }
}

const dbMock = { current: mockDb({}) }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => dbMock.current,
}))

const { GET } = await import('./route')

function makeRequest(auth?: string) {
  return new NextRequest('http://localhost/api/transport/sweep', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  })
}

const FUTURE = new Date(Date.now() + 60_000).toISOString()
const PAST = new Date(Date.now() - 60_000).toISOString()

beforeEach(() => {
  runDispatchRoundMock.mockReset().mockResolvedValue({})
  dbMock.current = mockDb({})
  process.env.CRON_SECRET = 'test-secret'
})

afterEach(() => {
  delete process.env.CRON_SECRET
})

describe('authorization', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(runDispatchRoundMock).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await GET(makeRequest('Bearer nope'))
    expect(res.status).toBe(401)
  })

  it('fails closed when CRON_SECRET is unset, rather than running unauthenticated', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest('Bearer anything'))
    expect(res.status).toBe(401)
    expect(runDispatchRoundMock).not.toHaveBeenCalled()
  })
})

describe('advancing stranded searches', () => {
  it('leaves a request alone while it still has a live pending offer', async () => {
    dbMock.current = mockDb({
      searching: [
        { id: 'r1', dispatch_offers: [{ round: 1, response: 'pending', expires_at: FUTURE }] },
      ],
    })
    const res = await GET(makeRequest('Bearer test-secret'))
    expect(await res.json()).toMatchObject({ advanced: 0 })
    expect(runDispatchRoundMock).not.toHaveBeenCalled()
  })

  it('advances to the next round once every offer has expired', async () => {
    dbMock.current = mockDb({
      searching: [
        {
          id: 'r1',
          dispatch_offers: [
            { round: 1, response: 'expired', expires_at: PAST },
            { round: 2, response: 'expired', expires_at: PAST },
          ],
        },
      ],
    })
    const res = await GET(makeRequest('Bearer test-secret'))
    expect(runDispatchRoundMock).toHaveBeenCalledWith('r1', 3)
    expect(await res.json()).toMatchObject({ advanced: 1 })
  })

  it('treats an offer past its expiry as dead even if still marked pending', async () => {
    // The pg_cron sweeper flips these to 'expired', but this must not depend on
    // how recently that last ran.
    dbMock.current = mockDb({
      searching: [
        { id: 'r1', dispatch_offers: [{ round: 1, response: 'pending', expires_at: PAST }] },
      ],
    })
    await GET(makeRequest('Bearer test-secret'))
    expect(runDispatchRoundMock).toHaveBeenCalledWith('r1', 2)
  })

  it('restarts at round 1 for a searching request that never produced an offer', async () => {
    dbMock.current = mockDb({ searching: [{ id: 'r1', dispatch_offers: [] }] })
    await GET(makeRequest('Bearer test-secret'))
    expect(runDispatchRoundMock).toHaveBeenCalledWith('r1', 1)
  })

  it('keeps sweeping after one request throws, and reports the failure', async () => {
    dbMock.current = mockDb({
      searching: [
        { id: 'bad', dispatch_offers: [] },
        { id: 'good', dispatch_offers: [] },
      ],
    })
    runDispatchRoundMock.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(makeRequest('Bearer test-secret'))
    const body = await res.json()
    expect(body).toMatchObject({ advanced: 1, failed: 1 })
    expect(body.failures[0]).toMatchObject({ requestId: 'bad', error: 'boom' })
    expect(runDispatchRoundMock).toHaveBeenCalledWith('good', 1)
  })
})

describe('promoting scheduled transport', () => {
  it('dispatches a scheduled request that is due, at round 1', async () => {
    dbMock.current = mockDb({ scheduled: [{ id: 's1' }] })
    const res = await GET(makeRequest('Bearer test-secret'))
    expect(runDispatchRoundMock).toHaveBeenCalledWith('s1', 1)
    expect(await res.json()).toMatchObject({ promoted: 1 })
  })

  it('reports advanced and promoted separately', async () => {
    dbMock.current = mockDb({
      searching: [{ id: 'r1', dispatch_offers: [] }],
      scheduled: [{ id: 's1' }],
    })
    const res = await GET(makeRequest('Bearer test-secret'))
    expect(await res.json()).toMatchObject({ advanced: 1, promoted: 1, failed: 0 })
  })

  it('does nothing and reports zeroes when there is no work', async () => {
    const res = await GET(makeRequest('Bearer test-secret'))
    expect(await res.json()).toMatchObject({ advanced: 0, promoted: 0, failed: 0 })
    expect(runDispatchRoundMock).not.toHaveBeenCalled()
  })
})
