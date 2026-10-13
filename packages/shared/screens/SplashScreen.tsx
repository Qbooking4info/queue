import { useEffect, useRef } from 'react'
import { setStatusBarStyle } from 'expo-status-bar'
import { View, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '../contexts/ThemeContext'
import { QueueMark, QUEUE_TAGLINE } from '../components/ui/QueueMark'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { haptics } from '../lib/haptics'

/**
 * Shared by both apps, so the copy is a prop rather than hardcoded. The defaults are
 * the patient wording; the provider app passes its own, because showing "Book
 * appointments / AI-powered care" to hospital staff signing into their work tool
 * reads as the wrong app entirely.
 */
export function SplashScreen({
  onGetStarted,
  onSignIn,
  tagline,
  highlights = ['Book appointments', 'Virtual consults', 'AI-powered care'],
  primaryLabel,
  secondaryLabel,
  // Hospital and ambulance have no self-registration -- staff and crew accounts are
  // created by their hospital/fleet -- so they hide the secondary action rather than
  // showing two buttons that both mean "sign in". Doctors and patients do self-register,
  // so they show it and relabel it via secondaryLabel.
  showSecondary = true,
}: {
  onGetStarted: () => void
  onSignIn: () => void
  tagline?: string
  highlights?: string[]
  primaryLabel?: string
  secondaryLabel?: string
  showSecondary?: boolean
}) {
  const { theme: t } = useTheme()
  const reduced = useReducedMotion()
  // Opening sequence: the mark springs in with one soft glow ring, then the brand,
  // tagline and actions rise in. One-shot (never loops), and skipped under the OS
  // reduce-motion setting.
  const logo   = useRef(new Animated.Value(0)).current
  const ring   = useRef(new Animated.Value(0)).current
  const brand  = useRef(new Animated.Value(0)).current
  const extras = useRef(new Animated.Value(0)).current

  useEffect(() => { setStatusBarStyle('light', true) }, [])   // splash is always dark teal

  useEffect(() => {
    if (reduced) { [logo, ring, brand, extras].forEach(v => v.setValue(1)); return }
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logo, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 1, duration: 900, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.stagger(140, [
        Animated.timing(brand,  { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(extras, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start()
    const t1 = setTimeout(() => haptics.tap(), 260)   // a light tap as the mark lands
    return () => clearTimeout(t1)
  }, [reduced])

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  })
  const onAccent = t.id === 'forest' ? '#081416' : '#FFFFFF'

  return (
    <View style={[styles.root, { backgroundColor: t.splashBg }]}>
      {/* Logo + one-shot glow */}
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 160, height: 160 }}>
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', width: 132, height: 132, borderRadius: 99, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
          opacity: ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.8, 0] }),
          transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] }) }],
        }} />
        <Animated.View style={{
          opacity: logo.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
            { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) },
          ],
        }}>
          <QueueMark white size={104} />
        </Animated.View>
      </View>

      {/* Brand + tagline */}
      <Animated.View style={[{ alignItems: 'center', marginTop: 4 }, rise(brand)]}>
        <Text style={styles.brand} accessibilityRole="header">Queue</Text>
        <Text style={styles.brandTagline}>{QUEUE_TAGLINE}</Text>
        {!!tagline && <Text style={[styles.tagline, { color: 'rgba(255,255,255,0.55)' }]}>{tagline}</Text>}
      </Animated.View>

      {/* Feature tags */}
      <Animated.View style={[styles.tags, rise(extras)]}>
        {highlights.map(tag => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </Animated.View>

      {/* CTAs */}
      <Animated.View style={[styles.ctaGroup, rise(extras)]}>
        <TouchableOpacity onPress={() => { haptics.tap(); onGetStarted() }} activeOpacity={0.85} accessibilityRole="button"
          style={[styles.btnPrimary, { backgroundColor: t.accent }]}>
          <Text style={[styles.btnPrimaryText, { color: onAccent }]}>{primaryLabel ?? 'Get started'}</Text>
        </TouchableOpacity>
        {showSecondary && (
          <TouchableOpacity onPress={() => { haptics.tap(); onSignIn() }} activeOpacity={0.7} accessibilityRole="button" style={styles.btnSecondary}>
            <Text style={[styles.btnSecondaryText, { color: 'rgba(255,255,255,0.8)' }]}>{secondaryLabel ?? 'Sign in'}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  )
}


const styles = StyleSheet.create({
  root:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  logoBox:        { width: 86, height: 86, borderRadius: 26, alignItems: 'center',
                    justifyContent: 'center', borderWidth: 1.5, marginBottom: 22 },
  brand:          { fontSize: 46, fontWeight: '800', color: '#FFFFFF', letterSpacing: -2 },
  brandTagline:   { fontSize: 17, fontWeight: '600', color: '#FFFFFF', marginTop: 4, textAlign: 'center' },
  tagline:        { fontSize: 12, letterSpacing: 1.5, marginTop: 10, textAlign: 'center' },
  tags:           { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 28 },
  tag:            { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99,
                    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)' },
  tagText:        { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  ctaGroup:       { position: 'absolute', bottom: 48, left: 28, right: 28, gap: 10 },
  btnPrimary:     { padding: 16, borderRadius: 16, alignItems: 'center' },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnSecondary:   { padding: 15, borderRadius: 16, alignItems: 'center',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  btnSecondaryText:{ fontSize: 14, fontWeight: '500' },
})
