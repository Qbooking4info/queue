import { useEffect } from 'react'
import { AppState } from 'react-native'
import { touchDevice, type QueueApp } from '../lib/devices'

/**
 * Record this install against the signed-in account, so the privacy screen can
 * say where the account has been used.
 *
 * Mounted next to usePushNotifications in each app's navigator, for the same
 * reason: it needs a resolved user id and should re-run when the app comes
 * back to the foreground. Writes are best-effort and swallow their own errors
 * (see lib/devices.ts) -- nothing about using Queue should break because a
 * bookkeeping row did not land.
 */
export function useDeviceRegistration(userId: string | null | undefined, app: QueueApp) {
  useEffect(() => {
    if (!userId) return
    touchDevice(userId, app)
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') touchDevice(userId, app)
    })
    return () => sub.remove()
  }, [userId, app])
}
