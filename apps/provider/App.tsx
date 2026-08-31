import 'react-native-url-polyfill/auto'
import { useState } from 'react'
import React from 'react'
import * as Sentry from '@sentry/react-native'
import { NavigationContainer } from '@react-navigation/native'
import { navigationRef, flushPendingNavigation } from '@queue/shared/lib/navigation'
import { OfflineBanner } from '@queue/shared/components/ui/OfflineBanner'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { ThemeProvider, useTheme } from '@queue/shared/contexts/ThemeContext'
import { AlertProvider }           from '@queue/shared/contexts/AlertContext'
import { AuthProvider, useAuth }   from '@queue/shared/contexts/AuthContext'
import { LocationProvider }        from '@queue/shared/contexts/LocationContext'
import { usePushNotifications }    from '@queue/shared/hooks/usePushNotifications'

import { SplashScreen } from '@queue/shared/screens/SplashScreen'
import { LoginScreen }  from '@queue/shared/screens/LoginScreen'

import { HospitalAuthScreen }     from './screens/HospitalAuthScreen'
import { HospitalRegisterScreen } from './screens/HospitalRegisterScreen'
import { HospitalOnboardingScreen } from './screens/onboarding/HospitalOnboardingScreen'

// Doctor
import { DoctorDashboardScreen }    from './screens/specialist/DoctorDashboardScreen'
import { SpecialistQueueScreen }    from './screens/specialist/SpecialistQueueScreen'
import { DoctorAppointmentsScreen } from './screens/specialist/DoctorAppointmentsScreen'
import { SpecialistProfileScreen }  from './screens/specialist/SpecialistProfileScreen'
import { PatientConsultScreen }     from './screens/specialist/PatientConsultScreen'
import { ReferPatientScreen }       from './screens/specialist/ReferPatientScreen'
import { DoctorHospitalsScreen }    from './screens/specialist/DoctorHospitalsScreen'
import { DoctorSettingsScreen }     from './screens/specialist/DoctorSettingsScreen'

// Hospital staff
import { AdminDashboardScreen }    from './screens/admin/AdminDashboardScreen'
import { FrontDeskQueueScreen }    from './screens/frontdesk/FrontDeskQueueScreen'
import { FrontDeskProfileScreen }  from './screens/frontdesk/FrontDeskProfileScreen'
import { WalkInBookingScreen }     from './screens/staff/WalkInBookingScreen'
import { StaffAppointmentsScreen } from './screens/staff/StaffAppointmentsScreen'
import { StaffMoreScreen }         from './screens/staff/StaffMoreScreen'
import { StaffAnalyticsScreen }    from './screens/staff/StaffAnalyticsScreen'
import { StaffManagementScreen }   from './screens/staff/StaffManagementScreen'
import { HospitalSettingsScreen }  from './screens/staff/HospitalSettingsScreen'

// Ambulance crew
import { CrewHomeScreen }    from './screens/crew/CrewHomeScreen'
import { CrewProfileScreen } from './screens/crew/CrewProfileScreen'

// react-native-agora is a native module Expo Go cannot load, so the call screen is
// lazy-loaded exactly as it is in the client app -- importing it eagerly would break
// the whole provider app under Expo Go, not just the call screen.
const DoctorVideoCallScreenLazy = React.lazy(() =>
  import('./screens/specialist/DoctorVideoCallScreen').then(m => ({ default: m.DoctorVideoCallScreen }))
)
function DoctorVideoCallScreen(props: any) {
  return (
    <React.Suspense fallback={<View style={{ flex: 1, backgroundColor: '#050d09' }} />}>
      <DoctorVideoCallScreenLazy {...props} />
    </React.Suspense>
  )
}

const AuthStack  = createNativeStackNavigator()
const DocTab     = createBottomTabNavigator()
const DocStack   = createNativeStackNavigator()
const StaffTab   = createBottomTabNavigator()
const StaffStackN= createNativeStackNavigator()
const CrewTab    = createBottomTabNavigator()
const OnboardStk = createNativeStackNavigator()

function TabIcon({ name, color, size }: any) {
  return <Ionicons name={name} color={color} size={size ?? 22} />
}

function ProviderAuthStack() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="HospitalAuth"     component={HospitalAuthScreen} />
      <AuthStack.Screen name="Login"            component={LoginScreen} />
      <AuthStack.Screen name="HospitalRegister" component={HospitalRegisterScreen} />
    </AuthStack.Navigator>
  )
}

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
      <DocTab.Screen name="Dashboard"         component={DoctorDashboardScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'grid' : 'grid-outline'} {...p} />,         tabBarLabel: 'Home' }} />
      <DocTab.Screen name="Queue"             component={SpecialistQueueScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'list' : 'list-outline'} {...p} />,         tabBarLabel: 'Queue' }} />
      <DocTab.Screen name="Appointments"      component={DoctorAppointmentsScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'calendar' : 'calendar-outline'} {...p} />, tabBarLabel: 'Appointments' }} />
      <DocTab.Screen name="SpecialistProfile" component={SpecialistProfileScreen}  options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />,     tabBarLabel: 'Profile' }} />
    </DocTab.Navigator>
  )
}

function SpecialistStack() {
  return (
    <DocStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <DocStack.Screen name="SpecialistTabs"  component={SpecialistTabs} />
      <DocStack.Screen name="Hospitals"       component={DoctorHospitalsScreen as any} />
      <DocStack.Screen name="Settings"        component={DoctorSettingsScreen  as any} />
      <DocStack.Screen name="PatientConsult"  component={PatientConsultScreen  as any} />
      <DocStack.Screen name="ReferPatient"    component={ReferPatientScreen    as any} />
      <DocStack.Screen name="DoctorVideoCall" component={DoctorVideoCallScreen as any} options={{ animation: 'fade', gestureEnabled: false }} />
    </DocStack.Navigator>
  )
}

function StaffTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <StaffTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: 52 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
    }}>
      <StaffTab.Screen name="AdminDashboard"    component={AdminDashboardScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'grid' : 'grid-outline'} {...p} />,           tabBarLabel: 'Home' }} />
      <StaffTab.Screen name="FrontDeskQueue"    component={FrontDeskQueueScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'list' : 'list-outline'} {...p} />,           tabBarLabel: 'Queue' }} />
      <StaffTab.Screen name="WalkInBooking"     component={WalkInBookingScreen}     options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'add-circle' : 'add-circle-outline'} {...p} />, tabBarLabel: 'Walk-in' }} />
      <StaffTab.Screen name="StaffAppointments" component={StaffAppointmentsScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'calendar' : 'calendar-outline'} {...p} />,   tabBarLabel: 'Appointments' }} />
      <StaffTab.Screen name="StaffMore"         component={StaffMoreScreen}         options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} {...p} />, tabBarLabel: 'More' }} />
    </StaffTab.Navigator>
  )
}

function StaffStack() {
  return (
    <StaffStackN.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <StaffStackN.Screen name="StaffTabs"         component={StaffTabs} />
      <StaffStackN.Screen name="FrontDeskProfile"  component={FrontDeskProfileScreen as any} />
      <StaffStackN.Screen name="StaffAnalytics"    component={StaffAnalyticsScreen   as any} />
      <StaffStackN.Screen name="StaffManagement"   component={StaffManagementScreen  as any} />
      <StaffStackN.Screen name="HospitalSettings"  component={HospitalSettingsScreen as any} />
      <StaffStackN.Screen name="HospitalOnboarding" component={HospitalOnboardingScreen as any} />
    </StaffStackN.Navigator>
  )
}

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
      <CrewTab.Screen name="CrewHome"    component={CrewHomeScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'medkit' : 'medkit-outline'} {...p} />, tabBarLabel: 'Jobs' }} />
      <CrewTab.Screen name="CrewProfile" component={CrewProfileScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </CrewTab.Navigator>
  )
}

// A freshly registered hospital owner has no doctors, staff or crew row yet -- those
// only exist once onboarding creates the hospital. Without this stack they landed on
// the "no provider access" screen immediately after signing up, which is where the
// hospital registration flow dead-ended after the app split.
function HospitalOnboardingStack() {
  return (
    <OnboardStk.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <OnboardStk.Screen name="HospitalOnboarding" component={HospitalOnboardingScreen as any} />
    </OnboardStk.Navigator>
  )
}

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const { session, loading, user, doctorProfile, staffProfile, crewProfile, pendingHospitalOnboarding, signOut } = useAuth()
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
    // Unlike the client app there is no staffMode toggle here: this app IS the staff
    // app, so the role that the account actually has decides the stack outright.
    const hasProviderRole = !!(doctorProfile || staffProfile || crewProfile)

    // Two ways to be mid-registration. pendingHospitalOnboarding is the in-session
    // flag HospitalRegisterScreen sets before signUp. registered_via is written into
    // the auth user's metadata at sign-up and therefore survives a restart -- without
    // checking it, anyone who registered and then closed the app before finishing was
    // permanently locked out behind "no provider access", with no way back in.
    const registeredForHospital =
      (session.user?.user_metadata as Record<string, unknown> | undefined)?.registered_via
        === 'hospital_onboarding'
    const needsHospitalOnboarding = !hasProviderRole && (pendingHospitalOnboarding || registeredForHospital)

    let content: React.ReactElement
    if (needsHospitalOnboarding) {
      content = <HospitalOnboardingStack />
    } else if (doctorProfile) {
      content = <SpecialistStack />
    } else if (staffProfile?.role === 'ambulance_crew' || crewProfile) {
      content = <CrewTabs />
    } else if (staffProfile) {
      content = <StaffStack />
    } else {
      // Signed in with an account that carries no provider role. Say so plainly rather
      // than dropping them into an empty staff dashboard -- a patient signing in here
      // is the likeliest cause, and they want the Queue app instead.
      content = (
        <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Ionicons name="lock-closed-outline" size={44} color={t.textMuted} />
          <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
            No provider access on this account
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            This app is for hospital staff, doctors and ambulance crews. If you are a
            patient, use the Queue app to book and attend appointments.
          </Text>
          {/* Without this there is no way off this screen: the account has no role, so
              no navigator is mounted and back does nothing. */}
          <TouchableOpacity
            onPress={() => { void signOut() }}
            activeOpacity={0.8}
            style={{ marginTop: 18, paddingVertical: 13, paddingHorizontal: 30, borderRadius: 14,
                     borderWidth: 1, borderColor: t.cardBorder }}
          >
            <Text style={{ color: t.textPrimary, fontSize: 14, fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return <SafeAreaProvider>{content}<OfflineBanner /></SafeAreaProvider>
  }

  if (!splashDone) {
    return <SafeAreaProvider><SplashScreen
          onGetStarted={() => setSplashDone(true)}
          onSignIn={() => setSplashDone(true)}
          tagline="FOR HOSPITALS, DOCTORS AND CREWS"
          highlights={['Manage your queue', 'Run consultations', 'Dispatch ambulances']}
          primaryLabel="Sign in"
          showSecondary={false}
        /></SafeAreaProvider>
  }

  return <SafeAreaProvider><ProviderAuthStack /><OfflineBanner /></SafeAreaProvider>
}

function App() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <AuthProvider>
          <LocationProvider>
            <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>
              <AppNavigator />
            </NavigationContainer>
          </LocationProvider>
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  )
}

export default Sentry.wrap(App)
