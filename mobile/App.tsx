import 'react-native-url-polyfill/auto'
import { useState } from 'react'
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { ThemeProvider, useTheme }     from './contexts/ThemeContext'
import { AuthProvider, useAuth }       from './contexts/AuthContext'
import { LocationProvider }            from './contexts/LocationContext'
import { usePushNotifications }    from './hooks/usePushNotifications'

import { SplashScreen }             from './screens/SplashScreen'
import { LoginScreen }              from './screens/LoginScreen'
import { RegisterScreen }           from './screens/RegisterScreen'
import { HomeScreen }               from './screens/HomeScreen'
import { SearchScreen }             from './screens/SearchScreen'
import { AppointmentsScreen }       from './screens/AppointmentsScreen'
import { ProfileScreen }            from './screens/ProfileScreen'
import { HospitalProfileScreen }    from './screens/HospitalProfileScreen'
import { BookingFlowScreen }        from './screens/BookingFlowScreen'
import { ConfirmationScreen }       from './screens/ConfirmationScreen'
import { NotificationsScreen }      from './screens/NotificationsScreen'
import { AppointmentDetailScreen }  from './screens/AppointmentDetailScreen'
import { EmergencyBookingScreen }      from './screens/EmergencyBookingScreen'
import { EmergencyConfirmationScreen } from './screens/EmergencyConfirmationScreen'
import { MedicalHistoryScreen }        from './screens/MedicalHistoryScreen'
import { DependentsScreen }            from './screens/DependentsScreen'
import { PrescriptionsScreen }         from './screens/PrescriptionsScreen'
import { PrivacySecurityScreen }       from './screens/PrivacySecurityScreen'
import { InsuranceScreen }             from './screens/InsuranceScreen'
import { SupportScreen }               from './screens/SupportScreen'
import { VideoCallScreen }             from './screens/VideoCallScreen'

import { SpecialistQueueScreen }   from './screens/specialist/SpecialistQueueScreen'
import { PatientConsultScreen }    from './screens/specialist/PatientConsultScreen'
import { DoctorVideoCallScreen }   from './screens/specialist/DoctorVideoCallScreen'
import { SpecialistProfileScreen } from './screens/specialist/SpecialistProfileScreen'
import { FrontDeskQueueScreen }   from './screens/frontdesk/FrontDeskQueueScreen'
import { FrontDeskProfileScreen } from './screens/frontdesk/FrontDeskProfileScreen'

const Tab        = createBottomTabNavigator()
const Stack      = createNativeStackNavigator()
const DocTab     = createBottomTabNavigator()
const DocStack   = createNativeStackNavigator()
const FDTab      = createBottomTabNavigator()
const FDStack    = createNativeStackNavigator()

function TabIcon({ name, focused, color }: { name: React.ComponentProps<typeof Ionicons>['name']; focused: boolean; color: string }) {
  return <Ionicons name={name} size={22} color={color} />
}

function MainTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const tabBarHeight = 52 + insets.bottom
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: tabBarHeight },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
      }}>
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'home' : 'home-outline'} {...p} />, tabBarLabel: 'Home' }} />
      <Tab.Screen name="Search" component={SearchScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'search' : 'search-outline'} {...p} />, tabBarLabel: 'Search' }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'calendar' : 'calendar-outline'} {...p} />, tabBarLabel: 'Bookings' }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  )
}

function SpecialistTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const tabBarHeight = 52 + insets.bottom
  return (
    <DocTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: tabBarHeight },
        tabBarActiveTintColor:   t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
      }}>
      <DocTab.Screen name="Queue" component={SpecialistQueueScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'list' : 'list-outline'} {...p} />, tabBarLabel: 'Queue' }} />
      <DocTab.Screen name="SpecialistProfile" component={SpecialistProfileScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </DocTab.Navigator>
  )
}

function FrontDeskTabs() {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const tabBarHeight = 52 + insets.bottom
  return (
    <FDTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: insets.bottom || 8, height: tabBarHeight },
        tabBarActiveTintColor:   t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
      }}>
      <FDTab.Screen name="FDQueue"   component={FrontDeskQueueScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'list' : 'list-outline'} {...p} />, tabBarLabel: 'Queue' }} />
      <FDTab.Screen name="FDProfile" component={FrontDeskProfileScreen}
        options={{ tabBarIcon: p => <TabIcon name={p.focused ? 'person' : 'person-outline'} {...p} />, tabBarLabel: 'Profile' }} />
    </FDTab.Navigator>
  )
}

function FrontDeskStack() {
  return (
    <FDStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <FDStack.Screen name="FrontDeskTabs" component={FrontDeskTabs} />
    </FDStack.Navigator>
  )
}

function SpecialistStack() {
  return (
    <DocStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <DocStack.Screen name="SpecialistTabs"  component={SpecialistTabs} />
      <DocStack.Screen name="PatientConsult"  component={PatientConsultScreen  as any} />
      <DocStack.Screen name="DoctorVideoCall" component={DoctorVideoCallScreen as any}
        options={{ animation: 'fade', gestureEnabled: false }} />
    </DocStack.Navigator>
  )
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MainTabs"          component={MainTabs} />
      <Stack.Screen name="HospitalProfile"   component={HospitalProfileScreen} />
      <Stack.Screen name="BookingFlow"       component={BookingFlowScreen} />
      <Stack.Screen name="Confirmation"      component={ConfirmationScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="Notifications"     component={NotificationsScreen} />
      <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
      <Stack.Screen name="EmergencyBooking"     component={EmergencyBookingScreen} />
      <Stack.Screen name="EmergencyConfirmation" component={EmergencyConfirmationScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="MedicalHistory"    component={MedicalHistoryScreen} />
      <Stack.Screen name="Dependents"        component={DependentsScreen} />
      <Stack.Screen name="Prescriptions"     component={PrescriptionsScreen} />
      <Stack.Screen name="PrivacySecurity"   component={PrivacySecurityScreen} />
      <Stack.Screen name="Insurance"         component={InsuranceScreen} />
      <Stack.Screen name="Support"           component={SupportScreen} />
      <Stack.Screen name="VideoCall"         component={VideoCallScreen as any} options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack.Navigator>
  )
}

function AuthStack({ initialRoute }: { initialRoute: 'Login' | 'Register' }) {
  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}

function AppNavigator() {
  const [splashDone,   setSplashDone]   = useState(false)
  const [initialRoute, setInitialRoute] = useState<'Login' | 'Register'>('Login')
  const { session, loading, user, doctorProfile, staffProfile } = useAuth()
  const { theme: t } = useTheme()
  usePushNotifications(user?.id)

  // Wait for Supabase to restore any existing session before deciding what to show
  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} size="large" />
        </View>
      </SafeAreaProvider>
    )
  }

  // Already authenticated — go straight into the app, skip splash
  if (session) {
    return (
      <SafeAreaProvider>
        <NavigationContainer>
          {doctorProfile ? <SpecialistStack />
            : staffProfile ? <FrontDeskStack />
            : <AppStack />}
        </NavigationContainer>
      </SafeAreaProvider>
    )
  }

  // No session — show splash first, then auth screens
  if (!splashDone) {
    return (
      <SafeAreaProvider>
        <SplashScreen
          onGetStarted={() => { setInitialRoute('Register'); setSplashDone(true) }}
          onSignIn={() => { setInitialRoute('Login'); setSplashDone(true) }}
        />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthStack initialRoute={initialRoute} />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LocationProvider>
          <AppNavigator />
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
