import { AppState } from 'react-native'
import { getTransportRequestById, type TransportRequestRow } from './ambulance-api'

export const TRANSPORT_POLL_MS = 15_000

const TERMINAL = new Set(['completed', 'cancelled_by_requester', 'cancelled_by_provider', 'no_unit_available'])

/**
 * Keeps a tracked ambulance request current without depending on realtime alone.
 *
 * The tracking screen used to read the row once and then rely entirely on the
 * realtime channel. A websocket that drops — a weak signal, the app backgrounded
 * and resumed — delivers nothing and reports nothing, so "crew accepted" or
 * "no ambulance available" could simply never arrive. This re-reads the row on a
 * timer and whenever the app returns to the foreground, alongside realtime, and
 * stops once the request reaches a terminal status.
 *
 * onError fires only for reads that fail; the caller decides whether that is a
 * blocking error (nothing loaded yet) or ignorable (a missed poll).
 */
export function startTransportSync(
  requestId: string,
  handlers: { onRow: (row: TransportRequestRow | null) => void; onError: (err: unknown) => void },
  intervalMs = TRANSPORT_POLL_MS,
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | null = null

  const stopPolling = () => { if (timer) { clearInterval(timer); timer = null } }

  const load = async () => {
    try {
      const row = await getTransportRequestById(requestId)
      if (stopped) return
      handlers.onRow(row)
      if (!row || TERMINAL.has(row.status)) stopPolling()
    } catch (err) {
      if (!stopped) handlers.onError(err)
    }
  }

  void load()
  timer = setInterval(load, intervalMs)
  const sub = AppState.addEventListener('change', state => { if (state === 'active') void load() })

  return () => {
    stopped = true
    stopPolling()
    sub.remove()
  }
}
