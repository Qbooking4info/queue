import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'
import { getMyHospital } from '@queue/shared/lib/admin-api'
import { supabase } from '@queue/shared/lib/supabase'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, Btn, CardLabel,
} from '@queue/shared/components/q'

interface Props { navigation?: any }

const ROLE_LABEL: Record<string, string> = {
  front_desk: 'Front desk officer',
  clinic_admin: 'Clinic administrator',
  hospital_admin: 'Hospital administrator',
}

export function FrontDeskProfileScreen({ navigation }: Props) {
  const { theme: t, mode, toggleTheme } = useTheme()
  const { staffProfile, signOut } = useAuth()
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [clinicName, setClinicName] = useState<string | null>(null)

  useEffect(() => {
    if (!staffProfile?.hospitalId) return
    getMyHospital(staffProfile.hospitalId).then(h => { if (h) setHospitalName(h.name) })
  }, [staffProfile?.hospitalId])

  // The old screen printed the clinic's UUID under "Assigned clinic", which is
  // not something a front-desk officer can read or check. Resolve the name.
  useEffect(() => {
    if (!staffProfile?.clinicId) return
    let cancelled = false
    supabase.from('hospital_clinics').select('name').eq('id', staffProfile.clinicId).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setClinicName((data as any).name ?? null) })
    return () => { cancelled = true }
  }, [staffProfile?.clinicId])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <Screen>
      <AppBar title="My profile" onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

      <Body>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 }}>
          <ProfileAvatar size={64} editable name={staffProfile?.name} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text accessibilityRole="header" numberOfLines={1}
              style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: t.q.ink }}>
              {staffProfile?.name ?? 'Staff'}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: t.q.ink60 }}>
              {[ROLE_LABEL[staffProfile?.role ?? ''] ?? 'Staff', hospitalName].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <SectionHead title="Details" />
        <Card>
          <Row icon="id-card-outline" title="Role"
            sub={ROLE_LABEL[staffProfile?.role ?? ''] ?? 'Staff'} />
          {!!staffProfile?.clinicId && (
            <>
              <Hair />
              <Row icon="business-outline" title="Assigned clinic"
                sub={clinicName ?? 'Loading…'} />
            </>
          )}
          <Hair />
          <Row icon="time-outline" title="My shifts" sub="The rota for this week"
            chevron onPress={() => navigation?.navigate('StaffShifts')} />
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
          {!confirmVisible ? (
            <Btn label="Sign out" variant="secondary"
              onPress={() => { haptics.tap(); setConfirmVisible(true) }} />
          ) : (
            <Card pad style={{ marginHorizontal: 0, gap: 12 }}>
              <CardLabel>Sign out of your account?</CardLabel>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: t.q.ink70 }}>
                The queue keeps running. You will need your work email and password to sign back in.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn grow label="Cancel" variant="secondary" onPress={() => setConfirmVisible(false)} />
                <Btn grow label="Sign out" variant="danger" loading={signingOut} onPress={handleSignOut} />
              </View>
            </Card>
          )}

          <DeleteAccount what="your staff profile, photo and sign-in (the hospital itself stays)" />
        </View>
      </Body>
    </Screen>
  )
}
