// Doctor-only Queue app -- trimmed from mobile/App.tsx. Drops the patient/front-desk/
// admin/ambulance-crew navigators entirely; this app only ever renders the doctor
// stack or the login/sign-up screens. A doctor with zero hospital links is a fully
// supported, first-class state (that's the "independent" part of this app) -- there
// is no separate blocking "not a doctor account" screen; Dashboard/Hospitals/Settings
// all render their own empty states for it instead.
import 'react-native-url-polyfill/auto'
import React from 'react'
import * as Sentry from '@sentry/react-native'

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 })
}

import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View, ActivityIndicator } from 'react-native'

import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { AlertProvider }           from './contexts/AlertContext'
import { AuthProvider, useAuth }   from './contexts/AuthContext'
import { usePushNotifications }    from './hooks/usePushNotifications'
import { AppShell, ShellRoute }    from './components/AppShell'

import { LoginScreen }             from './screens/LoginScreen'
import { SignUpScreen }            from './screens/SignUpScreen'
import { DashboardScreen }         from './screens/DashboardScreen'
import { AppointmentsScreen }      from './screens/AppointmentsScreen'
import { HospitalsScreen }         from './screens/HospitalsScreen'
import { SettingsScreen }          from './screens/SettingsScreen'
import { SpecialistQueueScreen }   from './screens/specialist/SpecialistQueueScreen'
import { PatientConsultScreen }    from './screens/specialist/PatientConsultScreen'
import { ReferPatientScreen }      from './screens/specialist/ReferPatientScreen'

// react-native-agora is a native module Expo Go can't load at all -- lazy-load this
// screen so the rest of the app still runs under Expo Go / web in dev, and only the
// video call screen itself needs a real dev build. Metro resolves
// DoctorVideoCallScreen.web.tsx on web and .native.tsx on iOS/Android automatically.
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

const DocStack = createNativeStackNavigator()
const SHELL_ROUTES: ShellRoute[] = ['Dashboard', 'Queue', 'Appointments', 'Hospitals', 'Settings']

// Flat stack, not tabs -- AppShell provides the navigation chrome (a sidebar on
// wide/web viewports, a bottom tab bar on phone width) as ONE persistent wrapper
// around the whole navigator, not per-screen -- rendering it inside each screen
// would leave a full sidebar copy mounted for every screen react-native-screens
// keeps alive underneath the active one, which is both wasteful and (confirmed
// live) makes some copies briefly resolve as "not visible" mid-navigation.
// Drill-in screens (PatientConsult/ReferPatient/DoctorVideoCall) aren't in
// SHELL_ROUTES, so the wrapper drops away and they get the full screen.
function MainStack() {
  const { theme: t } = useTheme()
  return (
    <DocStack.Navigator screenOptions={{
      headerShown: false, animation: 'slide_from_right',
      // native-stack's own screen container defaults to an opaque white
      // background regardless of what wraps it -- AppShell's dark canvas
      // color was getting fully covered by this on every screen until it's
      // set explicitly here.
      contentStyle: { backgroundColor: t.canvasBg },
    }}>
      <DocStack.Screen name="Dashboard"       component={DashboardScreen} />
      <DocStack.Screen name="Queue"           component={SpecialistQueueScreen} />
      <DocStack.Screen name="Appointments"    component={AppointmentsScreen} />
      <DocStack.Screen name="Hospitals"       component={HospitalsScreen} />
      <DocStack.Screen name="Settings"        component={SettingsScreen} />
      <DocStack.Screen name="PatientConsult"  component={PatientConsultScreen  as any} />
      <DocStack.Screen name="ReferPatient"    component={ReferPatientScreen    as any} />
      <DocStack.Screen name="DoctorVideoCall" component={DoctorVideoCallScreen as any} options={{ animation: 'fade', gestureEnabled: false }} />
    </DocStack.Navigator>
  )
}

function AppNavigator() {
  const [showSignUp, setShowSignUp] = React.useState(false)
  const { session, loading, user } = useAuth()
  const { theme: t } = useTheme()
  usePushNotifications(user?.id)

  const navRef = useNavigationContainerRef()
  const [activeRoute, setActiveRoute] = React.useState<string | undefined>('Dashboard')

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
    const showShell = activeRoute != null && (SHELL_ROUTES as string[]).includes(activeRoute)
    return (
      <SafeAreaProvider>
        <NavigationContainer ref={navRef}
          onReady={() => setActiveRoute((navRef.getCurrentRoute() as any)?.name)}
          onStateChange={() => setActiveRoute((navRef.getCurrentRoute() as any)?.name)}>
          {showShell ? (
            <AppShell active={activeRoute as ShellRoute} navigation={navRef}>
              <MainStack />
            </AppShell>
          ) : (
            <MainStack />
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      {showSignUp
        ? <SignUpScreen onBackToLogin={() => setShowSignUp(false)} />
        : <LoginScreen onCreateAccount={() => setShowSignUp(true)} />}
    </SafeAreaProvider>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  )
}

export default process.env.EXPO_PUBLIC_SENTRY_DSN ? Sentry.wrap(App) : App
