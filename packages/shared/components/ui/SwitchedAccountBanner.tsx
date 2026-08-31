import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { haptics } from '../../lib/haptics'

// A single global "you're inside someone else's account" strip, mounted once
// at the root next to OfflineBanner -- the point is the same: without it,
// which identity the live session actually belongs to is invisible, and a
// caretaker could book/pay/view thinking they're on their own account when
// they're really still switched into a dependent's. Always visible, always
// tappable, for as long as switchedInto is set.
export function SwitchedAccountBanner() {
  const { switchedInto, switchBackToCaretaker } = useAuth()
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const [switching, setSwitching] = useState(false)

  if (!switchedInto) return null

  async function handleSwitchBack() {
    setSwitching(true)
    const err = await switchBackToCaretaker()
    setSwitching(false)
    if (err) haptics.error()
    else haptics.success()
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={switching}
      onPress={handleSwitchBack}
      style={[styles.bar, {
        paddingTop: insets.top + 6,
        backgroundColor: t.accentBg,
        borderBottomColor: t.accentBorder,
      }]}
    >
      <Ionicons name="people-outline" size={15} color={t.accent} />
      <Text style={[styles.text, { color: t.accent }]} numberOfLines={1}>
        Managing {switchedInto.fullName}&apos;s account
      </Text>
      <View style={styles.spacer} />
      {switching
        ? <ActivityIndicator size="small" color={t.accent} />
        : <Text style={[styles.action, { color: t.accent }]}>Switch back</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingBottom: 7,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  text:    { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1, flexShrink: 1 },
  spacer:  { flex: 1 },
  action:  { fontSize: 12.5, fontWeight: '800', letterSpacing: -0.1 },
})
