import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAudioPlayer } from 'expo-audio'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { supabase } from '../lib/supabase'
import { markNotificationRead } from '../lib/api'
import { WELLNESS_TIPS } from '../lib/wellness-tips'

interface RingNotif { id: string; title: string; body: string }

// Rendered at the SCREEN root (a sibling of the main ScrollView), not from
// inside LiveQueueCard -- React Native's `position: 'absolute'` is scoped to
// the nearest ancestor View (every RN View defaults to position:'relative',
// so on web there's always a containing block one level up), so an overlay
// mounted deep inside a card would only cover that card's own box, not the
// screen. Rendering it here instead of via React Native's <Modal> sidesteps a
// separate, confirmed-live bug: react-native-web's Modal leaves a zero-height
// wrapper in its DOM when a second Modal instance coexists in the tree
// (AlertContext's own root Modal is always mounted, just invisible) -- visually
// harmless (fixed-position children escape the zero-height flow parent) but it
// breaks things that walk rendered text/accessibility trees.
export function useRingAlert(userId: string | undefined) {
  const [ringNotif, setRingNotif] = useState<RingNotif | null>(null)

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`patient-ring:${userId}`)
      .on('postgres_changes' as any, {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`,
      }, (payload: any) => {
        if (payload.new?.type === 'queue_ring') {
          setRingNotif({ id: payload.new.id, title: payload.new.title, body: payload.new.body })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  function dismissRing() {
    if (ringNotif) markNotificationRead(ringNotif.id)
    setRingNotif(null)
  }

  return { ringNotif, dismissRing }
}

export function RingOverlay({ notif, onDismiss }: { notif: RingNotif; onDismiss: () => void }) {
  const { theme: t } = useTheme()
  const [tipIndex, setTipIndex] = useState(0)
  const pulse = useRef(new Animated.Value(1)).current
  const player = useAudioPlayer(require('../assets/sounds/ring.wav'))

  useEffect(() => {
    player.loop = true
    player.play()
    haptics.heavy()
    return () => { player.pause() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [pulse])

  useEffect(() => {
    const interval = setInterval(() => setTipIndex(i => (i + 1) % WELLNESS_TIPS.length), 4000)
    return () => clearInterval(interval)
  }, [])

  function dismiss() {
    player.pause()
    onDismiss()
  }

  return (
    <View style={st.ringOverlay}>
      <Animated.View style={[st.ringIcon, { backgroundColor: t.accentBg, borderColor: t.accent, transform: [{ scale: pulse }] }]}>
        <Ionicons name="notifications" size={40} color={t.accent} />
      </Animated.View>
      <Text style={st.ringTitle}>{notif.title}</Text>
      <Text style={st.ringBody}>{notif.body}</Text>

      <View style={[st.tipBox, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
        <Ionicons name="bulb-outline" size={14} color="rgba(255,255,255,0.7)" />
        <Text style={st.tipText}>{WELLNESS_TIPS[tipIndex]}</Text>
      </View>

      <TouchableOpacity onPress={dismiss} style={[st.dismissBtn, { backgroundColor: t.accent }]}>
        <Text style={st.dismissBtnText}>I'm on my way</Text>
      </TouchableOpacity>
    </View>
  )
}

const st = StyleSheet.create({
  ringOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center',
    padding: 32, zIndex: 9999, elevation: 24,
  },
  ringIcon:    { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 20 },
  ringTitle:   { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  ringBody:    { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  tipBox:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 14, marginTop: 32, maxWidth: 320 },
  tipText:     { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  dismissBtn:  { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 32 },
  dismissBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
