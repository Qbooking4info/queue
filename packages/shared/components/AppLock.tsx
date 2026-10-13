// Optional fingerprint / face unlock (v3.1 Permissions: "unlock Queue quickly
// without a code"). Off by default; turned on from Profile. When on, the app asks
// on cold start and when it returns after more than five minutes in the background.
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, View, Platform, TouchableOpacity } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Text } from './ui/Typography'
import { PrimaryButton } from './ui/v3'
import { QueueMark } from './ui/QueueMark'
import { useTheme } from '../contexts/ThemeContext'

const KEY = 'queue:appLock'
const RELOCK_AFTER_MS = 5 * 60 * 1000

export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  } catch { return false }
}

export async function getAppLockEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1' } catch { return false }
}

/** Turning it on asks once, so nobody enables a lock they can't open. */
export async function setAppLockEnabled(on: boolean): Promise<boolean> {
  if (on) {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on unlock for Queue' })
    if (!r.success) return false
  }
  try { await AsyncStorage.setItem(KEY, on ? '1' : '0') } catch {}
  return true
}

export function AppLockGate({ active, onUsePassword, children }: {
  /** Only lock a signed-in session. */
  active: boolean
  /** Escape hatch: sign out and sign in with the password instead. */
  onUsePassword: () => void
  children: React.ReactNode
}) {
  const { theme: t } = useTheme()
  const [locked, setLocked] = useState(false)
  const [checked, setChecked] = useState(false)
  const backgroundedAt = useRef<number | null>(null)

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Queue', cancelLabel: 'Cancel' })
    if (r.success) setLocked(false)
  }, [])

  useEffect(() => {
    if (!active) { setLocked(false); setChecked(true); return }
    getAppLockEnabled().then(on => { setChecked(true); if (on) { setLocked(true); unlock() } })
  }, [active, unlock])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'background') backgroundedAt.current = Date.now()
      if (state === 'active' && active && backgroundedAt.current != null) {
        const away = Date.now() - backgroundedAt.current
        backgroundedAt.current = null
        if (away > RELOCK_AFTER_MS && (await getAppLockEnabled())) { setLocked(true); unlock() }
      }
    })
    return () => sub.remove()
  }, [active, unlock])

  if (!checked) return null
  if (!locked) return <>{children}</>
  return (
    <View style={{ flex: 1, backgroundColor: t.splashBg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <QueueMark white size={88} />
      <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>Queue is locked</Text>
      <Text style={{ color: '#CCFBF1', fontSize: 14, textAlign: 'center' }}>Use your fingerprint or face to continue.</Text>
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 12 }}>
        <PrimaryButton label="Unlock" icon="finger-print" onPress={unlock} />
        <TouchableOpacity onPress={onUsePassword} accessibilityRole="button" style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Use password instead</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
