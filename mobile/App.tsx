import 'react-native-url-polyfill/auto'
import { useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text, View, ActivityIndicator } from 'react-native'

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
import { SupportScreen }               from './screens/SupportScreen'
import { VideoCallScreen }             from './screens/VideoCallScreen'

import { SpecialistQueueScreen }   from './screens/specialist/SpecialistQueueScreen'
import { PatientConsultScreen }    from './screens/specialist/PatientConsultScreen'
import { DoctorVideoCallScreen }   from './screens/specialist/DoctorVideoCallScreen'
import { SpecialistProfileScreen } from './screens/specialist/SpecialistProfileScreen'

const Tab        = createBottomTabNavigator()
const Stack      = createNativeStackNavigator()
const DocTab     = createBottomTabNavigator()
const DocStack   = createNativeStackNavigator()

function TabIcon({ icon, focused, color }: { icon: string; focused: boolean; color: string }) {
  return <Text style={{ fontSize: 18, color }}>{icon}</Text>
}

function MainTabs() {
  const { theme: t } = useTheme()
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: 20, height: 72 },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
      }}>
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: p => <TabIcon icon="⊞" {...p} />, tabBarLabel: 'Home' }} />
      <Tab.Screen name="Search" component={SearchScreen}
        options={{ tabBarIcon: p => <TabIcon icon="⊕" {...p} />, tabBarLabel: 'Search' }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen}
        options={{ tabBarIcon: p => <TabIcon icon="◆" {...p} />, tabBarLabel: 'Bookings' }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: p => <TabIcon icon="●" {...p} />, tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  )
}

function SpecialistTabs() {
  const { theme: t } = useTheme()
  return (
    <DocTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.cardBg, borderTopColor: t.cardBorder, paddingTop: 4, paddingBottom: 20, height: 72 },
        tabBarActiveTintColor:   t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
      }}>
      <DocTab.Screen name="Queue" component={SpecialistQueueScreen}
        options={{ tabBarIcon: p => <TabIcon icon="◉" {...p} />, tabBarLabel: 'Queue' }} />
      <DocTab.Screen name="SpecialistProfile" component={SpecialistProfileScreen}
        options={{ tabBarIcon: p => <TabIcon icon="●" {...p} />, tabBarLabel: 'Profile' }} />
    </DocTab.Navigator>
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
      <Stack.Screen name="Support"           component={SupportScreen} />
      <Stack.Screen name="VideoCall"         component={VideoCallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)
  const { session, loading, user, doctorProfile } = useAuth()
  const { theme: t }                              = useTheme()
  usePushNotifications(user?.id)

  if (!splashDone) {
    return (
      <SafeAreaProvider>
        <SplashScreen onNext={() => setSplashDone(true)} />
      </SafeAreaProvider>
    )
  }

  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} size="large" />
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {session
          ? (doctorProfile ? <SpecialistStack /> : <AppStack />)
          : <AuthStack />
        }
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
