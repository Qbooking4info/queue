/**
 * Which devices this account has been used on (user_devices, 20261121000007).
 *
 * Read the table's comment before changing anything here: a row is NOT a
 * session. It grants nothing, and deleting one signs nothing out. Supabase
 * keeps sessions in the auth schema where clients cannot see them, so the one
 * honest control available is signOut({ scope: 'others' }), which ends every
 * other session at once. The screen offers exactly that, rather than a
 * per-row "revoke" button that would appear to work and do nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { supabase } from './supabase'

const INSTALL_KEY = 'queue.install_id'

export type QueueApp = 'patient' | 'doctor' | 'hospital' | 'ambulance'

export interface UserDevice {
  id: string
  install_id: string
  label: string | null
  platform: string | null
  app: string | null
  app_version: string | null
  last_seen_at: string
  created_at: string
}

/**
 * A random id generated once per install and kept in local storage.
 *
 * Deliberately not a hardware identifier: Queue has no need to know which
 * physical handset this is, only that it is the same install as last week,
 * and a hardware id would let the same person be recognised across different
 * accounts.
 */
export async function getInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALL_KEY).catch(() => null)
  if (existing) return existing
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  await AsyncStorage.setItem(INSTALL_KEY, id).catch(() => {})
  return id
}

function deviceLabel(): string {
  const name = Device.deviceName?.trim()
  if (name) return name
  const model = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ').trim()
  if (model) return model
  return Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android phone' : 'Web browser'
}

/**
 * Record that this install is in use, for this account.
 *
 * Called on sign-in and whenever the app comes back to the foreground. Fails
 * silently and on purpose: this is a privacy convenience, and nothing about
 * using Queue should break because a bookkeeping write did not land.
 */
export async function touchDevice(userId: string | null | undefined, app: QueueApp): Promise<void> {
  if (!userId) return
  try {
    const installId = await getInstallId()
    await supabase.from('user_devices').upsert({
      user_id:      userId,
      install_id:   installId,
      label:        deviceLabel(),
      platform:     Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
      app,
      app_version:  Constants.expoConfig?.version ?? null,
      last_seen_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id,install_id' })
  } catch {
    /* see above */
  }
}

export async function listMyDevices(): Promise<UserDevice[]> {
  const { data } = await supabase
    .from('user_devices')
    .select('id, install_id, label, platform, app, app_version, last_seen_at, created_at')
    .order('last_seen_at', { ascending: false })
  return (data as UserDevice[] | null) ?? []
}

/** Forget a device we are not currently on. Does not sign it out -- see the
 *  note at the top of this file -- so the caller must say so plainly. */
export async function forgetDevice(id: string): Promise<string | null> {
  const { error } = await supabase.from('user_devices').delete().eq('id', id)
  return error?.message ?? null
}

/**
 * End every other session for this account. This one is real: Supabase
 * invalidates the other refresh tokens server-side, so those devices are
 * signed out when their access token next expires.
 */
export async function signOutOtherDevices(): Promise<string | null> {
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  return error?.message ?? null
}
