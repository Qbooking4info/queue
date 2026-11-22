import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { getMyHospital } from '@queue/shared/lib/admin-api'
import { useUnreadMessages } from '@queue/shared/hooks/useUnreadMessages'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg,
} from '@queue/shared/components/q'
import type { Ionicons } from '@expo/vector-icons'

const ROLE_LABEL: Record<string, string> = {
  front_desk: 'Front desk',
  clinic_admin: 'Clinic admin',
  hospital_admin: 'Hospital admin',
}

interface Item {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  sub: string
  onPress: () => void
}

interface Props { navigation: any }

/**
 * Every module this role can open, grouped by what it is for.
 *
 * It was a grid of equal tiles. A grid says every destination is equally
 * likely, which is wrong: a front desk opens the ambulance desk many times a
 * day and hospital settings twice a year. Rows in named groups put them in
 * order and leave room to say what each one holds.
 */
export function StaffMoreScreen({ navigation }: Props) {
  const { theme: t, mode, toggleTheme } = useTheme()
  const { staffProfile } = useAuth()
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [clinicModel, setClinicModel] = useState<string | null>(null)
  const unread = useUnreadMessages('hospital')

  const isAdmin = staffProfile?.role === 'hospital_admin'
  const isClinicAdmin = staffProfile?.role === 'clinic_admin'
  const isFrontDesk = staffProfile?.role === 'front_desk'

  useEffect(() => {
    if (!staffProfile?.hospitalId) return
    getMyHospital(staffProfile.hospitalId).then(h => {
      if (h) { setHospitalName(h.name); setClinicModel(h.clinic_model) }
    })
  }, [staffProfile?.hospitalId])

  const operations: Item[] = [
    // Mirrors web's dashboard/ambulances role gate (admin / owner / front_desk).
    ...(isAdmin || isFrontDesk ? [
      { icon: 'medical-outline' as const, label: 'Ambulance desk', sub: 'Patients being brought here', onPress: () => navigation.navigate('AmbulanceRequests') },
      { icon: 'medkit-outline' as const, label: 'Request ambulance', sub: 'Transfer a patient out', onPress: () => navigation.navigate('RequestAmbulance') },
    ] : []),
    { icon: 'bed-outline', label: 'Ward & triage capacity', sub: 'What patients and crews are told', onPress: () => navigation.navigate('Beds') },
    ...(isAdmin || isClinicAdmin ? [
      { icon: 'videocam-outline' as const, label: 'Virtual care', sub: 'Video consultations', onPress: () => navigation.navigate('VirtualCare') },
    ] : []),
    { icon: 'flask-outline', label: 'Laboratory', sub: 'Tests ordered here, and filing results', onPress: () => navigation.navigate('LabOrders') },
    { icon: 'people-circle-outline', label: 'Patients', sub: 'Search records', onPress: () => navigation.navigate('Patients') },
    {
      icon: 'chatbubbles-outline',
      label: 'Messages',
      sub: unread > 0 ? `${unread} unread · patients, doctors and crews` : 'Patients, doctors and crews',
      onPress: () => navigation.navigate('HospitalMessages'),
    },
  ]

  const admin: Item[] = [
    // Staff management also holds doctor-linking, so a clinic's own sub-admin
    // needs it to add a doctor to their clinic -- same as web's clinic detail.
    ...(isAdmin || isClinicAdmin ? [
      { icon: 'people-outline' as const, label: 'Staff & doctors', sub: 'Invite, link and manage', onPress: () => navigation.navigate('StaffManagement') },
    ] : []),
    { icon: 'time-outline', label: 'Staff shifts', sub: isAdmin ? 'Plan the weekly rota' : 'Your shifts and the rota', onPress: () => navigation.navigate('StaffShifts') },
    ...(isAdmin ? [
      { icon: 'calendar-outline' as const, label: 'Doctor schedule', sub: 'Slots and working days', onPress: () => navigation.navigate('HospitalSchedule') },
      // Only multi-clinic hospitals have clinics to manage -- mirrors web's
      // Sidebar, which hides its own Clinics item the same way.
      ...(clinicModel === 'multi' ? [
        { icon: 'business-outline' as const, label: 'Clinics', sub: 'Departments and their admins', onPress: () => navigation.navigate('HospitalClinics') },
      ] : []),
      { icon: 'pricetags-outline' as const, label: 'Services & prices', sub: 'Specialties and what they cost', onPress: () => navigation.navigate('HospitalServices') },
      { icon: 'analytics-outline' as const, label: 'Analytics', sub: 'Appointments, revenue and trends', onPress: () => navigation.navigate('StaffAnalytics') },
      { icon: 'settings-outline' as const, label: 'Hospital settings', sub: 'Hours, fees, payout', onPress: () => navigation.navigate('HospitalSettings') },
    ] : []),
    { icon: 'person-circle-outline', label: 'My profile', sub: 'Role, clinic and sign out', onPress: () => navigation.navigate('FrontDeskProfile') },
  ]

  const group = (items: Item[]) => (
    <Card>
      {items.map((item, i) => (
        <View key={item.label}>
          {i > 0 && <Hair />}
          <Row icon={item.icon} title={item.label} sub={item.sub} chevron onPress={item.onPress} />
        </View>
      ))}
    </Card>
  )

  return (
    <Screen>
      <AppBar large title="More" />

      <Body>
        <Card>
          <Row
            leading={<ProfileAvatar size={44} editable name={staffProfile?.name} />}
            title={staffProfile?.name ?? 'Staff'}
            sub={[ROLE_LABEL[staffProfile?.role ?? ''] ?? 'Staff', hospitalName].filter(Boolean).join(' · ')}
            chevron
            onPress={() => navigation.navigate('FrontDeskProfile')}
          />
        </Card>

        <SectionHead title="Operations" />
        {group(operations)}

        <SectionHead title="Admin" />
        {group(admin)}

        <SectionHead title="Appearance" />
        <View style={{ marginTop: -8 }}>
          <Seg<'light' | 'dark'>
            value={mode}
            onChange={v => { if (v !== mode) toggleTheme() }}
            options={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]}
          />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
            Signing out, and deleting your staff account, live on your profile.
          </Text>
        </View>
      </Body>
    </Screen>
  )
}
