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

import { HospitalAuthScreen }       from './screens/HospitalAuthScreen'
import { HospitalRegisterScreen }   from './screens/HospitalRegisterScreen'
import { HospitalOnboardingScreen } from './screens/onboarding/HospitalOnboardingScreen'

import { AdminDashboardScreen }    from './screens/admin/AdminDashboardScreen'
import { FrontDeskQueueScreen }    from './screens/frontdesk/FrontDeskQueueScreen'
import { FrontDeskProfileScreen }  from './screens/frontdesk/FrontDeskProfileScreen'
import { WalkInBookingScreen }     from './screens/staff/WalkInBookingScreen'
import { StaffAppointmentsScreen } from './screens/staff/StaffAppointmentsScreen'
import { StaffMoreScreen }         from './screens/staff/StaffMoreScreen'
import { StaffAnalyticsScreen }    from './screens/staff/StaffAnalyticsScreen'
import { StaffManagementScreen }   from './screens/staff/StaffManagementScreen'
import { HospitalSettingsScreen }  from './screens/staff/HospitalSettingsScreen'

const AuthStack   = createNativeStackNavigator()
const StaffTab    = createBottomTabNavigator()
const StaffStackN = createNativeStackNavigator()
const OnboardStk  = createNativeStackNavigator()

function TabIcon({ name, color, size }: any) {
  return <Ionicons name={name} color={color} size={size ?? 22} />
}

function HospitalAuthStack() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="HospitalAuth"     component={HospitalAuthScreen} />
      <AuthStack.Screen name="Login"            component={LoginScreen} />
      <AuthStack.Screen name="HospitalRegister" component={HospitalRegisterScreen} />
    </AuthStack.Navigator>
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
      <StaffStackN.Screen name="StaffTabs"          component={StaffTabs} />
      <StaffStackN.Screen name="FrontDeskProfile"   component={FrontDeskProfileScreen as any} />
      <StaffStackN.Screen name="StaffAnalytics"     component={StaffAnalyticsScreen   as any} />
      <StaffStackN.Screen name="StaffManagement"    component={StaffManagementScreen  as any} />
      <StaffStackN.Screen name="HospitalSettings"   component={HospitalSettingsScreen as any} />
      <StaffStackN.Screen name="HospitalOnboarding" component={HospitalOnboardingScreen as any} />
    </StaffStackN.Navigator>
  )
}

// A freshly registered hospital owner has no staff row yet -- that only exists once
// onboarding creates the hospital. Without this stack they land on the no-access
// screen immediately after signing up, which is where registration used to dead-end.
function HospitalOnboardingStack() {
  return (
    <OnboardStk.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <OnboardStk.Screen name="HospitalOnboarding" component={HospitalOnboardingScreen as any} />
    </OnboardStk.Navigator>
  )
}

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const { session, loading, user, staffProfile, crewProfile, pendingHospitalOnboarding, signOut } = useAuth()
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
    // Two ways to be mid-registration. pendingHospitalOnboarding is the in-session flag
    // HospitalRegisterScreen sets before signUp. registered_via is written into the auth
    // user's metadata at sign-up and therefore survives a restart -- without checking it,
    // anyone who registered and then closed the app before finishing was permanently
    // locked out, with no way back in.
    const registeredForHospital =
      (session.user?.user_metadata as Record<string, unknown> | undefined)?.registered_via
        === 'hospital_onboarding'
    const needsHospitalOnboarding = !staffProfile && (pendingHospitalOnboarding || registeredForHospital)

    // Ambulance crew carry a staffProfile with role 'ambulance_crew'. They belong in
    // Queue Ambulance, so they must not fall through into the staff dashboard here.
    const isCrew = staffProfile?.role === 'ambulance_crew' || !!crewProfile

    let content: React.ReactElement
    if (needsHospitalOnboarding) {
      content = <HospitalOnboardingStack />
    } else if (staffProfile && !isCrew) {
      content = <StaffStack />
    } else {
      content = (
        <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Ionicons name="lock-closed-outline" size={44} color={t.textMuted} />
          <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
            No hospital access on this account
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            Queue Hospital is for hospital staff. Doctors should use Queue Doctor,
            ambulance crews Queue Ambulance, and patients the Queue app.
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
          tagline="RUN YOUR HOSPITAL, NOT YOUR QUEUE"
          highlights={['Manage the queue', 'Book walk-ins', 'See your numbers']}
          primaryLabel="Sign in"
          showSecondary={false}
        /></SafeAreaProvider>
  }

  return <SafeAreaProvider><HospitalAuthStack /><OfflineBanner /></SafeAreaProvider>
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
