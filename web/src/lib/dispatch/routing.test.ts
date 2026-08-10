import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mapbox's driving-traffic matrix caps at 10 coordinates INCLUDING the
// destination. find_candidate_units returns up to 12 units, so an unchunked
// request 422'd and every unit fell back to a null ETA — silently degrading the
// round to straight-line ranking with only a console warning to show for it.

// routing.ts imports 'server-only', which throws outside a server component.
vi.mock('server-only', () => ({}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { roadEtas } = await import('./routing')

function okMatrix(n: number) {
  return {
    ok: true,
    json: async () => ({ durations: Array.from({ length: n }, (_, i) => [60 * (i + 1)]) }),
  }
}

beforeEach(() => {
  beginTest()
  fetchMock.mockReset()
  process.env.MAPBOX_ACCESS_TOKEN = 'test-token'
})
afterEach(() => { delete process.env.MAPBOX_ACCESS_TOKEN })

// The ETA cache is module-level and intentionally survives across calls, so
// each test uses its own coordinate space — otherwise an earlier test's cached
// result satisfies a later one and the fetch assertions silently pass on stale
// data instead of exercising the code.
let space = 0
const beginTest = () => { space += 1 }
const pt = (i: number) => ({ lat: 6.5 + space + i / 1000, lng: 3.4 + space + i / 1000 })
const dest = () => ({ lat: 6.6 + space, lng: 3.5 + space })

describe('roadEtas coordinate limit', () => {
  it('sends a single request when within the limit', async () => {
    fetchMock.mockResolvedValue(okMatrix(9))
    await roadEtas(Array.from({ length: 9 }, (_, i) => pt(i)), dest())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never exceeds 10 coordinates in any single request', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const coords = url.split('/driving-traffic/')[1].split('?')[0].split(';')
      expect(coords.length).toBeLessThanOrEqual(10)
      return okMatrix(coords.length - 1)
    })
    await roadEtas(Array.from({ length: 12 }, (_, i) => pt(i)), dest())
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })

  it('returns exactly one ETA per origin when chunked', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const n = url.split('/driving-traffic/')[1].split('?')[0].split(';').length - 1
      return okMatrix(n)
    })
    const etas = await roadEtas(Array.from({ length: 12 }, (_, i) => pt(i)), dest())
    expect(etas).toHaveLength(12)
  })

  it('keeps results aligned with origin order across chunks', async () => {
    // Each chunk returns 60,120,180... so a correctly-ordered flatten restarts
    // at 60 on the chunk boundary rather than interleaving.
    fetchMock.mockImplementation(async (url: string) => {
      const n = url.split('/driving-traffic/')[1].split('?')[0].split(';').length - 1
      return okMatrix(n)
    })
    const etas = await roadEtas(Array.from({ length: 12 }, (_, i) => pt(i)), dest())
    expect(etas.slice(0, 3)).toEqual([60, 120, 180])
    expect(etas[9]).toBe(60)
  })

  it('degrades to nulls rather than throwing when the matrix fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) })
    const etas = await roadEtas(Array.from({ length: 12 }, (_, i) => pt(i)), dest())
    expect(etas).toEqual(Array(12).fill(null))
  })

  it('returns nulls with no token instead of calling out', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN
    const etas = await roadEtas([pt(1), pt(2)], dest())
    expect(etas).toEqual([null, null])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
