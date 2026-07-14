import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { savePushToken } from '../lib/api'

// Show alerts for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
})

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null  // won't work in simulator

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
  const listenerRef     = useRef<Notifications.EventSubscription | null>(null)
  const responseRef     = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    if (!userId) return

    registerForPushNotifications().then(token => {
      if (token) savePushToken(userId, token)
    })

    // Listener for notifications received while app is in foreground
    listenerRef.current = Notifications.addNotificationReceivedListener(_notif => {
      // in-app banner is shown automatically via setNotificationHandler
    })

    // Listener for user tapping a notification
    responseRef.current = Notifications.addNotificationResponseReceivedListener(_response => {
      // Could navigate to AppointmentDetail here based on response.notification.request.content.data
    })

    return () => {
      listenerRef.current?.remove()
      responseRef.current?.remove()
    }
  }, [userId])
}
