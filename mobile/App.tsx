import 'react-native-url-polyfill/auto'
import { useState } from 'react'
import React from 'react'
import * as Sentry from '@sentry/react-native'

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 })
}

import { NavigationContainer } from '@react-navigation/native'
import { navigationRef, flushPendingNavigation } from './lib/navigation'
import { OfflineBanner } from './components/ui/OfflineBanner'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { ThemeProvider, useTheme }     from './contexts/ThemeContext'
import { AuthProvider, useAuth }       from './contexts/AuthContext'
import { LocationProvider }            from './contexts/LocationContext'
import { usePushNotifications }        from './hooks/usePushNotifications'

// Patient screens
import { SplashScreen }             from './screens/SplashScreen'
import { LoginScreen }              from './screens/LoginScreen'
import { RegisterScreen }           from './screens/RegisterScreen'
import { HomeScreen }               from './screens/HomeScreen'
import { SearchScreen }             from './screens/SearchScreen'
import { AppointmentsScreen }       from './screens/AppointmentsScreen'
import { ProfileScreen }            from './screens/ProfileScreen'
import { HospitalProfileScreen }    from './screens/HospitalProfileScreen'
import { BookingFlowScreen }        from './screens/BookingFlowScreen'
import { DoctorSearchScreen }       from './screens/DoctorSearchScreen'
import { DoctorProfileScreen }      from './screens/DoctorProfileScreen'
import { DirectBookingScreen }      from './screens/DirectBookingScreen'
import { SpecialtyBrowseScreen }    from './screens/SpecialtyBrowseScreen'
import { SpecialtyResultsScreen }   from './screens/SpecialtyResultsScreen'
import { ConfirmationScreen }       from './screens/ConfirmationScreen'
import { NotificationsScreen }      from './screens/NotificationsScreen'
import { AppointmentDetailScreen }  from './screens/AppointmentDetailScreen'
import { EmergencyBookingScreen }      from './screens/EmergencyBookingScreen'
import { EmergencyConfirmationScreen } from './screens/EmergencyConfirmationScreen'
import { AmbulanceTrackingScreen }     from './screens/AmbulanceTrackingScreen'
import { MedicalHistoryScreen }        from './screens/MedicalHistoryScreen'
import { DependentsScreen }            from './screens/DependentsScreen'
import { PrescriptionsScreen }         from './screens/PrescriptionsScreen'
import { PrivacySecurityScreen }       from './screens/PrivacySecurityScreen'
import { InsuranceScreen }             from './screens/InsuranceScreen'
import { SupportScreen }               from './screens/SupportScreen'

// Specialist screens
import { SpecialistQueueScreen }   from './screens/specialist/SpecialistQueueScreen'
import { PatientConsultScreen }    from './screens/specialist/PatientConsultScreen'
import { SpecialistProfileScreen } from './screens/specialist/SpecialistProfileScreen'
import { ReferPatientScreen }      from './screens/specialist/ReferPatientScreen'

// react-native-agora is a native module Expo Go can't load at all -- lazy-load
// these two screens so the rest of the app still runs under Expo Go in dev,
// and only the video call screens themselves need a real dev build.
const VideoCallScreenLazy = React.lazy(() =>
  import('./screens/VideoCallScreen').then(m => ({ default: m.VideoCallScreen }))
)
function VideoCallScreen(props: any) {
  return (
    <React.Suspense fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>}>
      <VideoCallScreenLazy {...props} />
    </React.Suspense>
  )
}
const DoctorVideoCallScreenLazy = React.lazy(() =>
  import('./screens/specialist/DoctorVideoCallScreen').then(m => ({ default: m.DoctorVideoCallScreen }))
)
function DoctorVideoCallScreen(props: any) {
  return (
    <React.Suspense fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>}>
      <DoctorVideoCallScreenLazy {...props} />
    </React.Suspense>
  )
}

// Front desk / Admin screens
import { FrontDeskQueueScreen }   from './screens/frontdesk/FrontDeskQueueScreen'
import { FrontDeskProfileScreen } from './screens/frontdesk/FrontDeskProfileScreen'
import { AdminDashboardScreen }   from './screens/admin/AdminDashboardScreen'

// Ambulance crew screens
import { CrewHomeScreen }    from './screens/crew/CrewHomeScreen'
import { CrewProfileScreen } from './screens/crew/CrewProfileScreen'

// New staff screens
import { StaffAppointmentsScreen } from './screens/staff/StaffAppointmentsScreen'
import { WalkInBookingScreen }     from './screens/staff/WalkInBookingScreen'
import { StaffAnalyticsScreen }    from './screens/staff/StaffAnalyticsScreen'
import { StaffManagementScreen }   from './screens/staff/StaffManagementScreen'
import { HospitalSettingsScreen }  from './screens/staff/HospitalSettingsScreen'
import { StaffMoreScreen }         from './screens/staff/StaffMoreScreen'

