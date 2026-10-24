import 'react-native-url-polyfill/auto'
import { useState } from 'react'
import React from 'react'
import * as Sentry from '@sentry/react-native'
import { NavigationContainer, DarkTheme } from '@react-navigation/native'
import { navigationRef, flushPendingNavigation } from '@queue/shared/lib/navigation'
import { OfflineBanner } from '@queue/shared/components/ui/OfflineBanner'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'

import { ThemeProvider, useTheme } from '@queue/shared/contexts/ThemeContext'
import { useQueueFonts } from '@queue/shared/hooks/useQueueFonts'
import { AlertProvider }           from '@queue/shared/contexts/AlertContext'
import { AuthProvider, useAuth }   from '@queue/shared/contexts/AuthContext'
import { LocationProvider }        from '@queue/shared/contexts/LocationContext'
import { usePushNotifications }    from '@queue/shared/hooks/usePushNotifications'

import { SplashScreen } from '@queue/shared/screens/SplashScreen'
import { LoginScreen }  from '@queue/shared/screens/LoginScreen'

// Registers the TaskManager background location task at app entry, NOT lazily from
// CrewHomeScreen. The OS wakes this app headless to deliver background fixes, and in a
// cold start no screen mounts -- so a task only imported by CrewHomeScreen is undefined
// at exactly the moment the OS hands work back, and every fix is dropped on the floor.
// find_candidate_units ignores any unit whose last fix is older than 120s, so the rig
// silently left dispatch about two minutes after the crew locked their phone: on duty,
// pinging nothing, and never offered a job. apps/client already imports it this way.
import '@queue/shared/lib/location-task'

import { CrewHomeScreen }    from './screens/crew/CrewHomeScreen'
import { CrewProfileScreen } from './screens/crew/CrewProfileScreen'
import { setStatusBarStyle } from 'expo-status-bar'
import { NoAccessScreen } from '@queue/shared/components/NoAccessScreen'
import { CrewMessagesScreen } from './screens/crew/CrewMessagesScreen'
import { CrewTrackScreen } from './screens/crew/CrewTrackScreen'
import { ChatScreen } from '@queue/shared/screens/ChatScreen'
import { useUnreadMessages } from '@queue/shared/hooks/useUnreadMessages'

import { AmbulanceProviderRegisterScreen } from './screens/AmbulanceProviderRegisterScreen'
import { AmbulanceProviderOnboardingScreen } from './screens/onboarding/AmbulanceProviderOnboardingScreen'
import { AdminHomeScreen } from './screens/admin/AdminHomeScreen'
import { AdminFleetScreen } from './screens/admin/AdminFleetScreen'
import { FleetMapScreen } from './screens/admin/FleetMapScreen'
import { AdminProfileScreen } from './screens/admin/AdminProfileScreen'
import { ProviderSettingsScreen } from './screens/admin/ProviderSettingsScreen'
import { REGISTERED_VIA_AMBULANCE_PROVIDER } from '@queue/shared/contexts/AuthContext'

const AuthStack = createNativeStackNavigator()
const CrewTab   = createBottomTabNavigator()
const CrewStackN = createNativeStackNavigator()
const AdminTab    = createBottomTabNavigator()
const AdminStackN = createNativeStackNavigator()
const OnboardStk  = createNativeStackNavigator()

function TabIcon({ name, color, size }: any) {
  return <Ionicons name={name} color={color} size={size ?? 22} />
}

// Crew accounts are provisioned by the fleet or hospital that employs them -- there's no
// self-registration here, so registerRoute is null to hide the shared login screen's
// "Create account" link (it pushed 'Register', a route only the patient app defines, so
// the tap did nothing at all). surface 'crew' is what stops signIn from treating this as
// the patient door and turning crew away from their own app.
// Two doors into the same app: a crew account, provisioned by whichever fleet
// employs them (so no self-registration), and a provider admin/owner account,
// which does self-register -- hospital-owned and independent fleets alike, one
// form. A crew member who taps "Register it" just finds nothing relevant.
const LOGIN_PARAMS = {
  surface:        'crew' as const,
  registerRoute:  'AmbulanceProviderRegister',
  tagline:        'Every minute counts',
  subtitle:       'Sign in to your account',
  registerPrompt: 'Running an ambulance service? ',
  registerCta:    'Register it',
}

function CrewAuthStack() {
  const { theme: t } = useTheme()
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      screenListeners={{ focus: () => setStatusBarStyle(t.id === 'forest' ? 'light' : 'dark', true) }}>
      <AuthStack.Screen name="Login" component={LoginScreen} initialParams={LOGIN_PARAMS} />
      <AuthStack.Screen name="AmbulanceProviderRegister" component={AmbulanceProviderRegisterScreen} />
    </AuthStack.Navigator>
  )
}

function CrewTabs() {
  const unread = useUnreadMessages('crew')
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <CrewTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 8, paddingBottom: insets.bottom || 12, height: 80 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    }}
      // Staff screens sit under the teal v3.1 header, so status-bar icons are light.
      screenListeners={{ focus: () => setStatusBarStyle('light', true) }}>
      <CrewTab.Screen name="CrewHome"    component={CrewHomeScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'medkit' : 'medkit-outline'} {...p} />, tabBarLabel: 'Jobs' }} />
      <CrewTab.Screen name="CrewMessages" component={CrewMessagesScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'chatbubble' : 'chatbubble-outline'} {...p} />, tabBarLabel: 'Messages',
        tabBarBadge: unread > 0 ? '' : undefined, tabBarBadgeStyle: { backgroundColor: '#EF4444', minWidth: 9, maxHeight: 9, borderRadius: 5, top: 2 } }} />
      <CrewTab.Screen name="CrewProfile" component={CrewProfileScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </CrewTab.Navigator>
  )
}

