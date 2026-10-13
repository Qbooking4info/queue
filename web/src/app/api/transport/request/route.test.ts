import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const runDispatchRoundMock = vi.fn(() => Promise.resolve())
vi.mock('@/lib/dispatch/engine', () => ({ runDispatchRound: () => runDispatchRoundMock() }))

vi.mock('next/server', async (orig) => {
  const mod = await orig<typeof import('next/server')>()
  return { ...mod, after: (fn: () => unknown) => { fn() } }
})

const LIVE = { id: 'req-existing', booking_ref: 'AMB-1', status: 'searching' }

// transport_requests is read twice (pre-insert guard, then after a 23505) and
// inserted once; `script` decides each call's result in order.
function mockDb(script: { guard: unknown[]; insert: { data: unknown; error: unknown }; reread?: unknown[] }) {
  let reads = 0
  const inserts: unknown[] = []
  return {
    inserts,
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'AUTH_PAT' } } })) },
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {}
      ;['select', 'eq', 'in', 'limit'].forEach(m => { b[m] = vi.fn(() => b) })
      if (table === 'users') {
        b.single = vi.fn(() => Promise.resolve({ data: { id: 'PAT', phone: '080', full_name: 'TEST Patient' } }))
        return b
      }
      b.insert = vi.fn((row: unknown) => {
        inserts.push(row)
        return { select: () => ({ single: () => Promise.resolve(script.insert) }) }
      })
      b.then = (ok: (v: unknown) => unknown) => {
        reads += 1
        return Promise.resolve({ data: reads === 1 ? script.guard : (script.reread ?? []) }).then(ok)
      }
      return b
    }),
  }
}

const dbMock = { current: mockDb({ guard: [], insert: { data: null, error: null } }) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.current }))

const { POST } = await import('./route')

const sos = () => new NextRequest('http://localhost/api/transport/request', {
  method: 'POST',
  headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
  body: JSON.stringify({ requestType: 'emergency', triageLevel: 2, lat: 6.45, lng: 3.38 }),
})

describe('POST /api/transport/request', () => {
  beforeEach(() => runDispatchRoundMock.mockClear())

  it('creates a request and starts dispatch', async () => {
    dbMock.current = mockDb({ guard: [], insert: { data: { id: 'req-new', booking_ref: 'AMB-2', status: 'requested' }, error: null } })
    const res = await POST(sos())
    expect(res.status).toBe(201)
    expect(runDispatchRoundMock).toHaveBeenCalledTimes(1)
  })

  it('returns the live request instead of creating a second one', async () => {
    dbMock.current = mockDb({ guard: [LIVE], insert: { data: null, error: null } })
    const res = await POST(sos())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ duplicate: true, request: LIVE })
    expect(dbMock.current.inserts).toHaveLength(0)
    expect(runDispatchRoundMock).not.toHaveBeenCalled()
  })

  // Two taps racing past the guard: the second insert hits the unique index.
  it('answers a racing duplicate (23505) with the existing request, not a 500', async () => {
    dbMock.current = mockDb({
      guard: [],
      insert: { data: null, error: { code: '23505', message: 'duplicate key' } },
      reread: [LIVE],
    })
    const res = await POST(sos())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ duplicate: true, request: LIVE })
    expect(runDispatchRoundMock).not.toHaveBeenCalled()
  })

  it('rejects a request without valid coordinates', async () => {
    const res = await POST(new NextRequest('http://localhost/api/transport/request', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'emergency', triageLevel: 2, lat: 'x', lng: 3 }),
    }))
    expect(res.status).toBe(400)
  })
})