// Onboarding & auth
import { HospitalOnboardingScreen } from './screens/onboarding/HospitalOnboardingScreen'
import { RoleSelectScreen }          from './screens/RoleSelectScreen'
import { HospitalAuthScreen }        from './screens/HospitalAuthScreen'
import { HospitalRegisterScreen }    from './screens/HospitalRegisterScreen'
// Registers the crew background-location task. Must be imported at app start:
// TaskManager needs the task defined before the OS can deliver work to a
// cold-started process, otherwise on-duty crews silently stop reporting.
import './lib/location-task'

const Tab        = createBottomTabNavigator()
const Stack      = createNativeStackNavigator()
const DocTab     = createBottomTabNavigator()
const DocStack   = createNativeStackNavigator()
const FDTab      = createBottomTabNavigator()
const FDStack    = createNativeStackNavigator()
const CrewTab    = createBottomTabNavigator()
const AuthNav    = createNativeStackNavigator()
const PatientNav = createNativeStackNavigator()
const HospitalNav = createNativeStackNavigator()

function TabIcon({ name, focused, color }: { name: React.ComponentProps<typeof Ionicons>['name']; focused: boolean; color: string }) {
  return <Ionicons name={name} size={22} color={color} />
}

// ── Patient navigator ─────────────────────────────────────────────────────────

function MainTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: 52 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
    }}>
      <Tab.Screen name="Home"         component={HomeScreen}         options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'home' : 'home-outline'} {...p} />,             tabBarLabel: 'Home' }} />
      <Tab.Screen name="Search"       component={SearchScreen}       options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'search' : 'search-outline'} {...p} />,         tabBarLabel: 'Search' }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'calendar' : 'calendar-outline'} {...p} />,     tabBarLabel: 'Bookings' }} />
      <Tab.Screen name="Profile"      component={ProfileScreen}      options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />,         tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  )
}

function AppStack() {
  const { pendingHospitalOnboarding } = useAuth()
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      initialRouteName={pendingHospitalOnboarding ? 'HospitalOnboarding' : 'MainTabs'}
    >
      <Stack.Screen name="MainTabs"             component={MainTabs} />
      <Stack.Screen name="HospitalOnboarding"   component={HospitalOnboardingScreen} />
      <Stack.Screen name="HospitalProfile"      component={HospitalProfileScreen} />
      <Stack.Screen name="BookingFlow"          component={BookingFlowScreen} />
      <Stack.Screen name="DoctorSearch"         component={DoctorSearchScreen} />
      <Stack.Screen name="DoctorProfile"        component={DoctorProfileScreen} />
      <Stack.Screen name="DirectBooking"        component={DirectBookingScreen} />
      <Stack.Screen name="SpecialtyBrowse"      component={SpecialtyBrowseScreen} />
      <Stack.Screen name="SpecialtyResults"     component={SpecialtyResultsScreen} />
      <Stack.Screen name="Confirmation"         component={ConfirmationScreen}         options={{ animation: 'fade' }} />
      <Stack.Screen name="Notifications"        component={NotificationsScreen} />
      <Stack.Screen name="AppointmentDetail"    component={AppointmentDetailScreen} />
      <Stack.Screen name="EmergencyBooking"     component={EmergencyBookingScreen} />
      <Stack.Screen name="EmergencyConfirmation" component={EmergencyConfirmationScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="AmbulanceTracking"     component={AmbulanceTrackingScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="MedicalHistory"       component={MedicalHistoryScreen} />
      <Stack.Screen name="Dependents"           component={DependentsScreen} />
      <Stack.Screen name="Prescriptions"        component={PrescriptionsScreen} />
      <Stack.Screen name="PrivacySecurity"      component={PrivacySecurityScreen} />
      <Stack.Screen name="Insurance"            component={InsuranceScreen} />
      <Stack.Screen name="Support"              component={SupportScreen} />
      <Stack.Screen name="VideoCall"            component={VideoCallScreen as any} options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack.Navigator>
  )
}

// ── Specialist navigator ──────────────────────────────────────────────────────

function SpecialistTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <DocTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: 52 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
    }}>
      <DocTab.Screen name="Queue"             component={SpecialistQueueScreen}   options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'list' : 'list-outline'} {...p} />,         tabBarLabel: 'Queue' }} />
      <DocTab.Screen name="SpecialistProfile" component={SpecialistProfileScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />,     tabBarLabel: 'Profile' }} />
    </DocTab.Navigator>
  )
}

function SpecialistStack() {
  return (
    <DocStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <DocStack.Screen name="SpecialistTabs"  component={SpecialistTabs} />
      <DocStack.Screen name="PatientConsult"  component={PatientConsultScreen  as any} />
      <DocStack.Screen name="ReferPatient"    component={ReferPatientScreen    as any} />
      <DocStack.Screen name="DoctorVideoCall" component={DoctorVideoCallScreen as any} options={{ animation: 'fade', gestureEnabled: false }} />
    </DocStack.Navigator>
  )
}

// ── Staff / Admin navigator ───────────────────────────────────────────────────

