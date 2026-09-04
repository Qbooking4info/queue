import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native'
import { Alert } from '../../contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import {
  loadEmergencyContacts, telHref, KIND_LABEL, type EmergencyContact,
} from '../../lib/emergency-directory'

/**
 * The always-available "call someone now" panel.
 *
 * Deliberately not gated behind a failed search. A patient watching a spinner is
 * a patient not dialling, and the two paths cost nothing to run in parallel — if
 * they call *and* we find a unit, that's a good outcome. `variant` only changes
 * how loudly it presents itself, never whether the numbers are reachable.
 */

interface Props {
  /** 'calm' while a search is running; 'urgent' once we've given up or timed out. */
  variant?: 'calm' | 'urgent'
  state?: string | null
  title?: string
}

export function FallbackPanel({ variant = 'calm', state, title }: Props) {
  const { theme: t } = useTheme()
  const [contacts, setContacts] = useState<EmergencyContact[]>([])

  useEffect(() => loadEmergencyContacts(setContacts, { state }), [state])

  const urgent = variant === 'urgent'
  const accent = urgent ? t.danger : t.textMuted

  function dial(contact: EmergencyContact) {
    Linking.openURL(telHref(contact.phone)).catch(() =>
      Alert.alert('Could not start the call', `Dial ${contact.phone} directly.`),
    )
  }

  // No verified numbers for this location yet. Say so plainly rather than
  // rendering an empty box — someone in an emergency needs to know immediately
  // that this route is a dead end, so they stop waiting on it.
  if (contacts.length === 0) {
    return (
      <View style={[s.card, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
        <Text style={[s.emptyText, { color: t.textMuted }]}>
          No verified emergency numbers are listed for your area yet. If this is
          life-threatening, call your local emergency service directly.
        </Text>
      </View>
    )
  }

  return (
    <View style={[s.card, {
      borderColor: urgent ? 'rgba(255,92,92,0.4)' : t.cardBorder,
      backgroundColor: urgent ? 'rgba(255,92,92,0.08)' : t.cardBg,
      borderWidth: urgent ? 1.5 : 1,
    }]}>
      <View style={s.header}>
        <Ionicons name={urgent ? 'alert-circle' : 'call-outline'} size={15} color={accent} />
        <Text style={[s.title, { color: accent }]}>
          {title ?? (urgent ? 'Call one of these now' : "Don't want to wait? Call now")}
        </Text>
      </View>

      {contacts.map(c => (
        <TouchableOpacity
          key={c.id}
          onPress={() => dial(c)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Call ${c.name} on ${c.phone}`}
          style={[s.row, { borderTopColor: t.cardBorder }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: t.textPrimary }]} numberOfLines={1}>{c.name}</Text>
            <Text style={[s.meta, { color: t.textMuted }]} numberOfLines={1}>
              {KIND_LABEL[c.kind]}{c.city ? ` · ${c.city}` : ''}
            </Text>
          </View>
          <View style={[s.phonePill, {
            borderColor: urgent ? 'rgba(255,92,92,0.4)' : t.cardBorder,
            backgroundColor: urgent ? 'rgba(255,92,92,0.12)' : 'transparent',
          }]}>
            <Ionicons name="call" size={13} color={urgent ? t.danger : t.textPrimary} />
            <Text style={[s.phone, { color: urgent ? t.danger : t.textPrimary }]}>{c.phone}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  card:       { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  title:      { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
                borderTopWidth: 1, marginTop: 6 },
  name:       { fontSize: 13.5, fontWeight: '700' },
  meta:       { fontSize: 11, marginTop: 2 },
  phonePill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1,
                borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  phone:      { fontSize: 12.5, fontWeight: '800' },
  emptyText:  { fontSize: 12, lineHeight: 18 },
})
