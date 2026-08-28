import { useEffect, useRef } from 'react'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { savePushToken, getAppointmentById } from '../lib/api'
import { navigateWhenReady } from '../lib/navigation'

// Expo Go dropped Android remote-push support in SDK 53+ -- merely importing
// expo-notifications there throws as soon as the module evaluates. Load it
// dynamically, and only outside Expo Go, so the rest of the app still works
// when running in Expo Go during development.
const isExpoGo = Constants.appOwnership === 'expo'

async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo || !Device.isDevice) return null  // won't work in Expo Go or simulator

  const Notifications = await import('expo-notifications')

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
      shouldShowBanner: true,
      shouldShowList:   true,
    }),
  })

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('queue-notifications', {
      name:       'Queue Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0070F3',
    })
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined

  const token = await Notifications.getExpoPushTokenAsync({ projectId })
  return token.data
}

/**
 * Send the user where the notification is about.
 *
 * The server already puts routing data in every push it sends — an
 * appointment_id from web/src/lib/notify-patient.ts and notify-staff.ts, an
 * offer_id / request_id from the dispatch engine. It was being thrown away, so
 * a crew member tapping "New dispatch offer — 30s to accept" landed on whatever
 * screen they had left the app on and had to find the job themselves, against
 * the timer. That is the tap this exists for.
 *
 * Best-effort by design: an unknown payload opens the app normally rather than
 * erroring. Nothing here should ever be able to stop the app from starting.
 */
async function routeFromNotificationData(data: Record<string, unknown> | undefined) {
  if (!data) return

  try {
    // Ambulance dispatch — the time-critical one. Offers live on the crew's
    // jobs tab; the request id routes the patient to live tracking instead.
    if (data.offer_id) {
      navigateWhenReady('CrewHome')
      return
    }
    if (data.request_id) {
      navigateWhenReady('AmbulanceTracking', { requestId: String(data.request_id) })
      return
    }

    // AppointmentDetail takes the whole appointment rather than an id, matching
    // how NotificationsScreen and HomeScreen navigate to it.
    if (data.appointment_id) {
      const appointment = await getAppointmentById(String(data.appointment_id))
      if (appointment) navigateWhenReady('AppointmentDetail', { appointment })
      else navigateWhenReady('Notifications')
      return
    }
  } catch {
    // A failed lookup (offline, deleted row) should still land somewhere useful.
    navigateWhenReady('Notifications')
  }
}

export function usePushNotifications(userId: string | undefined) {
  const listenerRef     = useRef<import('expo-notifications').EventSubscription | null>(null)
  const responseRef     = useRef<import('expo-notifications').EventSubscription | null>(null)

  useEffect(() => {
    if (!userId || isExpoGo) return

    // Push registration failing silently is how production ended up with ZERO
    // push tokens across every user — which means no crew has ever been paged
    // about a dispatch offer, and offers expire in 30 seconds. A rejected
    // promise here (permission denied, no projectId, network) previously
    // vanished into an unhandled rejection.
    registerForPushNotifications()
      .then(token => {
        if (!token) {
          console.warn('[push] no token: Expo Go, simulator, or permission denied')
          return
        }
        return savePushToken(userId, token).catch(err =>
          console.warn('[push] token obtained but could not be saved', err),
        )
      })
      .catch(err => console.warn('[push] registration failed', err))

    import('expo-notifications').then(Notifications => {
      // Listener for notifications received while app is in foreground
      listenerRef.current = Notifications.addNotificationReceivedListener(_notif => {
        // in-app banner is shown automatically via setNotificationHandler
      })

      // Listener for user tapping a notification while the app is running
      responseRef.current = Notifications.addNotificationResponseReceivedListener(response => {
        routeFromNotificationData(response.notification.request.content.data as Record<string, unknown>)
      })

      // A tap that launched the app from cold has already happened by the time
      // this effect runs, so the listener above never sees it. This is the case
      // that matters most: the app was closed, and the notification is the only
      // reason it is open.
      Notifications.getLastNotificationResponseAsync().then(last => {
        if (last) routeFromNotificationData(last.notification.request.content.data as Record<string, unknown>)
      }).catch(() => {/* nothing to route to */})
    })

    return () => {
      listenerRef.current?.remove()
      responseRef.current?.remove()
    }
  }, [userId])
}
