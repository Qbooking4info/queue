import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

export function SplashScreen({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  const { theme: t } = useTheme()
  const [vis, setVis] = useState(false)
  useEffect(() => { setTimeout(() => setVis(true), 100) }, [])

  return (
    <View style={[styles.root, { backgroundColor: t.splashBg }]}>
      {/* Logo */}
      <View style={[styles.logoBox, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder,
        opacity: vis ? 1 : 0, transform: [{ scale: vis ? 1 : 0.6 }] }]}>
        <Text style={{ fontSize: 40 }}>🏥</Text>
      </View>

      {/* Brand */}
      <View style={{ opacity: vis ? 1 : 0, alignItems: 'center', marginTop: 8 }}>
        <Text style={styles.brand}>Queue</Text>
        <Text style={[styles.tagline, { color: 'rgba(255,255,255,0.45)' }]}>
          HEALTHCARE, ON YOUR SCHEDULE
        </Text>
      </View>

      {/* Feature tags */}
      <View style={[styles.tags, { opacity: vis ? 1 : 0 }]}>
        {['Book appointments', 'Virtual consults', 'AI-powered care'].map(tag => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>

      {/* CTAs */}
      <View style={[styles.ctaGroup, { opacity: vis ? 1 : 0 }]}>
        <TouchableOpacity onPress={onGetStarted} activeOpacity={0.85}
          style={[styles.btnPrimary, { backgroundColor: t.accent }]}>
          <Text style={[styles.btnPrimaryText]}>Get started</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSignIn} activeOpacity={0.7} style={styles.btnSecondary}>
          <Text style={[styles.btnSecondaryText, { color: 'rgba(255,255,255,0.6)' }]}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  logoBox:        { width: 86, height: 86, borderRadius: 26, alignItems: 'center',
                    justifyContent: 'center', borderWidth: 1.5, marginBottom: 22 },
  brand:          { fontSize: 46, fontWeight: '800', color: '#FFFFFF', letterSpacing: -2 },
  tagline:        { fontSize: 12, letterSpacing: 1.5, marginTop: 6 },
  tags:           { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 28 },
  tag:            { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99,
                    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)' },
  tagText:        { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  ctaGroup:       { position: 'absolute', bottom: 48, left: 28, right: 28, gap: 10 },
  btnPrimary:     { padding: 16, borderRadius: 16, alignItems: 'center' },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnSecondary:   { padding: 15, borderRadius: 16, alignItems: 'center',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  btnSecondaryText:{ fontSize: 14, fontWeight: '500' },
})
