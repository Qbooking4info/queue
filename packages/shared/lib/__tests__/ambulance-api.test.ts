// authedFetch carries every ambulance write (SOS request, crew accept, location
// pings). Regression for the 2026-10-13 audit H4: it had no timeout, so a request
// lost on a dead connection left the SOS screen on "Sending SOS…" forever, and an
// HTML error page surfaced as "JSON Parse error" instead of a failed request.

jest.mock('../supabase')

import { supabase } from '../supabase'
import { authedFetch } from '../ambulance-api'

const mockSupabase = supabase as unknown as { auth: { getSession: jest.Mock } }

beforeEach(() => {
  mockSupabase.auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'jwt' } } }),
  }
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('authedFetch', () => {
  it('rejects with a timeout message instead of hanging when the server never answers', async () => {
    jest.useFakeTimers()
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
      }),
    )

    const pending = authedFetch('/api/transport/request', {}, 1000)
    const assertion = expect(pending).rejects.toThrow('The request timed out')
    await jest.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('reports the HTTP status when the error body is not JSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html>504 Gateway Timeout</html>', { status: 504 }),
    )

    await expect(authedFetch('/api/transport/request', {})).rejects.toThrow('Request failed (504)')
  })

  it('reports a network failure plainly', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Network request failed'))

    await expect(authedFetch('/api/transport/request', {})).rejects.toThrow('Could not reach Queue')
  })

  it('surfaces the server error message and returns JSON on success', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Valid pickup coordinates are required' }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: { id: 'r1' } }), { status: 201 }))

    await expect(authedFetch('/api/transport/request', {})).rejects.toThrow('Valid pickup coordinates are required')
    await expect(authedFetch('/api/transport/request', {})).resolves.toEqual({ request: { id: 'r1' } })
  })
})
