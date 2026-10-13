// Make sure a dispatch offer reaches a person. Expo push needs Firebase config the
// staff apps don't have yet, and an offer lives for well under a minute -- so the
// crew app raises its own loud, lock-screen notification whenever it learns of a new
// offer (from the foreground poll, or from the background location task that runs
// for the whole shift). Each offer alerts once.
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { getMyPendingOffers, type PendingOffer } from './crew-api'

const CHANNEL = 'dispatch-offers'
const SEEN_KEY = 'queue.crew.alertedOffers'
let channelReady = false

async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Ambulance job offers',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 300, 600, 300, 600, 300, 600],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableVibrate: true,
  }).catch(() => {})
  channelReady = true
}

async function seen(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]') } catch { return [] }
}

/** Alert for any offer we haven't alerted for yet. Returns the new ones. */
export async function alertNewOffers(offers: PendingOffer[]): Promise<PendingOffer[]> {
  if (!offers.length) return []
  const done = await seen()
  const fresh = offers.filter(o => !done.includes(o.offer_id) && new Date(o.expires_at).getTime() > Date.now())
  if (!fresh.length) return []
  await ensureChannel()
  for (const o of fresh) {
    const secs = Math.max(0, Math.round((new Date(o.expires_at).getTime() - Date.now()) / 1000))
    await Notifications.scheduleNotificationAsync({
      content: {
        title: o.triage_level != null && o.triage_level <= 2 ? '🚨 Emergency job offer' : 'New ambulance job',
        body: `${o.pickup_address ?? 'Pickup nearby'} · ${secs}s to accept — open Queue Ambulance`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { type: 'dispatch_offer', offer_id: o.offer_id },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } as any : null,
    }).catch(() => {})
  }
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...done, ...fresh.map(o => o.offer_id)].slice(-50))).catch(() => {})
  return fresh
}

/** For the background task: fetch offers and alert. Never throws. */
export async function checkOffersInBackground() {
  try { await alertNewOffers(await getMyPendingOffers()) } catch { /* offline or signed out */ }
}
