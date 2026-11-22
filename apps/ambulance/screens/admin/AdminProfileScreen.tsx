import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, Btn,
} from '@queue/shared/components/q'

interface Props { navigation: any }

export function AdminProfileScreen({ navigation }: Props) {
  const { theme: t, mode, toggleTheme } = useTheme()
  const { providerAdminProfile, user, signOut } = useAuth()
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const isHospitalFleet = providerAdminProfile?.providerType === 'hospital_fleet'
  const orgName = providerAdminProfile?.providerName
  const roleLabel = providerAdminProfile?.role === 'owner'
    ? (isHospitalFleet ? 'Hospital fleet owner' : 'Owner')
    : (isHospitalFleet ? 'Hospital fleet admin' : 'Admin')

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <Screen>
      <AppBar large title="Profile" />

      <Body>
        <Card>
          {/* alignItems lives on this inner View, never on the Card itself --
              a Card given alignItems shrink-wraps instead of filling its row. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
            <ProfileAvatar name={user?.full_name ?? '—'} size={60} editable />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.27, color: t.q.ink }}>
                {user?.full_name ?? '—'}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 13, color: t.q.ink60 }}>
                {[roleLabel, orgName].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          {!!user?.phone && (
            <>
              <Hair />
              <Row compact icon="call-outline" title={user.phone} sub="Your phone" />
            </>
          )}
        </Card>

        <SectionHead title="Your service" />
        <Card>
          <Row icon="options-outline" title="Service settings" sub="Coverage, hours and caps"
            chevron onPress={() => navigation.navigate('ProviderSettings')} />
          <Hair />
          <Row icon="car-sport-outline" title="Your fleet" sub="Ambulances, crews and shifts"
            chevron onPress={() => navigation.navigate('AdminFleet')} />
        </Card>

        <SectionHead title="Appearance" />
        <Seg<'light' | 'dark'>
          value={mode === 'dark' ? 'dark' : 'light'}
          onChange={v => { if (v !== (mode === 'dark' ? 'dark' : 'light')) toggleTheme() }}
          options={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} />

        <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 12 }}>
          {confirmVisible ? (
            <Card>
              <View style={{ padding: 14, gap: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: t.q.ink }}>Sign out of your account?</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Btn grow label="Cancel" variant="secondary" onPress={() => setConfirmVisible(false)} />
                  <Btn grow label="Sign out" variant="danger" loading={signingOut}
                    onPress={() => { haptics.tap(); handleSignOut() }} />
                </View>
              </View>
            </Card>
          ) : (
            <Btn label="Sign out" variant="danger" onPress={() => setConfirmVisible(true)} />
          )}
        </View>
      </Body>
    </Screen>
  )
}