function StaffTabs() {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const insets = useSafeAreaInsets()
  const role = staffProfile?.role

  const isAdmin       = role === 'hospital_admin'
  const isClinicAdmin = role === 'clinic_admin'
  const isFrontDesk   = role === 'front_desk'

  return (
    <FDTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: 52 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
    }}>
      {/* Dashboard — admin & clinic admin */}
      {(isAdmin || isClinicAdmin) && (
        <FDTab.Screen name="FDDashboard" component={AdminDashboardScreen}
          options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'grid' : 'grid-outline'} {...p} />, tabBarLabel: 'Dashboard' }} />
      )}

      {/* Queue — all roles */}
      <FDTab.Screen name="FDQueue" component={FrontDeskQueueScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'list' : 'list-outline'} {...p} />, tabBarLabel: 'Queue' }} />

      {/* Walk-in — front desk & admin */}
      {(isAdmin || isClinicAdmin || isFrontDesk) && (
        <FDTab.Screen name="WalkIn" component={WalkInBookingScreen}
          options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person-add' : 'person-add-outline'} {...p} />, tabBarLabel: 'Walk-in' }} />
      )}

      {/* Appointments — all roles */}
      <FDTab.Screen name="StaffAppointments" component={StaffAppointmentsScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'calendar' : 'calendar-outline'} {...p} />, tabBarLabel: 'Bookings' }} />

      {/* More — admin gets analytics/staff/settings; others get profile */}
      {(isAdmin || isClinicAdmin) ? (
        <FDTab.Screen name="StaffMore" component={StaffMoreScreen}
          options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} {...p} />, tabBarLabel: 'More' }} />
      ) : (
        <FDTab.Screen name="FDProfile" component={FrontDeskProfileScreen}
          options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
      )}
    </FDTab.Navigator>
  )
}

function StaffStack() {
  return (
    <FDStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <FDStack.Screen name="StaffTabs"       component={StaffTabs} />
      <FDStack.Screen name="StaffAnalytics"  component={StaffAnalyticsScreen} />
      <FDStack.Screen name="StaffManagement" component={StaffManagementScreen} />
      <FDStack.Screen name="HospitalSettings" component={HospitalSettingsScreen} />
    </FDStack.Navigator>
  )
}

// ── Ambulance crew navigator ──────────────────────────────────────────────────

function CrewTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <CrewTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: 52 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
    }}>
      <CrewTab.Screen name="CrewHome"    component={CrewHomeScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'medkit' : 'medkit-outline'} {...p} />,   tabBarLabel: 'Jobs' }} />
      <CrewTab.Screen name="CrewProfile" component={CrewProfileScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </CrewTab.Navigator>
  )
}

// ── Auth navigators ───────────────────────────────────────────────────────────

function PatientAuthStack() {
  return (
    <PatientNav.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <PatientNav.Screen name="Login"    component={LoginScreen} />
      <PatientNav.Screen name="Register" component={RegisterScreen} />
    </PatientNav.Navigator>
  )
}

function HospitalAuthStack() {
  return (
    <HospitalNav.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <HospitalNav.Screen name="HospitalPortal"     component={HospitalAuthScreen} />
      <HospitalNav.Screen name="HospitalRegister"   component={HospitalRegisterScreen} />
    </HospitalNav.Navigator>
  )
}

function RootAuthNavigator() {
  return (
    <AuthNav.Navigator initialRouteName="RoleSelect" screenOptions={{ headerShown: false, animation: 'fade' }}>
      <AuthNav.Screen name="RoleSelect"   component={RoleSelectScreen} />
      <AuthNav.Screen name="PatientAuth"  component={PatientAuthStack} />
      <AuthNav.Screen name="HospitalAuth" component={HospitalAuthStack} />
    </AuthNav.Navigator>
  )
}

// ── Root navigator ────────────────────────────────────────────────────────────

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const { session, loading, user, doctorProfile, staffProfile, crewProfile, staffMode } = useAuth()
  const { theme: t } = useTheme()
  usePushNotifications(user?.id)

  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} size="large" />
        </View>
      </SafeAreaProvider>
    )
  }

  if (session) {
    let content: React.ReactElement
    if (staffMode && doctorProfile) {
      content = <SpecialistStack />
    } else if (staffMode && (staffProfile?.role === 'ambulance_crew' || crewProfile)) {
      content = <CrewTabs />
    } else if (staffMode && staffProfile) {
      content = <StaffStack />
    } else {
      content = <AppStack />
    }
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
          <OfflineBanner />
          <SafeAreaProvider style={{ flex: 1 }}>
            <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>{content}</NavigationContainer>
          </SafeAreaProvider>
        </View>
      </SafeAreaProvider>
    )
  }

  if (!splashDone) {
    return (
      <SafeAreaProvider>
        <SplashScreen
          onGetStarted={() => setSplashDone(true)}
          onSignIn={() => setSplashDone(true)}
        />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <OfflineBanner />
        {/* Nested provider so the banner's height is subtracted from the insets
            the screens below see. Without it every screen would add the full top
            inset again and sit in a gap under the banner. */}
        <SafeAreaProvider style={{ flex: 1 }}>
          <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>
            <RootAuthNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </View>
    </SafeAreaProvider>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LocationProvider>
          <AppNavigator />
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default process.env.EXPO_PUBLIC_SENTRY_DSN ? Sentry.wrap(App) : App
