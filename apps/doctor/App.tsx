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
import { AuthProvider, useAuth, REGISTERED_VIA_DOCTOR } from '@queue/shared/contexts/AuthContext'
import { LocationProvider }        from '@queue/shared/contexts/LocationContext'
import { usePushNotifications }    from '@queue/shared/hooks/usePushNotifications'

import { SplashScreen } from '@queue/shared/screens/SplashScreen'
import { LoginScreen }  from '@queue/shared/screens/LoginScreen'

import { DoctorRegisterScreen }   from './screens/DoctorRegisterScreen'
import { DoctorOnboardingScreen } from './screens/DoctorOnboardingScreen'

import { DoctorDashboardScreen }    from './screens/specialist/DoctorDashboardScreen'
import { SpecialistQueueScreen }    from './screens/specialist/SpecialistQueueScreen'
import { DoctorAppointmentsScreen } from './screens/specialist/DoctorAppointmentsScreen'
import { SpecialistProfileScreen }  from './screens/specialist/SpecialistProfileScreen'
import { PatientConsultScreen }     from './screens/specialist/PatientConsultScreen'
import { ReferPatientScreen }       from './screens/specialist/ReferPatientScreen'
import { DoctorHospitalsScreen }    from './screens/specialist/DoctorHospitalsScreen'
import { DoctorSettingsScreen }     from './screens/specialist/DoctorSettingsScreen'

// react-native-agora is a native module Expo Go cannot load, so the call screen is
// lazy-loaded -- importing it eagerly would break the whole app under Expo Go, not
// just the call screen.
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

const AuthStack   = createNativeStackNavigator()
const DocTab      = createBottomTabNavigator()
const DocStack    = createNativeStackNavigator()
const OnboardStk  = createNativeStackNavigator()

function TabIcon({ name, color, size }: any) {
  return <Ionicons name={name} color={color} size={size ?? 22} />
}

// LoginScreen is shared with the other three apps, so the doctor-specific bits (which
// surface signIn() validates against, and which route the "Create account" link goes to)
// are passed as params. Without the surface, it defaulted to 'patient' and signIn turned
// every doctor away from their own app; without registerRoute it pushed 'Register', a
// route only the patient app defines, so the link silently did nothing.
const LOGIN_PARAMS = {
  surface:        'doctor' as const,
  registerRoute:  'DoctorRegister',
  tagline:        'Your clinic, wherever you are',
  subtitle:       'Sign in to your doctor account',
  registerPrompt: 'New to Queue? ',
  registerCta:    'Create a doctor account',
}

function DoctorAuthStack({ initialRouteName }: { initialRouteName: string }) {
  return (
    <AuthStack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="Login"          component={LoginScreen} initialParams={LOGIN_PARAMS} />
      <AuthStack.Screen name="DoctorRegister" component={DoctorRegisterScreen} />
    </AuthStack.Navigator>
  )
}

// A doctor who has signed up but isn't linked to a hospital yet has no `doctors` row and
// so no doctorProfile -- see DoctorOnboardingScreen for why that gap is structural.
function DoctorOnboardingStack() {
  return (
    <OnboardStk.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <OnboardStk.Screen name="DoctorOnboarding" component={DoctorOnboardingScreen} />
    </OnboardStk.Navigator>
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

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  // Which auth screen to open on. A navigator only reads initialRouteName on its first
  // mount, and this navigator doesn't mount until splashDone flips -- so the splash's
  // "Create an account" button can set it on the way through.
  const [authRoute,  setAuthRoute]  = useState('Login')
  const { session, loading, user, doctorProfile, pendingDoctorOnboarding, signOut } = useAuth()
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
    // Two ways to be mid-registration. pendingDoctorOnboarding is the in-session flag
    // DoctorRegisterScreen sets before signUp; registered_via is written into the auth
    // user's metadata at sign-up and so survives a restart -- without checking it, a
    // doctor who registered and then closed the app before an admin linked them was
    // permanently locked out, with no way back in.
    const registeredAsDoctor =
      (session.user?.user_metadata as Record<string, unknown> | undefined)?.registered_via
        === REGISTERED_VIA_DOCTOR
    const needsDoctorOnboarding = !doctorProfile && (pendingDoctorOnboarding || registeredAsDoctor)

    // This app is only ever the doctor's. A staff or crew account signing in here has
    // no stack to land on, so say which app they want rather than showing an empty one.
    const content = doctorProfile ? <SpecialistStack /> : needsDoctorOnboarding ? <DoctorOnboardingStack /> : (
      <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Ionicons name="lock-closed-outline" size={44} color={t.textMuted} />
        <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
          This account is not a doctor
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
          Queue Doctor is for doctors running consultations. Hospital staff should use
          Queue Hospital, ambulance crews Queue Ambulance, and patients the Queue app.
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
          onGetStarted={() => { setAuthRoute('Login'); setSplashDone(true) }}
          onSignIn={() => { setAuthRoute('DoctorRegister'); setSplashDone(true) }}
          tagline="YOUR CLINIC, WHEREVER YOU ARE"
          highlights={['Run your queue', 'Consult by video', 'Refer and prescribe']}
          primaryLabel="Sign in"
          secondaryLabel="Create an account"
        /></SafeAreaProvider>
  }

  return <SafeAreaProvider><DoctorAuthStack initialRouteName={authRoute} /><OfflineBanner /></SafeAreaProvider>
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
