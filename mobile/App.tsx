import 'react-native-url-polyfill/auto'
import { useEffect, useState } from 'react'
import { View, ActivityIndicator, Text } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { dark as t } from './lib/theme'

import { HomeScreen }         from './screens/HomeScreen'
import { SearchScreen }       from './screens/SearchScreen'
import { AppointmentsScreen } from './screens/AppointmentsScreen'
import { ProfileScreen }      from './screens/ProfileScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

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

function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
    </Stack.Navigator>
  )
}

export default function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(() => setLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {})
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
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  )
}
