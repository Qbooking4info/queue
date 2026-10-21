import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { getLocumJobs } from '../lib/api'

/**
 * How many open shifts in this doctor's state they have not replied to yet,
 * for the Jobs tab badge.
 *
 * Polled rather than subscribed: the board is a low-traffic list and a realtime
 * channel per doctor would cost more than it saves. Refreshed when the app
 * comes back to the foreground so a doctor who was notified while away sees the
 * badge immediately on opening it.
 */
export function useOpenLocumJobs(enabled: boolean, intervalMs = 60_000) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) { setCount(0); return }
    let cancelled = false

    const refresh = async () => {
      const res = await getLocumJobs('feed')
      if (cancelled) return
      setCount(res.jobs.filter(j => !j.myResponse && j.status === 'open').length)
    }

    refresh()
    const timer = setInterval(refresh, intervalMs)
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refresh() })

    return () => { cancelled = true; clearInterval(timer); sub.remove() }
  }, [enabled, intervalMs])

  return count
}
