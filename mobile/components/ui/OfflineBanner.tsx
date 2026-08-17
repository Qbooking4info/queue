import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useIsOffline } from '../../hooks/useIsOffline'

/**
 * A single global "you are offline" strip, mounted once at the root.
 *
 * The point is not decoration: without it a request that failed for lack of
 * signal is indistinguishable from a hospital having no appointments, and the
 * user retries the same dead action instead of moving. It names the emergency
 * fallback explicitly because that path is designed to work with no network
 * (lib/emergency-directory.ts reads its cache first) and is the one thing worth
 * telling someone about while they have no connection.
 */
export function OfflineBanner() {
  const offline = useIsOffline()
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()

  if (!offline) return null

  return (
    <View style={[styles.bar, {
      paddingTop: insets.top + 6,
      backgroundColor: t.statusCancelled.bg,
      borderBottomColor: t.statusCancelled.border,
    }]}>
      <Ionicons name="cloud-offline-outline" size={15} color={t.statusCancelled.text} />
      <Text style={[styles.text, { color: t.statusCancelled.text }]} numberOfLines={1}>
        No connection — emergency numbers still work
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingBottom: 7,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  text: { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1 },
})
