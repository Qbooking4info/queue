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
import { setStatusBarStyle } from 'expo-status-bar'

import { ThemeProvider, useTheme, V4_PALETTES } from '@queue/shared/contexts/ThemeContext'
import { useQueueFonts } from '@queue/shared/hooks/useQueueFonts'
import { AppLockGate } from '@queue/shared/components/AppLock'
import { AlertProvider }               from '@queue/shared/contexts/AlertContext'
import { AuthProvider, useAuth }       from '@queue/shared/contexts/AuthContext'
import { LocationProvider }            from '@queue/shared/contexts/LocationContext'
import { useDeviceRegistration }   from '@queue/shared/hooks/useDeviceRegistration'
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
import { QueuePassScreen }             from './screens/QueuePassScreen'
import { LiveQueueScreen }             from './screens/LiveQueueScreen'
import { FollowUpScreen }              from './screens/FollowUpScreen'
import { SosScreen }                   from './screens/SosScreen'
import { SosTriageScreen }             from './screens/SosTriageScreen'
import { AmbulanceHomeScreen }         from './screens/AmbulanceHomeScreen'
import { VirtualCareScreen }           from './screens/VirtualCareScreen'
import { MyCareScreen }                from './screens/MyCareScreen'
import { CarePlansScreen }             from './screens/CarePlansScreen'
import { MessagesScreen }              from './screens/MessagesScreen'
import { ChatScreen }                  from '@queue/shared/screens/ChatScreen'
import { WalletScreen }                from './screens/WalletScreen'

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
    // Same dark background VideoCallScreen itself uses (#050d09), and an explicit
    // light spinner color -- without these this fallback rendered as a near-invisible
    // small blue spinner on a plain light-gray background while the chunk loads
    // (react-native-agora is native-only, so this chunk is lazy-loaded and can take
    // a noticeable moment to fetch/compile, especially on a cold dev-server bundle),
    // which read as "the call screen is just a blank white page."
    <React.Suspense fallback={
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050d09' }}>
        <ActivityIndicator color="#fff" />
      </View>
    }>
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
import { useUnreadMessages } from '@queue/shared/hooks/useUnreadMessages'
import { QTabBar } from '@queue/shared/components/q'

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
  const unread = useUnreadMessages('patient')
  return (
    <Tab.Navigator
      // The v4 handoff marks the selected tab with a rule on its own top edge,
      // which the default tab bar cannot draw -- hence a custom one.
      tabBar={props => <QTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home"         component={HomeScreen}         options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} options={{ tabBarLabel: 'Appointments' }} />
      {/* My Records is a tab in v4, and Profile moves to the avatar in Home's
          header -- a patient opens their records far more often than their
          account settings. */}
      <Tab.Screen name="MyRecords"    component={MyCareScreen}       options={{ tabBarLabel: 'My Records' }} />
      <Tab.Screen name="Messages"     component={MessagesScreen}     options={{ tabBarLabel: 'Messages', tabBarBadge: unread > 0 ? '' : undefined }} />
    </Tab.Navigator>
  )
}

// Almost every screen now sits under the teal v3.1 header (light status-bar icons).
// These few have a light top edge instead, so they follow the theme. Set on focus so
// going back restores the right style.
const THEMED_STATUS_ROUTES = new Set(['Sos', 'Confirmation', 'EmergencyConfirmation', 'AmbulanceTracking'])

function AppStack() {
  const { theme: t } = useTheme()
  const themeStyle = t.isDark ? 'light' : 'dark'
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      screenListeners={({ route }) => ({
        focus: () => setStatusBarStyle(THEMED_STATUS_ROUTES.has(route.name) ? themeStyle : 'light', true),
      })}>
      <Stack.Screen name="MainTabs"             component={MainTabs} />
      <Stack.Screen name="Search"               component={SearchScreen} />
      <Stack.Screen name="QueuePass"            component={QueuePassScreen as any} />
      <Stack.Screen name="LiveQueue"            component={LiveQueueScreen as any} />
      {/* "LabHub" in the handoff. The lab half has no data model yet, so the
          screen is the follow-up booking half; the route name stays so the
          handoff's navigation map still resolves. */}
      <Stack.Screen name="LabHub"               component={FollowUpScreen as any} />
      <Stack.Screen name="Sos"                  component={SosScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="SosTriage"            component={SosTriageScreen as any} options={{ gestureEnabled: false }} />
      <Stack.Screen name="AmbulanceHome"        component={AmbulanceHomeScreen} />
      <Stack.Screen name="VirtualCare"          component={VirtualCareScreen} />
      <Stack.Screen name="MyCare"               component={MyCareScreen} />
      {/* Profile left the tab bar when My Records took the fourth slot (v4
          handoff); it is reached from the avatar in Home's header, so it has
          to exist as a pushed screen or that avatar leads nowhere. */}
      <Stack.Screen name="Profile"              component={ProfileScreen} />
      <Stack.Screen name="CarePlans"            component={CarePlansScreen} />
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
      <Stack.Screen name="Chat"                 component={ChatScreen as any} />
      <Stack.Screen name="Wallet"               component={WalletScreen as any} />
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
  const { theme: t } = useTheme()
  return (
    <PatientNav.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      screenListeners={{ focus: () => setStatusBarStyle(t.isDark ? 'light' : 'dark', true) }}>
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
  const { session, loading, user, switchedInto, signOut } = useAuth()
  const { theme: t } = useTheme()
  // Suspended while switched into a dependent's account -- otherwise this device's
  // push token would silently overwrite the dependent's own push_token every time a
  // caretaker switches in, breaking notification delivery to the dependent's own phone.
  usePushNotifications(switchedInto ? undefined : user?.id)
  useDeviceRegistration(user?.id, 'patient')

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
            <AppLockGate active={!!session} onUsePassword={() => { void signOut() }}>
              <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>{content}</NavigationContainer>
            </AppLockGate>
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
  const fontsReady = useQueueFonts()
  if (!fontsReady) return null
  return (
    <ThemeProvider palettes={V4_PALETTES} defaultMode="light">
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
