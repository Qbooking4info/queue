import 'react-native-url-polyfill/auto'
import { useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'

import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { SplashScreen }            from './screens/SplashScreen'
import { HomeScreen }              from './screens/HomeScreen'
import { SearchScreen }            from './screens/SearchScreen'
import { AppointmentsScreen }      from './screens/AppointmentsScreen'
import { ProfileScreen }           from './screens/ProfileScreen'
import { HospitalProfileScreen }   from './screens/HospitalProfileScreen'
import { BookingFlowScreen }       from './screens/BookingFlowScreen'
import { ConfirmationScreen }      from './screens/ConfirmationScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

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

function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false)

  if (!splashDone) {
    return (
      <SafeAreaProvider>
        <SplashScreen onNext={() => setSplashDone(true)} />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="HospitalProfile" component={HospitalProfileScreen} />
          <Stack.Screen name="BookingFlow" component={BookingFlowScreen} />
          <Stack.Screen name="Confirmation" component={ConfirmationScreen}
            options={{ animation: 'fade' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  )
}
