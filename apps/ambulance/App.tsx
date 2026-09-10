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
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { ThemeProvider, useTheme } from '@queue/shared/contexts/ThemeContext'
import { AlertProvider }           from '@queue/shared/contexts/AlertContext'
import { AuthProvider, useAuth, REGISTERED_VIA_AMBULANCE_PROVIDER } from '@queue/shared/contexts/AuthContext'
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

import { AmbulanceProviderRegisterScreen }  from './screens/AmbulanceProviderRegisterScreen'
import { AmbulanceProviderOnboardingScreen } from './screens/onboarding/AmbulanceProviderOnboardingScreen'

import { AdminHomeScreen }       from './screens/admin/AdminHomeScreen'
import { AdminFleetScreen }      from './screens/admin/AdminFleetScreen'
import { FleetMapScreen }        from './screens/admin/FleetMapScreen'
import { AdminProfileScreen }    from './screens/admin/AdminProfileScreen'
import { ProviderSettingsScreen } from './screens/admin/ProviderSettingsScreen'

const AuthStack   = createNativeStackNavigator()
const OnboardStk  = createNativeStackNavigator()
const CrewTab     = createBottomTabNavigator()
const AdminTab    = createBottomTabNavigator()
const AdminStackN = createNativeStackNavigator()

function TabIcon({ name, color, size }: any) {
  return <Ionicons name={name} color={color} size={size ?? 22} />
}

// Two doors into the same app: a crew/dispatcher account (provisioned by
// whichever fleet employs them, so no self-registration for them --
// registerRoute used to be null for exactly that reason) and now also a
// provider admin/owner account, which DOES self-register -- hospital-owned
// and independent fleets alike, one form, see AmbulanceProviderRegisterScreen
// and AmbulanceProviderOnboardingScreen. A crew member tapping "Create
// account" just finds nothing relevant and goes back, same as tapping it by
// mistake on any app.
const LOGIN_PARAMS = {
  surface:        'crew' as const,
  registerRoute:  'AmbulanceProviderRegister',
  tagline:        'Every minute counts',
  subtitle:       'Sign in to your account',
  registerPrompt: 'Running an ambulance service? ',
  registerCta:    'Register it',
}

function AmbulanceAuthStack() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} initialParams={LOGIN_PARAMS} />
      <AuthStack.Screen name="AmbulanceProviderRegister" component={AmbulanceProviderRegisterScreen} />
    </AuthStack.Navigator>
  )
}

// A freshly registered operator has no ambulance_provider_admins row yet -- that
// only exists once this finishes. Same shape as HospitalOnboardingStack.
function ProviderOnboardingStack() {
  return (
    <OnboardStk.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <OnboardStk.Screen name="AmbulanceProviderOnboarding" component={AmbulanceProviderOnboardingScreen} />
    </OnboardStk.Navigator>
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

// The operator console -- one fleet's admin/owner, hospital-owned or
// independent, both work identically here (see get_my_ambulance_admin_profile).
// No Alerts tab: dispatcher_alerts is scoped to a request's destination
// hospital, not to any ambulance provider, so it has nothing to show for
// either kind of provider -- that stays a web-dashboard-only, hospital-side
// concern.
function AdminTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <AdminTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: 52 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
    }}>
      <AdminTab.Screen name="AdminHome"    component={AdminHomeScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'grid' : 'grid-outline'} {...p} />, tabBarLabel: 'Home' }} />
      <AdminTab.Screen name="AdminFleet"   component={AdminFleetScreen}   options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'car-sport' : 'car-sport-outline'} {...p} />, tabBarLabel: 'Fleet' }} />
      <AdminTab.Screen name="FleetMap"     component={FleetMapScreen}     options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'map' : 'map-outline'} {...p} />, tabBarLabel: 'Map' }} />
      <AdminTab.Screen name="AdminProfile" component={AdminProfileScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </AdminTab.Navigator>
  )
}

function AdminStack() {
  return (
    <AdminStackN.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AdminStackN.Screen name="AdminTabs" component={AdminTabs} />
      <AdminStackN.Screen name="ProviderSettings" component={ProviderSettingsScreen as any} />
    </AdminStackN.Navigator>
  )
}

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const {
    session, loading, user, crewProfile, providerAdminProfile,
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
    // Hospital-owned and independent providers work identically now -- one
    // ambulance_crew row for a driver/EMT (get_my_crew_profile), one
    // ambulance_provider_admins row for an owner/admin (get_my_ambulance_admin_profile),
    // regardless of which kind of provider it is.
    const isCrew  = !!crewProfile
    const isAdmin = !!providerAdminProfile

    // Same escape hatch as hospital/doctor onboarding: someone who registered as
    // an independent operator but closed the app before finishing has no
    // ambulance_provider_admins row yet -- registered_via is the only thing that
    // still tells them apart from a plain patient account at that point.
    const registeredForProvider =
      (session.user?.user_metadata as Record<string, unknown> | undefined)?.registered_via
        === REGISTERED_VIA_AMBULANCE_PROVIDER
    const needsProviderOnboarding = !isAdmin && !isCrew && (pendingAmbulanceProviderOnboarding || registeredForProvider)

    let content: React.ReactElement
    if (needsProviderOnboarding) {
      content = <ProviderOnboardingStack />
    } else if (isCrew) {
      content = <CrewTabs />
    } else if (isAdmin) {
      content = <AdminStack />
    } else {
      content = (
        <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Ionicons name="lock-closed-outline" size={44} color={t.textMuted} />
          <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
            This account is not ambulance crew
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            Queue Ambulance is for ambulance crews, dispatchers, and fleet operators. Hospital
            staff should use Queue Hospital, doctors Queue Doctor, and patients the Queue app.
          </Text>
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
          tagline="EVERY MINUTE COUNTS"
          highlights={['Take dispatches', 'Navigate to scene', 'Share live position']}
          primaryLabel="Sign in"
          showSecondary={false}
        /></SafeAreaProvider>
  }

  return <SafeAreaProvider><AmbulanceAuthStack /><OfflineBanner /></SafeAreaProvider>
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
