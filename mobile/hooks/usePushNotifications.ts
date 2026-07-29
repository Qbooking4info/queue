import { useEffect, useRef } from 'react'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { savePushToken } from '../lib/api'

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

export function usePushNotifications(userId: string | undefined) {
  const listenerRef     = useRef<import('expo-notifications').EventSubscription | null>(null)
  const responseRef     = useRef<import('expo-notifications').EventSubscription | null>(null)

  useEffect(() => {
    if (!userId || isExpoGo) return

    registerForPushNotifications().then(token => {
      if (token) savePushToken(userId, token)
    })

    import('expo-notifications').then(Notifications => {
      // Listener for notifications received while app is in foreground
      listenerRef.current = Notifications.addNotificationReceivedListener(_notif => {
        // in-app banner is shown automatically via setNotificationHandler
      })

      // Listener for user tapping a notification
      responseRef.current = Notifications.addNotificationResponseReceivedListener(_response => {
        // Could navigate to AppointmentDetail here based on response.notification.request.content.data
      })
    })

    return () => {
      listenerRef.current?.remove()
      responseRef.current?.remove()
    }
  }, [userId])
}