// Tabs plus pushed screens (chat threads).
function CrewStack() {
  return (
    <CrewStackN.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      screenListeners={{ focus: () => setStatusBarStyle('light', true) }}>
      <CrewStackN.Screen name="CrewTabs" component={CrewTabs} />
      <CrewStackN.Screen name="Chat"     component={ChatScreen as any} />
      <CrewStackN.Screen name="Track"    component={CrewTrackScreen as any} />
    </CrewStackN.Navigator>
  )
}

// A freshly registered operator has no ambulance_provider_admins row until this
// finishes -- same shape as the hospital onboarding stack.
function ProviderOnboardingStack() {
  return (
    <OnboardStk.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <OnboardStk.Screen name="AmbulanceProviderOnboarding" component={AmbulanceProviderOnboardingScreen} />
    </OnboardStk.Navigator>
  )
}

// The operator console -- one fleet's admin/owner, hospital-owned or independent,
// both identical here (see get_my_ambulance_admin_profile). No Alerts tab:
// dispatcher_alerts is scoped to a request's destination hospital, not to a
// provider, so it has nothing to show either kind. That stays hospital-side.
function AdminTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <AdminTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 8, paddingBottom: insets.bottom || 12, height: 80 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    }}
      screenListeners={{ focus: () => setStatusBarStyle('light', true) }}>
      <AdminTab.Screen name="AdminHome"    component={AdminHomeScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'grid' : 'grid-outline'} {...p} />, tabBarLabel: 'Home' }} />
      <AdminTab.Screen name="AdminFleet"   component={AdminFleetScreen}   options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'car-sport' : 'car-sport-outline'} {...p} />, tabBarLabel: 'Fleet' }} />
      <AdminTab.Screen name="FleetMap"     component={FleetMapScreen}     options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'map' : 'map-outline'} {...p} />, tabBarLabel: 'Map' }} />
      <AdminTab.Screen name="AdminProfile" component={AdminProfileScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </AdminTab.Navigator>
  )
}

function AdminStack() {
  return (
    <AdminStackN.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      screenListeners={{ focus: () => setStatusBarStyle('light', true) }}>
      <AdminStackN.Screen name="AdminTabs" component={AdminTabs} />
      <AdminStackN.Screen name="ProviderSettings" component={ProviderSettingsScreen as any} />
      <AdminStackN.Screen name="Chat" component={ChatScreen as any} />
    </AdminStackN.Navigator>
  )
}

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const {
    session, loading, user, staffProfile, crewProfile, providerAdminProfile,
    pendingAmbulanceProviderOnboarding, signOut,
  } = useAuth()
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
    // Crew reach this app one of two ways: a dedicated crew row, or a hospital-fleet
    // staff row whose role is 'ambulance_crew'. Both must land on the jobs board.
    const isCrew  = !!crewProfile || staffProfile?.role === 'ambulance_crew'
    const isAdmin = !!providerAdminProfile

    // Same escape hatch as hospital/doctor onboarding: someone who registered as
    // an operator but closed the app before finishing has no
    // ambulance_provider_admins row yet, and registered_via is the only thing
    // still telling them apart from a plain patient account at that point.
    const registeredForProvider =
      (session.user?.user_metadata as Record<string, unknown> | undefined)?.registered_via
        === REGISTERED_VIA_AMBULANCE_PROVIDER
    const needsProviderOnboarding = !isAdmin && !isCrew && (pendingAmbulanceProviderOnboarding || registeredForProvider)

    const content =
      needsProviderOnboarding ? <ProviderOnboardingStack />
      : isCrew  ? <CrewStack />
      : isAdmin ? <AdminStack />
      : (
        <NoAccessScreen title="This account is not ambulance crew"
          body="Queue Ambulance is for ambulance crews on duty and the operators who run them. Hospital staff should use Queue Hospital, doctors Queue Doctor, and patients the Queue app."
          onSignOut={() => { void signOut() }} />
      )
    return <SafeAreaProvider>{content}<OfflineBanner /></SafeAreaProvider>
  }

  if (!splashDone) {
    return <SafeAreaProvider><SplashScreen
          onGetStarted={() => setSplashDone(true)}
          onSignIn={() => setSplashDone(true)}
          tagline="EVERY MINUTE COUNTS"
          highlights={['Take dispatches', 'Navigate to scene', 'Share live position']}
          primaryLabel="Sign in"
          showSecondary={false}
        /></SafeAreaProvider>
  }

  return <SafeAreaProvider><CrewAuthStack /><OfflineBanner /></SafeAreaProvider>
}

// React Navigation paints its own scene background behind every screen, and with no
// theme passed it uses DefaultTheme -- a light grey. Screens that paint their own
// background hid it; the ShellScroll ones did not, so the doctor dashboard showed dark
// cards floating on a light grey page. Feeding the app palette to the navigator fixes it
// for every screen at once rather than per-screen.
function ThemedNav({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme()
  const navTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: t.canvasBg,
      card:       t.cardBg,
      text:       t.textPrimary,
      border:     t.cardBorder,
      primary:    t.accent,
    },
  }
  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation} theme={navTheme}>
      {children}
    </NavigationContainer>
  )
}

function App() {
  const fontsReady = useQueueFonts()
  if (!fontsReady) return null
  return (
    <ThemeProvider>
      <AlertProvider>
        <AuthProvider>
          <LocationProvider>
            <ThemedNav>
              <AppNavigator />
            </ThemedNav>
          </LocationProvider>
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  )
}

export default Sentry.wrap(App)
