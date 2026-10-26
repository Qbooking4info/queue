// Regression for the 2026-10-13 audit H3: the ambulance tracking screen read the
// request once and then relied only on realtime, so a dropped websocket froze the
// patient's status, and a failed first read left a spinner up forever.

jest.mock('../supabase')
jest.mock('../ambulance-api', () => ({ getTransportRequestById: jest.fn() }))

import { AppState } from 'react-native'
import { getTransportRequestById } from '../ambulance-api'
import { startTransportSync } from '../transport-sync'

const fetchRow = getTransportRequestById as jest.Mock
let appStateListener: ((s: string) => void) | null = null
const remove = jest.fn()

beforeEach(() => {
  jest.useFakeTimers()
  fetchRow.mockReset()
  remove.mockReset()
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    appStateListener = cb
    return { remove }
  }) as never)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

const row = (status: string) => ({ id: 'r1', status })

it('picks up a status change by polling even if realtime never delivers it', async () => {
  fetchRow.mockResolvedValueOnce(row('searching')).mockResolvedValueOnce(row('matched'))
  const onRow = jest.fn()

  const stop = startTransportSync('r1', { onRow, onError: jest.fn() }, 1000)
  await jest.advanceTimersByTimeAsync(0)
  await jest.advanceTimersByTimeAsync(1000)

  expect(onRow.mock.calls.map(c => c[0].status)).toEqual(['searching', 'matched'])
  stop()
})

it('reports a failed first read instead of staying silent', async () => {
  fetchRow.mockRejectedValueOnce(new Error('Network request failed'))
  const onError = jest.fn()

  const stop = startTransportSync('r1', { onRow: jest.fn(), onError }, 1000)
  await jest.advanceTimersByTimeAsync(0)

  expect(onError).toHaveBeenCalledTimes(1)
  stop()
})

it('refreshes when the app returns to the foreground', async () => {
  fetchRow.mockResolvedValue(row('en_route_to_patient'))

  const stop = startTransportSync('r1', { onRow: jest.fn(), onError: jest.fn() }, 60_000)
  await jest.advanceTimersByTimeAsync(0)
  appStateListener?.('active')
  await jest.advanceTimersByTimeAsync(0)

  expect(fetchRow).toHaveBeenCalledTimes(2)
  stop()
})

it('stops polling at a terminal status and cleans up on stop', async () => {
  fetchRow.mockResolvedValue(row('no_unit_available'))

  const stop = startTransportSync('r1', { onRow: jest.fn(), onError: jest.fn() }, 1000)
  await jest.advanceTimersByTimeAsync(5000)
  expect(fetchRow).toHaveBeenCalledTimes(1)

  stop()
  expect(remove).toHaveBeenCalled()
})
