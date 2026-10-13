import { useState, useEffect } from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Header, Card, ListRow, SectionTitle, SegmentedControl, PrimaryButton, ServiceTile } from '@queue/shared/components/ui/v3'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'

const ROLE_LABEL: Record<string, string> = {
  front_desk: 'Front Desk', clinic_admin: 'Clinic Admin', hospital_admin: 'Hospital Admin',
}

interface Props { navigation: any }

export function StaffMoreScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { staffProfile, signOut } = useAuth()
  const [hospitalName,   setHospitalName]   = useState<string | null>(null)
  const [clinicModel,    setClinicModel]    = useState<string | null>(null)
  const [signingOut,     setSigningOut]      = useState(false)
  const [confirmVisible, setConfirmVisible]  = useState(false)

  const isAdmin = staffProfile?.role === 'hospital_admin'
  const isClinicAdmin = staffProfile?.role === 'clinic_admin'
  const initials = staffProfile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    if (!staffProfile?.hospitalId) return
    ;supabase
      .from('hospitals').select('name, clinic_model').eq('id', staffProfile.hospitalId).single()
      .then(({ data }: { data: { name: string; clinic_model: string | null } | null }) => {
        if (data) { setHospitalName(data.name); setClinicModel(data.clinic_model) }
      })
  }, [staffProfile?.hospitalId])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  const menuItems = [
    { icon: 'people-circle-outline', label: 'Patients', sub: 'Everyone who has visited', onPress: () => navigation.navigate('Patients') },
    { icon: 'chatbubbles-outline', label: 'Messages', sub: 'Patients, doctors, crews', onPress: () => navigation.navigate('HospitalMessages') },
    ...(isAdmin || isClinicAdmin ? [
      { icon: 'videocam-outline', label: 'Virtual Care', sub: 'Video consultations', onPress: () => navigation.navigate('VirtualCare') },
      { icon: 'checkbox-outline', label: 'Care Plans', sub: 'Plans and adherence', onPress: () => navigation.navigate('HospitalCarePlans') },
    ] : []),
    { icon: 'time-outline', label: 'Staff shifts', sub: isAdmin ? 'Plan the weekly rota' : 'Your shifts and the rota', onPress: () => navigation.navigate('StaffShifts') },
    // Staff Management also holds doctor-linking (see StaffManagementScreen's
    // own role check for what a sub-admin can and can't do once inside it) --
    // a clinic's own sub-admin needs to reach it to add a doctor to their
    // clinic, same as web's clinic-detail page already lets them.
    ...(isAdmin || isClinicAdmin ? [
      { icon: 'people-outline', label: 'Staff & doctors', sub: 'Invite, link and manage', onPress: () => navigation.navigate('StaffManagement') },
    ] : []),
    // Mirrors web's dashboard/ambulances/page.tsx role gate (admin/owner/front_desk) --
    // front_desk had no management menu item at all before this; Ambulances is now the
    // first one that role sees. Alerts/Coverage/Fleet are reached from inside that
    // screen (same hub-and-spoke shape as the web page's own button row), not listed
    // here separately.
    ...(isAdmin || staffProfile?.role === 'front_desk' ? [
      { icon: 'medical-outline', label: 'Ambulance desk', sub: 'Inbound, fleet, alerts', onPress: () => navigation.navigate('AmbulanceRequests') },
    ] : []),
    ...(isAdmin ? [
      { icon: 'analytics-outline', label: 'Analytics', sub: 'Trends and revenue', onPress: () => navigation.navigate('StaffAnalytics') },
      // Only hospitals onboarded with the multi-clinic model have clinics to manage --
      // mirrors web's Sidebar.tsx, which hides its own Clinics nav item the same way.
      ...(clinicModel === 'multi' ? [
        { icon: 'business-outline', label: 'Clinics', sub: 'Departments and admins', onPress: () => navigation.navigate('HospitalClinics') },
      ] : []),
      { icon: 'medkit-outline', label: 'Services', sub: 'Specialties and prices', onPress: () => navigation.navigate('HospitalServices') },
      { icon: 'calendar-outline', label: 'Doctor schedule', sub: 'Shifts and availability', onPress: () => navigation.navigate('HospitalSchedule') },
      { icon: 'settings-outline', label: 'Hospital settings', sub: 'Profile, hours, payments', onPress: () => navigation.navigate('HospitalSettings') },
    ] : []),
  ]

  // v3.1 All Modules (h-menu): identity in the teal header, a grid of every module this
  // role can open (hidden when it can't), then the same account block as the other apps.
  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <ProfileAvatar size={60} editable name={staffProfile?.name} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{staffProfile?.name ?? 'Staff'}</Text>
            <Text numberOfLines={1} style={{ color: '#CCFBF1', fontSize: 13, marginTop: 2 }}>
              {ROLE_LABEL[staffProfile?.role ?? ''] ?? 'Staff'}{hospitalName ? ` · ${hospitalName}` : ''}
            </Text>
          </View>
        </View>
      </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ padding: 20, gap: 14 }}>
          {menuItems.length > 0 && (
            <>
              <SectionTitle title="All modules" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {menuItems.map(item => (
                  <View key={item.label} style={{ flexBasis: '47%', flexGrow: 1 }}>
                    <ServiceTile icon={item.icon as any} label={item.label} sublabel={item.sub} onPress={item.onPress} />
                  </View>
                ))}
              </View>
            </>
          )}

          <SectionTitle title="Account" />
          <Card style={{ paddingVertical: 0 }}>
            <ListRow icon="person-circle-outline" title="My profile" subtitle="Role, clinic and sign out" last
              onPress={() => navigation.navigate('FrontDeskProfile')} />
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
