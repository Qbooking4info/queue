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
import { AuthProvider, useAuth, REGISTERED_VIA_DOCTOR } from '@queue/shared/contexts/AuthContext'
import { LocationProvider }        from '@queue/shared/contexts/LocationContext'
import { usePushNotifications }    from '@queue/shared/hooks/usePushNotifications'

import { SplashScreen } from '@queue/shared/screens/SplashScreen'
import { LoginScreen }  from '@queue/shared/screens/LoginScreen'
import { ConsultationPlanScreen } from '@queue/shared/screens/ConsultationPlanScreen'
import { CarePlanComposeScreen } from '@queue/shared/screens/CarePlanComposeScreen'
import { DoctorAnalyticsScreen } from './screens/specialist/DoctorAnalyticsScreen'
import { RequestAmbulanceScreen } from './screens/specialist/RequestAmbulanceScreen'

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
import { DoctorMessagesScreen }     from './screens/specialist/DoctorMessagesScreen'
import { ChatScreen }               from '@queue/shared/screens/ChatScreen'
import { setStatusBarStyle } from 'expo-status-bar'
import { useUnreadMessages } from '@queue/shared/hooks/useUnreadMessages'
import { NoAccessScreen } from '@queue/shared/components/NoAccessScreen'

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
  const { theme: t } = useTheme()
  return (
    <AuthStack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      screenListeners={{ focus: () => setStatusBarStyle(t.id === 'forest' ? 'light' : 'dark', true) }}>
      <AuthStack.Screen name="Login"          component={LoginScreen} initialParams={LOGIN_PARAMS} />
      <AuthStack.Screen name="DoctorRegister" component={DoctorRegisterScreen} />
    </AuthStack.Navigator>
  )
}

// A doctor who has signed up but isn't linked to a hospital yet has no `doctors` row and
// so no doctorProfile -- see DoctorOnboardingScreen for why that gap is structural.
function DoctorOnboardingStack() {
  return (
    <OnboardStk.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      // Staff screens sit under the teal v3.1 header, so status-bar icons are light.
      screenListeners={{ focus: () => setStatusBarStyle('light', true) }}>
      <OnboardStk.Screen name="DoctorOnboarding" component={DoctorOnboardingScreen} />
    </OnboardStk.Navigator>
  )
}

function SpecialistTabs() {
  const unread = useUnreadMessages('doctor')
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <DocTab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 8, paddingBottom: insets.bottom || 12, height: 72 + (insets.bottom || 0) },
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <DocTab.Screen name="Dashboard"         component={DoctorDashboardScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'grid' : 'grid-outline'} {...p} />,         tabBarLabel: 'Home' }} />
      <DocTab.Screen name="Queue"             component={SpecialistQueueScreen}    options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'list' : 'list-outline'} {...p} />,         tabBarLabel: 'Queue' }} />
      <DocTab.Screen name="Appointments"      component={DoctorAppointmentsScreen} options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'calendar' : 'calendar-outline'} {...p} />, tabBarLabel: 'Appointments' }} />
      <DocTab.Screen name="Messages"          component={DoctorMessagesScreen}     options={{ tabBarBadge: unread > 0 ? '' : undefined, tabBarBadgeStyle: { backgroundColor: '#EF4444', minWidth: 9, maxHeight: 9, borderRadius: 5, top: 2 }, tabBarIcon: p => <TabIcon name={p.focused ? 'chatbubble' : 'chatbubble-outline'} {...p} />, tabBarLabel: 'Messages' }} />
      <DocTab.Screen name="SpecialistProfile" component={SpecialistProfileScreen}  options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />,     tabBarLabel: 'Profile' }} />
    </DocTab.Navigator>
  )
}

function SpecialistStack() {
  return (
    <DocStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      // Staff screens sit under the teal v3.1 header, so status-bar icons are light.
      screenListeners={{ focus: () => setStatusBarStyle('light', true) }}>
      <DocStack.Screen name="SpecialistTabs"  component={SpecialistTabs} />
      <DocStack.Screen name="Hospitals"       component={DoctorHospitalsScreen as any} />
      <DocStack.Screen name="Settings"        component={DoctorSettingsScreen  as any} />
      <DocStack.Screen name="PatientConsult"  component={PatientConsultScreen  as any} />
      <DocStack.Screen name="Chat"            component={ChatScreen            as any} />
      <DocStack.Screen name="ReferPatient"    component={ReferPatientScreen    as any} />
      <DocStack.Screen name="DoctorVideoCall" component={DoctorVideoCallScreen as any} options={{ animation: 'fade', gestureEnabled: false }} />
      <DocStack.Screen name="ConsultationPlan" component={ConsultationPlanScreen as any} />
      <DocStack.Screen name="CarePlanCompose" component={CarePlanComposeScreen as any} />
      <DocStack.Screen name="DoctorAnalytics" component={DoctorAnalyticsScreen as any} />
      <DocStack.Screen name="RequestAmbulance" component={RequestAmbulanceScreen as any} />
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
      <NoAccessScreen title="This account is not a doctor"
        body="Queue Doctor is for doctors running consultations. Hospital staff should use Queue Hospital, ambulance crews Queue Ambulance, and patients the Queue app."
        onSignOut={() => { void signOut() }} />
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
