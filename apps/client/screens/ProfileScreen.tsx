import { useEffect, useState } from 'react'
import { View, Clipboard, Switch } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { clearCache } from '@queue/shared/lib/cache'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { biometricAvailable, getAppLockEnabled, setAppLockEnabled } from '@queue/shared/components/AppLock'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, Btn, Mono, CardLabel,
} from '@queue/shared/components/q'

interface Props { navigation?: any }

export function ProfileScreen({ navigation }: Props) {
  const { theme: t, mode, toggleTheme } = useTheme()
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  const [canLock, setCanLock] = useState(false)
  const [lockOn, setLockOn] = useState(false)
  useEffect(() => { biometricAvailable().then(setCanLock); getAppLockEnabled().then(setLockOn) }, [])

  // patient_code is the short ID a family member enters to link this account,
  // and what the queue pass QR carries. patient_number is the hospital's own
  // record number -- different thing, different audience.
  const patientCode = (user as any)?.patient_code ?? null
  const patientNumber = (user as any)?.patient_number ?? null

  function copyCode() {
    if (!patientCode) return
    Clipboard.setString(patientCode)
    haptics.tap()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function doSignOut() {
    setSigningOut(true)
    await clearCache(user?.id)
    await signOut()
    setSigningOut(false)
    setConfirm(false)
  }

  return (
    <Screen>
      <AppBar title="Profile" onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

      <Body>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 }}>
          <ProfileAvatar size={64} editable />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: t.q.ink }}>
              {user?.full_name ?? 'Your profile'}
            </Text>
            <Text style={{ fontSize: 13, color: t.q.ink60 }}>{user?.phone ?? user?.email ?? ''}</Text>
          </View>
        </View>

        <Card>
          <Row
            icon="card-outline"
            title="Patient ID"
            sub={copied ? 'Copied' : 'Tap to copy — family members use this to link to you'}
            right={<Mono size={15} weight="700">{patientCode ?? '—'}</Mono>}
            onPress={patientCode ? copyCode : undefined}
          />
          {!!patientNumber && (
            <>
              <Hair />
              <Row
                icon="document-text-outline" iconTone="neutral"
                title="Hospital record number"
                sub="Used by the hospital, not for linking"
                right={<Mono size={13} color={t.q.ink60}>{patientNumber}</Mono>}
              />
            </>
          )}
        </Card>

        <SectionHead title="Your care" />
        <Card>
          <Row icon="wallet-outline" title="Wallet" sub="Top up and pay for visits in one tap"
            chevron onPress={() => navigation?.navigate('Wallet')} />
          <Hair />
          <Row icon="people-outline" title="Dependents" sub="Book and manage care for family"
            chevron onPress={() => navigation?.navigate('Dependents')} />
          <Hair />
          <Row icon="heart-outline" title="Health profile" sub="Blood group, genotype, conditions, allergies"
            chevron onPress={() => navigation?.navigate('MedicalHistory')} />
          <Hair />
          <Row icon="shield-checkmark-outline" title="Insurance / HMO" sub="Provider, plan and member ID"
            chevron onPress={() => navigation?.navigate('Insurance')} />
        </Card>

        <SectionHead title="App" />
        <Card>
          <Row icon="notifications-outline" title="Notifications" sub="Push, WhatsApp, SMS, email"
            chevron onPress={() => navigation?.navigate('Notifications')} />
          <Hair />
          {canLock && (
            <>
              <Row
                icon="finger-print-outline"
                title="Biometric unlock"
                sub={lockOn ? 'On · asks when you open Queue' : 'Off'}
                right={
                  <Switch
                    value={lockOn}
                    accessibilityLabel="Unlock with fingerprint or face"
                    onValueChange={async v => { if (await setAppLockEnabled(v)) setLockOn(v) }}
                    trackColor={{ true: t.q.primary, false: t.q.line }}
                    thumbColor="#FFFFFF"
                  />
                }
              />
              <Hair />
            </>
          )}
          <Row icon="lock-closed-outline" title="Privacy & security" sub="Password and signed-in devices"
            chevron onPress={() => navigation?.navigate('PrivacySecurity')} />
          <Hair />
          <Row icon="help-circle-outline" title="Help & support" sub="Chat, call or email us"
            chevron onPress={() => navigation?.navigate('Support')} />
        </Card>

        <SectionHead title="Appearance" />
        <View style={{ marginTop: -8 }}>
          <Seg<'light' | 'dark'>
            value={mode}
            onChange={v => { if (v !== mode) toggleTheme() }}
            options={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]}
          />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
          {!confirm ? (
            <Btn label="Sign out" variant="secondary" onPress={() => { haptics.tap(); setConfirm(true) }} />
          ) : (
            <Card pad style={{ marginHorizontal: 0, gap: 12 }}>
              <CardLabel>Sign out of your account?</CardLabel>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: t.q.ink70 }}>
                Your bookings stay where they are. You will need your password to sign back in.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn grow label="Cancel" variant="secondary" onPress={() => setConfirm(false)} />
                <Btn grow label="Sign out" variant="danger" loading={signingOut} onPress={doSignOut} />
              </View>
            </Card>
          )}

          <DeleteAccount what="your profile, photo, family links and sign-in" />
        </View>
      </Body>
    </Screen>
  )
}
