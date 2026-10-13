import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

// The Android "#3 · about 12 min" notification the handoff asks for: one sticky,
// silent notification that is replaced in place as the position changes, so the
// patient can follow the queue from the shade without opening the app.
const ID = 'queue-pass'
const CHANNEL = 'queue-position'
let channelReady = false

async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Queue position', importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0], sound: null, showBadge: false,
  })
  channelReady = true
}

export async function showQueueNotification(appointmentId: string, title: string, body: string) {
  if (Platform.OS !== 'android') return
  try {
    await ensureChannel()
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: { title, body, sticky: true, autoDismiss: false, data: { appointmentId, screen: 'QueuePass' } },
      trigger: { channelId: CHANNEL } as any,
    })
  } catch { /* notifications off: the in-app pass still works */ }
}

export async function clearQueueNotification() {
  if (Platform.OS !== 'android') return
  try { await Notifications.dismissNotificationAsync(ID) } catch {}
}
