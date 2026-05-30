import 'react-native-url-polyfill/auto'
import { Component, useEffect, useState } from 'react'
import { View, ActivityIndicator, Text, ScrollView } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { dark as t } from './lib/theme'

import { HomeScreen }             from './screens/HomeScreen'
import { SearchScreen }           from './screens/SearchScreen'
import { AppointmentsScreen }     from './screens/AppointmentsScreen'
import { ProfileScreen }          from './screens/ProfileScreen'
import { HospitalProfileScreen }  from './screens/HospitalProfileScreen'
import { LoginScreen }            from './screens/LoginScreen'
import { RegisterScreen }         from './screens/RegisterScreen'
import { MedicalHistoryScreen }   from './screens/MedicalHistoryScreen'
import { PrescriptionsScreen }    from './screens/PrescriptionsScreen'
import { DependentsScreen }       from './screens/DependentsScreen'
import { InsuranceScreen }        from './screens/InsuranceScreen'
import { NotificationsScreen }    from './screens/NotificationsScreen'
import { PrivacySecurityScreen }  from './screens/PrivacySecurityScreen'
import { BookingScreen }          from './screens/BookingScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0a0a0a', padding: 24, justifyContent: 'center' }}>
          <Text style={{ color: '#ff5c5c', fontSize: 18, fontWeight: '800', marginBottom: 12 }}>App Error</Text>
          <ScrollView>
            <Text style={{ color: '#fff', fontSize: 13, lineHeight: 20 }}>
              {String((this.state.error as Error).message)}{'\n\n'}
              {String((this.state.error as Error).stack)}
            </Text>
          </ScrollView>
        </View>
      )
    }
    return this.props.children
  }
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: t.bgCard,
          borderTopColor: t.border,
          paddingTop: 4, paddingBottom: 20, height: 72,
        },
        tabBarActiveTintColor:   t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle:        { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}>
      <Tab.Screen name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⊞</Text> }} />
      <Tab.Screen name="Search"
        component={SearchScreen}
        options={{ tabBarLabel: 'Search', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⊕</Text> }} />
      <Tab.Screen name="Appointments"
        component={AppointmentsScreen}
        options={{ tabBarLabel: 'Bookings', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◆</Text> }} />
      <Tab.Screen name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>●</Text> }} />
    </Tab.Navigator>
  )
}

function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main"            component={TabNavigator} />
      <Stack.Screen name="HospitalProfile" component={HospitalProfileScreen} />
      <Stack.Screen name="MedicalHistory"  component={MedicalHistoryScreen} />
      <Stack.Screen name="Prescriptions"   component={PrescriptionsScreen} />
      <Stack.Screen name="Dependents"      component={DependentsScreen} />
      <Stack.Screen name="Insurance"       component={InsuranceScreen} />
      <Stack.Screen name="Notifications"   component={NotificationsScreen} />
      <Stack.Screen name="PrivacySecurity" component={PrivacySecurityScreen} />
      <Stack.Screen name="Booking"         component={BookingScreen} />
    </Stack.Navigator>
  )
}

function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} size="large" />
      </View>
    )
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer>
          {session ? <MainNavigator /> : <AuthNavigator />}
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}
