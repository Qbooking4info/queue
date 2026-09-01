// Responsive navigation chrome shared by every top-level doctor-app screen --
// a persistent left sidebar on wide (web/tablet) viewports, matching the
// hospital web dashboard's Sidebar.tsx (same dark-green background, same
// accent-highlighted active item, same logo/user-chip/sign-out layout), and
// a compact bottom tab bar on an actual phone-width screen. One shared nav
// item list drives both, so there's no risk of the two layouts drifting.
import { View, Text, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { haptics } from '../lib/haptics'

const WIDE_BREAKPOINT = 820

export type ShellRoute = 'Dashboard' | 'Queue' | 'Appointments' | 'Hospitals' | 'Settings'

const NAV_ITEMS: { route: ShellRoute; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { route: 'Dashboard',    label: 'Dashboard',     icon: 'grid-outline' },
  { route: 'Queue',        label: "Today's Queue", icon: 'list-outline' },
  { route: 'Appointments', label: 'Appointments',  icon: 'calendar-outline' },
  { route: 'Hospitals',    label: 'Hospitals',     icon: 'business-outline' },
  { route: 'Settings',     label: 'Settings',      icon: 'settings-outline' },
]

export function AppShell({ active, navigation, children }: {
  active: ShellRoute
  navigation: any
  children: React.ReactNode
}) {
  const { theme: t } = useTheme()
  const { user, doctorProfile, signOut } = useAuth()
  const { width } = useWindowDimensions()
  const isWide = width >= WIDE_BREAKPOINT

  const initials = (doctorProfile?.fullName ?? user?.full_name ?? 'Dr')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'D'

  function go(route: ShellRoute) {
    if (route === active) return
    haptics.tap()
    navigation.navigate(route)
  }

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.canvasBg }}>
        {/* Sidebar */}
        <View style={{ width: 220, flexShrink: 0, backgroundColor: t.splashBg, height: '100%' }}>
          <SafeAreaView edges={['top', 'left']} style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: t.accentBgMid, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="medkit-outline" size={16} color={t.accent} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 }}>Queue</Text>
                  <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.6 }}>DOCTOR PORTAL</Text>
                </View>
              </View>
            </View>

            <View style={{ flex: 1, padding: 10 }}>
              {NAV_ITEMS.map(item => {
                const isActive = item.route === active
                return (
                  <TouchableOpacity key={item.route} onPress={() => go(item.route)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2,
                      backgroundColor: isActive ? t.accentBgMid : 'transparent',
                    }}>
                    <Ionicons name={item.icon} size={16} color={isActive ? t.accent : 'rgba(255,255,255,0.55)'} />
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '500', color: isActive ? t.accent : 'rgba(255,255,255,0.55)' }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: t.accentBgMid, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: t.accent }}>{initials}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>
                    {doctorProfile?.fullName ?? user?.full_name ?? 'Doctor'}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                    {doctorProfile ? 'Doctor' : 'Independent'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => signOut()}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                <Ionicons name="log-out-outline" size={14} color="rgba(255,255,255,0.55)" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)' }}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      </View>
    )
  }

  // Narrow (phone): content fills the screen, compact bottom tab bar overlays.
  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <View style={{ flex: 1 }}>{children}</View>
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: t.cardBg, borderTopWidth: 1, borderTopColor: t.cardBorder }}>
        <View style={{ flexDirection: 'row', paddingTop: 6 }}>
          {NAV_ITEMS.map(item => {
            const isActive = item.route === active
            return (
              <TouchableOpacity key={item.route} onPress={() => go(item.route)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 }}>
                <Ionicons name={item.icon} size={19} color={isActive ? t.accent : t.textMuted} />
                <Text style={{ fontSize: 9, fontWeight: '600', color: isActive ? t.accent : t.textMuted }}>{item.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </SafeAreaView>
    </View>
  )
}

export function ShellScroll({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    // A bare ScrollView has no background of its own, so on Android it falls through to
    // the window's light default while everything drawn inside it is dark-themed -- the
    // doctor dashboard rendered dark cards and a dark tab bar on a light grey page, with
    // the "Welcome, Dr X" heading dark-on-dark and effectively invisible. Typecheck and
    // lint both pass on that, so it only shows up on a screenshot of a real build.
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: t.canvasBg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {children}
    </ScrollView>
  )
}
