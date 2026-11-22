/**
 * The handoff's bottom tab bar, which react-navigation's default cannot draw:
 * the selected tab is marked by a 2px rule along the TOP edge of its own cell,
 * not by a tint or an indicator pill. Everything else (60px cells, 10.5px
 * labels, 500 -> 700 on selection) is read off the handoff markup.
 *
 * Pass it as the navigator's `tabBar`:
 *   <Tab.Navigator tabBar={props => <QTabBar {...props} />}>
 */
import { View, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui/Typography'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * Icon per route name, outline when idle and filled when selected. Keyed by
 * route name rather than passed per-screen so the four apps cannot drift into
 * using different icons for the same idea.
 */
const ICONS: Record<string, [string, string]> = {
  // Patient
  Home: ['home-outline', 'home'],
  Appointments: ['calendar-outline', 'calendar'],
  MyRecords: ['document-text-outline', 'document-text'],
  Messages: ['chatbubble-outline', 'chatbubble'],
  Profile: ['person-outline', 'person'],
  // Hospital
  AdminDashboard: ['home-outline', 'home'],
  FrontDeskQueue: ['list-outline', 'list'],
  WalkInBooking: ['person-add-outline', 'person-add'],
  StaffAppointments: ['calendar-outline', 'calendar'],
  StaffMore: ['ellipsis-horizontal', 'ellipsis-horizontal'],
  // Doctor
  Dashboard: ['grid-outline', 'grid'],
  Queue: ['list-outline', 'list'],
  ReferralInbox: ['file-tray-outline', 'file-tray'],
  // Ambulance -- crew, then the fleet operator's console
  CrewHome: ['medkit-outline', 'medkit'],
  CrewMessages: ['chatbubble-outline', 'chatbubble'],
  CrewProfile: ['person-outline', 'person'],
  AdminHome: ['grid-outline', 'grid'],
  AdminFleet: ['car-sport-outline', 'car-sport'],
  FleetMap: ['map-outline', 'map'],
  AdminProfile: ['person-outline', 'person'],
}

export function QTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.q.tab,
        borderTopWidth: 1,
        borderTopColor: t.q.line,
        paddingHorizontal: 4,
        paddingBottom: 6 + insets.bottom,
      }}>
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key]
        const on = state.index === i
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name)
        const [idle, active] = ICONS[route.name] ?? ICONS.Home
        const badge = options.tabBarBadge
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
            onPress={() => {
              // navigation.emit is what lets a screen intercept a tab press
              // (scroll-to-top, "are you sure"); going straight to navigate
              // would silently break those.
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!on && !e.defaultPrevented) navigation.navigate(route.name, route.params)
            }}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 60,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              borderTopWidth: 2,
              borderTopColor: on ? t.q.primary : 'transparent',
            }}>
            <View>
              <Ionicons
                name={(on ? active : idle) as React.ComponentProps<typeof Ionicons>['name']}
                size={21}
                color={on ? t.q.primary : t.q.ink60}
              />
              {badge != null && badge !== '' && (
                <View style={{
                  position: 'absolute', top: -2, right: -4,
                  minWidth: 9, height: 9, borderRadius: 5,
                  backgroundColor: t.q.redFill,
                }} />
              )}
            </View>
            <Text
              numberOfLines={1}
              style={{ fontSize: 10.5, fontWeight: on ? '700' : '500', color: on ? t.q.primary : t.q.ink60 }}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
