import { useEffect, useState } from 'react'
import { View, ScrollView, TouchableOpacity, Clipboard, Switch, Image, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { clearCache } from '@queue/shared/lib/cache'
import { pickAndUploadAvatar } from '@queue/shared/lib/avatar'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { biometricAvailable, getAppLockEnabled, setAppLockEnabled } from '@queue/shared/components/AppLock'
import { Header, Card, ListRow, SegmentedControl, PrimaryButton } from '@queue/shared/components/ui/v3'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'

interface Props { navigation?: any }

export function ProfileScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { user, signOut, refreshProfile } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const avatarUrl = (user as any)?.avatar_url as string | null

  async function changePhoto(source: 'library' | 'camera') {
    setUploading(true)
    try {
      const url = await pickAndUploadAvatar(source)
      if (url) { await refreshProfile(); haptics.success() }
    } catch (e) {
      haptics.error()
      Alert.alert('Profile picture', e instanceof Error ? e.message : 'Could not update your picture.')
    } finally { setUploading(false) }
  }
  function askPhoto() {
    haptics.tap()
    Alert.alert('Profile picture', 'Choose a new picture', [
      { text: 'Take photo', onPress: () => changePhoto('camera') },
      { text: 'Choose from photos', onPress: () => changePhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }
  const [canLock, setCanLock] = useState(false)
  const [lockOn, setLockOn] = useState(false)
  useEffect(() => { biometricAvailable().then(setCanLock); getAppLockEnabled().then(setLockOn) }, [])

  // patient_code is the short ID a family member enters to link this account, and
  // what the Queue Pass QR carries. patient_number is the hospital's record number.
  const patientCode = (user as any)?.patient_code ?? null
  const patientNumber = (user as any)?.patient_number ?? null
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const theme: 'light' | 'dark' = themeId === 'forest' ? 'dark' : 'light'

  function copyCode() {
    if (!patientCode) return
    Clipboard.setString(patientCode)
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
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <ProfileAvatar size={68} editable />
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{user?.full_name ?? 'Your profile'}</Text>
              <TouchableOpacity onPress={copyCode} disabled={!patientCode} accessibilityRole="button" accessibilityLabel={patientCode ? `Patient ID ${patientCode}. Copy` : 'Patient ID'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}>
                <Text style={{ color: '#CCFBF1', fontSize: 13 }}>Patient ID {patientCode ?? '—'}</Text>
                {patientCode && <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#CCFBF1" />}
              </TouchableOpacity>
            </View>
          </View>
        </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                <View style={{ padding: 20, gap: 14 }}>
          <Card style={{ paddingVertical: 0 }}>
            <ListRow icon="wallet-outline" title="Wallet" subtitle="Top up and pay for visits in one tap" onPress={() => navigation?.navigate('Wallet')} />
            <ListRow icon="people-outline" title="Family" subtitle="Book and manage care for family members" onPress={() => navigation?.navigate('Dependents')} />
            <ListRow icon="heart-outline" title="Health profile" subtitle="Allergies, conditions, blood group" onPress={() => navigation?.navigate('MedicalHistory')} />
            <ListRow icon="shield-checkmark-outline" title="Insurance / HMO" onPress={() => navigation?.navigate('Insurance')} />
            <ListRow icon="notifications-outline" title="Notifications" subtitle="Push, WhatsApp, SMS, email" last onPress={() => navigation?.navigate('Notifications')} />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary }}>Appearance</Text>
            <SegmentedControl<'light' | 'dark'> value={theme} onChange={v => { if (v !== theme) toggleTheme() }}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Card>

          <Card style={{ paddingVertical: 0 }}>
            {canLock && (
              <ListRow icon="finger-print-outline" title="Unlock with fingerprint or face"
                subtitle={lockOn ? 'On · asks when you open Queue' : 'Off'}
                trailing={<Switch value={lockOn} accessibilityLabel="Unlock with fingerprint or face"
                  onValueChange={async v => { if (await setAppLockEnabled(v)) setLockOn(v) }}
                  trackColor={{ true: t.accent, false: t.cardBorder }} thumbColor="#FFFFFF" />} />
            )}
            <ListRow icon="lock-closed-outline" title="Privacy & security" onPress={() => navigation?.navigate('PrivacySecurity')} />
            <ListRow icon="help-circle-outline" title="Help & support" last onPress={() => navigation?.navigate('Support')} />
          </Card>

          {patientNumber && (
            <Text style={{ fontSize: 12, color: t.textMuted, textAlign: 'center' }}>Hospital record number {patientNumber}</Text>
          )}


          {!confirm ? (
            <TouchableOpacity onPress={() => { haptics.tap(); setConfirm(true) }} accessibilityRole="button"
              style={{ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.danger, fontSize: 15, fontWeight: '700' }}>Sign out</Text>
            </TouchableOpacity>
          ) : (
            <Card style={{ gap: 12, borderColor: t.dangerBorder }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>Sign out of your account?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><PrimaryButton label="Cancel" variant="ghost" height={48} onPress={() => setConfirm(false)} /></View>
                <View style={{ flex: 1 }}><PrimaryButton label="Sign out" variant="danger" height={48} loading={signingOut} onPress={doSignOut} /></View>
              </View>
            </Card>
          )}

          <DeleteAccount what="your profile, photo, family links and sign-in" />
        </View>
      </ScrollView>
    </View>
  )
}
