import { useState, useEffect } from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Header, Card, ListRow, SectionTitle, SegmentedControl, PrimaryButton } from '@queue/shared/components/ui/v3'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'
import { getMyHospital } from '@queue/shared/lib/admin-api'

interface Props { navigation?: any }

const ROLE_LABEL: Record<string, string> = {
  front_desk:      'Front Desk',
  clinic_admin:    'Clinic Administrator',
  hospital_admin:  'Hospital Administrator',
}

export function FrontDeskProfileScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { staffProfile, signOut }          = useAuth()
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut,     setSigningOut]     = useState(false)
  const [hospitalName,   setHospitalName]   = useState<string | null>(null)

  const initials = staffProfile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    if (!staffProfile?.hospitalId) return
    getMyHospital(staffProfile.hospitalId).then(h => { if (h) setHospitalName(h.name) })
  }, [staffProfile?.hospitalId])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  // Same profile layout as every other Queue app (patient, doctor, crew).
  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <ProfileAvatar size={68} editable name={staffProfile?.name} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{staffProfile?.name ?? 'Staff'}</Text>
            <Text numberOfLines={1} style={{ color: '#CCFBF1', fontSize: 13, marginTop: 2 }}>
              {ROLE_LABEL[staffProfile?.role ?? ''] ?? staffProfile?.role ?? 'Staff'}{hospitalName ? ` · ${hospitalName}` : ''}
            </Text>
          </View>
        </View>
      </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ padding: 20, gap: 14 }}>
          <SectionTitle title="Details" />
          <Card style={{ paddingVertical: 0 }}>
            <ListRow icon="id-card-outline" title="Role" last={!staffProfile?.clinicId}
              trailing={<Text style={{ fontSize: 14, fontWeight: '600', color: t.textPrimary }}>{ROLE_LABEL[staffProfile?.role ?? ''] ?? '—'}</Text>} />
            {staffProfile?.clinicId && (
              <ListRow icon="business-outline" title="Assigned clinic" last
                trailing={<Text style={{ fontSize: 14, fontWeight: '600', color: t.textPrimary }} numberOfLines={1}>{staffProfile.clinicId}</Text>} />
            )}
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary }}>Appearance</Text>
            <SegmentedControl<'light' | 'dark'> value={themeId === 'forest' ? 'dark' : 'light'}
              onChange={v => { if (v !== (themeId === 'forest' ? 'dark' : 'light')) toggleTheme() }}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Card>

          {!confirmVisible ? (
            <TouchableOpacity onPress={() => { haptics.tap(); setConfirmVisible(true) }} accessibilityRole="button"
              style={{ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.danger, fontSize: 15, fontWeight: '700' }}>Sign out</Text>
            </TouchableOpacity>
          ) : (
            <Card style={{ gap: 12, borderColor: t.dangerBorder }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>Sign out of your account?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><PrimaryButton label="Cancel" variant="ghost" height={48} onPress={() => setConfirmVisible(false)} /></View>
                <View style={{ flex: 1 }}><PrimaryButton label="Sign out" variant="danger" height={48} loading={signingOut} onPress={handleSignOut} /></View>
              </View>
            </Card>
          )}

          <DeleteAccount what="your staff profile, photo and sign-in (the hospital itself stays)" />
        </View>
      </ScrollView>
    </View>
  )
}
