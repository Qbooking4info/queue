import 'react-native-url-polyfill/auto'
import { useState } from 'react'
import React from 'react'
import * as Sentry from '@sentry/react-native'

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 })
}

import { NavigationContainer } from '@react-navigation/native'
import { navigationRef, flushPendingNavigation } from '@queue/shared/lib/navigation'
import { OfflineBanner } from '@queue/shared/components/ui/OfflineBanner'
import { SwitchedAccountBanner } from '@queue/shared/components/ui/SwitchedAccountBanner'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { ThemeProvider, useTheme }     from '@queue/shared/contexts/ThemeContext'
import { AlertProvider }               from '@queue/shared/contexts/AlertContext'
import { AuthProvider, useAuth }       from '@queue/shared/contexts/AuthContext'
import { LocationProvider }            from '@queue/shared/contexts/LocationContext'
import { usePushNotifications }        from '@queue/shared/hooks/usePushNotifications'
import { useRingAlert, RingOverlay }   from '@queue/shared/components/RingOverlay'

// Patient screens
import { SplashScreen }             from '@queue/shared/screens/SplashScreen'
import { LoginScreen }              from '@queue/shared/screens/LoginScreen'
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
// Migrated from the standalone doctors/ app when it was folded into this one.

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

// Front desk / Admin screens

// Ambulance crew screens

// New staff screens

// Onboarding & auth
// Registers the crew background-location task. Must be imported at app start:
// TaskManager needs the task defined before the OS can deliver work to a
// cold-started process, otherwise on-duty crews silently stop reporting.
import '@queue/shared/lib/location-task'

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
      <Tab.Screen name="DependentsTab" component={DependentsScreen}  options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'people' : 'people-outline'} {...p} />,         tabBarLabel: 'Dependents' }} />
      <Tab.Screen name="Profile"      component={ProfileScreen}      options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />,         tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  )
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MainTabs"             component={MainTabs} />
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



// ── Staff / Admin navigator ───────────────────────────────────────────────────



// ── Ambulance crew navigator ──────────────────────────────────────────────────


// ── Auth navigators ───────────────────────────────────────────────────────────

function PatientAuthStack() {
  return (
    <PatientNav.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <PatientNav.Screen name="Login"    component={LoginScreen} />
      <PatientNav.Screen name="Register" component={RegisterScreen} />
    </PatientNav.Navigator>
  )
}


function RootAuthNavigator() {
  return (
    <AuthNav.Navigator initialRouteName="PatientAuth" screenOptions={{ headerShown: false, animation: 'fade' }}>
      <AuthNav.Screen name="PatientAuth" component={PatientAuthStack} />
    </AuthNav.Navigator>
  )
}

// ── Root navigator ────────────────────────────────────────────────────────────

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const { session, loading, user, switchedInto } = useAuth()
  const { theme: t } = useTheme()
  // Suspended while switched into a dependent's account -- otherwise this device's
  // push token would silently overwrite the dependent's own push_token every time a
  // caretaker switches in, breaking notification delivery to the dependent's own phone.
  usePushNotifications(switchedInto ? undefined : user?.id)

  // "Doctor calls a patient in" overlay. Every signed-in user of this app is a
  // patient now, so the old isPlainPatient guard (which existed to stop a doctor
  // signed into the combined app seeing it) is no longer needed. Mounted at the root
  // so it fires on any tab, not just Home.
  const { ringNotif, dismissRing } = useRingAlert(session ? user?.id : undefined)

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
    const content: React.ReactElement = <AppStack />
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
          <OfflineBanner />
          <SwitchedAccountBanner />
          <SafeAreaProvider style={{ flex: 1 }}>
            <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>{content}</NavigationContainer>
          </SafeAreaProvider>
          {ringNotif && <RingOverlay notif={ringNotif} onDismiss={dismissRing} />}
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
      <AlertProvider>
        <AuthProvider>
          <LocationProvider>
            <AppNavigator />
          </LocationProvider>
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  )
}

export default process.env.EXPO_PUBLIC_SENTRY_DSN ? Sentry.wrap(App) : App
