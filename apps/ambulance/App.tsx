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
import { AuthProvider, useAuth }   from '@queue/shared/contexts/AuthContext'
import { LocationProvider }        from '@queue/shared/contexts/LocationContext'
import { usePushNotifications }    from '@queue/shared/hooks/usePushNotifications'

import { SplashScreen } from '@queue/shared/screens/SplashScreen'
import { LoginScreen }  from '@queue/shared/screens/LoginScreen'

import { CrewHomeScreen }    from './screens/crew/CrewHomeScreen'
import { CrewProfileScreen } from './screens/crew/CrewProfileScreen'

const AuthStack = createNativeStackNavigator()
const CrewTab   = createBottomTabNavigator()

function TabIcon({ name, color, size }: any) {
  return <Ionicons name={name} color={color} size={size ?? 22} />
}

// Crew accounts are provisioned by the fleet or hospital that employs them -- there's no
// self-registration here, so registerRoute is null to hide the shared login screen's
// "Create account" link (it pushed 'Register', a route only the patient app defines, so
// the tap did nothing at all). surface 'crew' is what stops signIn from treating this as
// the patient door and turning crew away from their own app.
const LOGIN_PARAMS = {
  surface:       'crew' as const,
  registerRoute: null,
  tagline:       'Every minute counts',
  subtitle:      'Sign in to your crew account',
}

function CrewAuthStack() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} initialParams={LOGIN_PARAMS} />
    </AuthStack.Navigator>
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

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const { session, loading, user, staffProfile, crewProfile, signOut } = useAuth()
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
    const isCrew = !!crewProfile || staffProfile?.role === 'ambulance_crew'

    const content = isCrew ? <CrewTabs /> : (
      <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Ionicons name="lock-closed-outline" size={44} color={t.textMuted} />
        <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
          This account is not ambulance crew
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
          Queue Ambulance is for ambulance crews on duty. Hospital staff should use
          Queue Hospital, doctors Queue Doctor, and patients the Queue app.
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
