import { useState } from 'react'
import { View, Image, StyleSheet } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  initials: string
  bg?: string
  size?: number
  /** Doctor's photo or hospital's logo. Falls back to initials when absent or broken. */
  uri?: string | null
}

// `bg` is accepted for compatibility but ignored: the old per-name palette was all dark
// greens tuned for the Forest theme. v3.1 avatars use the theme tint so they read in both modes.
export function Avatar({ initials, size = 42, uri }: Props) {
  const { theme: t } = useTheme()
  // A stored URL can 404 — the file was removed, or the bucket was switched off.
  // Initials are the fallback in that case, so the row never shows a broken box.
  const [failed, setFailed] = useState(false)
  const showImage = !!uri && !failed

  return (
    <View style={[styles.container, {
      width: size, height: size, borderRadius: size * 0.28,
      backgroundColor: t.accentBg, borderColor: t.accentBorder,
    }]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          onError={() => setFailed(true)}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: '100%', borderRadius: size * 0.28 - 1.5 }}
        />
      ) : (
        <Text style={[styles.text, { fontSize: size * 0.28, color: t.accent }]}>{initials}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0, overflow: 'hidden' },
  text: { fontWeight: '700', letterSpacing: -0.2 },
})
