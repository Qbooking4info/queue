import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { todayLocalDate } from '../lib/format'

/** Hour of the local day from which the nudge becomes active. */
export const NUDGE_FROM_HOUR = 7

/**
 * "Confirm this again each morning."
 *
 * Returns whether a control should be demanding attention right now, and an
 * acknowledge() to stop it until tomorrow. Active once the local clock passes
 * NUDGE_FROM_HOUR, and only until the doctor has touched the control that day.
 *
 * Local device time on purpose, not WAT: format.ts's todayLocalDate() is
 * device-local for mobile (unlike the server's fixed +1), and a doctor's morning
 * is the morning where their phone is.
 *
 * The acknowledgement is stored per calendar date rather than as a boolean so it
 * expires on its own at midnight -- nothing has to run a reset, and an app left
 * open overnight still nudges the next morning.
 */
export function useMorningNudge(storageKey: string): {
  nudging: boolean
  acknowledge: () => void
} {
  const [ackDate, setAckDate] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    AsyncStorage.getItem(storageKey)
      .then(v => { if (mounted.current) { setAckDate(v); setLoaded(true) } })
      // A storage failure must not leave the control flashing forever with no way
      // to clear it, so treat it as "already acknowledged".
      .catch(() => { if (mounted.current) { setAckDate(todayLocalDate()); setLoaded(true) } })
    return () => { mounted.current = false }
  }, [storageKey])

  // Re-evaluate when the app comes back to the foreground, so a phone that sat
  // locked from before 7am starts nudging when it's picked up, and one left open
  // across midnight stops treating yesterday's acknowledgement as current.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && mounted.current) setNow(new Date())
    })
    // Also tick while open, so a doctor already in the app at 06:59 sees it start.
    const timer = setInterval(() => { if (mounted.current) setNow(new Date()) }, 60_000)
    return () => { sub.remove(); clearInterval(timer) }
  }, [])

  const acknowledge = useCallback(() => {
    const today = todayLocalDate()
    setAckDate(today)
    AsyncStorage.setItem(storageKey, today).catch(() => {})
  }, [storageKey])

  const nudging = loaded && now.getHours() >= NUDGE_FROM_HOUR && ackDate !== todayLocalDate()

  return { nudging, acknowledge }
}
