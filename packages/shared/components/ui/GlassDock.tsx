import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useTheme } from '../../contexts/ThemeContext'

// ── The floating dock ────────────────────────────────────────────────────────
//
// Drop-in replacement for React Navigation's default tab bar:
//
//   <Tab.Navigator tabBar={props => <GlassDock {...props} />}>
//
// Only the active tab shows its label, inside a gradient pill; the rest are
// icon-only. That is what makes the dock read as a control rather than a
// toolbar, and it's why the pill can afford a real label at a legible size.
//
// The dock stays IN the layout flow rather than absolutely positioned. It looks
// floating (pill shape, side margins, shadow) but still reserves its own height,
// so no screen's scroll content can end up hidden underneath it -- absolute
// positioning would have required auditing the bottom padding of every screen
// in all four apps, and any one that was missed would silently clip its last row.
export function GlassDock({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={{
      backgroundColor: 'transparent',
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: (insets.bottom || 10) - 2,
    }}>
      <View style={{
        borderRadius: 999,
        shadowColor: t.mode === 'dark' ? '#000' : '#0C464E',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: t.mode === 'dark' ? 0.45 : 0.16,
        shadowRadius: 24,
        elevation: 12,
      }}>
        <View style={{ borderRadius: 999, overflow: 'hidden' }}>
          <BlurView tint={t.blurTint} intensity={t.blurIntensity + 15} style={StyleSheet.absoluteFill} />
          <View style={[styles.bar, { backgroundColor: t.glassStrong, borderColor: t.glassBorder }]}>
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key]
              const focused = state.index === index
              const label =
                typeof options.tabBarLabel === 'string' ? options.tabBarLabel
                : options.title ?? route.name

              // The icon name is resolved through the same tabBarIcon option the
              // screens already declare, so adopting the dock needed no change to
              // any navigator's per-screen options.
              const iconNode = options.tabBarIcon?.({
                focused,
                color: focused ? t.onBtn : t.textSecondary,
                size: 19,
              })

              function onPress() {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params)
                }
              }

              function onLongPress() {
                navigation.emit({ type: 'tabLongPress', target: route.key })
              }

              const content = (
                <>
                  {iconNode}
                  {focused && (
                    <Text numberOfLines={1} style={[styles.label, { color: t.onBtn }]}>{label}</Text>
                  )}
                </>
              )

              if (focused) {
                return (
                  <TouchableOpacity
                    key={route.key} onPress={onPress} onLongPress={onLongPress}
                    accessibilityRole="button" accessibilityState={{ selected: true }}
                    accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
                    activeOpacity={0.85}
                    style={{
                      borderRadius: 999,
                      shadowColor: t.accent,
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.45,
                      shadowRadius: 14,
                      elevation: 6,
                    }}
                  >
                    <LinearGradient
                      colors={t.btnGradient as [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[styles.tab, styles.tabActive]}
                    >
                      {content}
                    </LinearGradient>
                  </TouchableOpacity>
                )
              }

              return (
                <TouchableOpacity
                  key={route.key} onPress={onPress} onLongPress={onLongPress}
                  accessibilityRole="button" accessibilityState={{ selected: false }}
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
                  activeOpacity={0.7}
                  style={styles.tab}
                >
                  {content}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 4, padding: 7, borderRadius: 999, borderWidth: 1,
  },
  tab: {
    minWidth: 44, height: 44, borderRadius: 999,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  tabActive: { paddingHorizontal: 16 },
  label: {
    fontSize: 12.5, fontWeight: '600',
    // Keeps the pill from growing past its row on the 5-tab navigators.
    maxWidth: Platform.OS === 'web' ? undefined : 82,
  },
})
