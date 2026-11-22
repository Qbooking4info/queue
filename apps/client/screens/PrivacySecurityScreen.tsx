import { useCallback, useState } from 'react'
import { View, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Btn, Notice, Initials, Empty, Mono,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase }  from '@queue/shared/lib/supabase'
import { deleteAccount } from '@queue/shared/lib/api'
import { PasswordInput, PasswordChecklist, passwordProblem } from '@queue/shared/components/ui/PasswordField'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'
import {
  listMyDevices, forgetDevice, signOutOtherDevices, getInstallId, type UserDevice,
} from '@queue/shared/lib/devices'
import { haptics } from '@queue/shared/lib/haptics'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Props { navigation: any }

/** "2 hours ago", "yesterday", "12 Mar" — enough to recognise a device by. */
function lastSeen(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (mins < 2) return 'in use now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 48 * 60) return mins < 24 * 60 ? `${Math.floor(mins / 60)} h ago` : 'yesterday'
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

export function PrivacySecurityScreen({ navigation }: Props) {
  const { theme: t }      = useTheme()
  const { signOut, user } = useAuth()

  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [pwError,    setPwError]    = useState('')
  const [pwSuccess,  setPwSuccess]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [devices, setDevices] = useState<UserDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [installId, setInstallId] = useState<string | null>(null)
  const [endingOthers, setEndingOthers] = useState(false)

  const loadDevices = useCallback(async () => {
    const [list, id] = await Promise.all([
      listMyDevices().catch(() => [] as UserDevice[]),
      getInstallId().catch(() => null),
    ])
    setDevices(list)
    setInstallId(id)
    setDevicesLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { loadDevices() }, [loadDevices]))

  // MC1: Verify current password before allowing the update
  async function handleChangePassword() {
    setPwError(''); setPwSuccess(false)
    if (!currentPw)          { setPwError('Enter your current password.'); return }
    const weak = passwordProblem(newPw)
    if (weak)                { setPwError(weak); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    setSaving(true)

    // Re-authenticate with the current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: currentPw,
    })
    if (signInError) {
      setSaving(false)
      setPwError('Current password is incorrect.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) { setPwError(error.message) }
    else { setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and cancels all pending appointments. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession()
          const jwt = session?.access_token
          if (!jwt) return
          const ok = await deleteAccount(API_URL, jwt)
          if (ok) { await signOut() }
          else { Alert.alert('Error', 'Could not delete account. Please contact support.') }
        }},
      ],
    )
  }

  return (
    <Screen>
      <AppBar title="Privacy & security" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <Body keyboardShouldPersistTaps="handled">
          <Card>
            <Row
              leading={<Initials name={user?.full_name} size={44} />}
              title={user?.full_name ?? '—'}
              sub={user?.email ?? user?.phone ?? '—'}
              pill="Verified" pillTone="green"
            />
          </Card>

          <SectionHead title="Change password" />
          <Card pad style={{ gap: 14 }}>
            {[
              { label: 'Current password', value: currentPw, set: setCurrentPw },
              { label: 'New password', value: newPw, set: setNewPw },
              { label: 'Confirm password', value: confirmPw, set: setConfirmPw },
            ].map(f => (
              <View key={f.label} style={{ gap: 6 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>{f.label}</Text>
                <PasswordInput
                  value={f.value}
                  onChangeText={f.set}
                  accessibilityLabel={f.label}
                  newPassword={f.label !== 'Current password'}
                />
                {f.label === 'New password' && <PasswordChecklist password={newPw} />}
              </View>
            ))}

            {!!pwError && <Text style={{ fontSize: 12.5, color: t.q.red }}>{pwError}</Text>}
            {pwSuccess && <Text style={{ fontSize: 12.5, color: t.q.green }}>Password changed.</Text>}

            <Btn label="Update password" loading={saving} onPress={handleChangePassword} />
          </Card>

          <SectionHead title={devices.length ? `Devices · ${devices.length}` : 'Devices'} />
          {devicesLoading ? (
            <ActivityIndicator color={t.q.primary} style={{ marginVertical: 20 }} />
          ) : devices.length === 0 ? (
            <Card>
              <Empty icon="phone-portrait-outline" title="Only this one so far"
                body="Each device you open Queue on is listed here, with when it was last used." />
            </Card>
          ) : (
            <Card>
              {devices.map((d, i) => {
                const isThis = d.install_id === installId
                return (
                  <View key={d.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon={d.platform === 'web' ? 'desktop-outline' : 'phone-portrait-outline'}
                      iconTone={isThis ? 'teal' : 'neutral'}
                      title={d.label ?? 'Unknown device'}
                      sub={[d.app ? `Queue ${d.app}` : null, lastSeen(d.last_seen_at)].filter(Boolean).join(' · ')}
                      pill={isThis ? 'This device' : undefined}
                      pillTone="teal"
                      right={isThis ? undefined
                        : <Btn label="Forget" variant="secondary" small
                            onPress={async () => { await forgetDevice(d.id); loadDevices() }} />} />
                  </View>
                )
              })}
            </Card>
          )}

          {/* Said plainly, because the difference matters: forgetting a device
              removes it from this list and nothing else. Ending sessions is the
              action that actually locks someone out, and the auth layer only
              offers it all-at-once. */}
          <Notice tone="neutral" icon="information-circle-outline">
            Forgetting a device only removes it from this list — it does not sign that device out. To do
            that, end the other sessions below.
          </Notice>

          <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 12 }}>
            <Btn label="Sign out everywhere else" variant="secondary" icon="log-out-outline"
              loading={endingOthers}
              onPress={async () => {
                setEndingOthers(true)
                const err = await signOutOtherDevices()
                setEndingOthers(false)
                if (err) { haptics.error(); Alert.alert('Could not do that', err); return }
                haptics.success()
                Alert.alert('Done', 'Every other device has been signed out. This one stays signed in.')
                loadDevices()
              }} />
            <Btn label="Sign out of all devices" variant="danger" icon="log-out-outline" onPress={() => signOut()} />
            <DeleteAccount what="your profile, photo, family links and sign-in" />
          </View>
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  )
}
