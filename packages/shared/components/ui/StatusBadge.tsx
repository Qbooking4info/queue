import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'

const LABELS: Record<string, string> = {
  open: 'Open now', busy: 'Busy', virtual: 'Virtual',
  cancelled: 'Cancelled', confirmed: 'Confirmed',
  pending: 'Pending', completed: 'Completed',
}

// Statuses where a live coloured dot earns its place -- "this is happening now"
// rather than a settled, finished state. Completed and cancelled get no dot.
const DOTTED = new Set(['open', 'confirmed', 'virtual', 'busy', 'pending'])

// Glass-language status pill: softer tint, sentence case rather than shouting
// uppercase, and a glowing dot for live states. Same public API (`type`) as
// before, so every call site is unchanged.
export function StatusBadge({ type }: { type: string }) {
  const { theme: t } = useTheme()
  const map: Record<string, { bg: string; text: string; border: string }> = {
    open: t.statusOpen, busy: t.statusBusy,
    virtual: t.statusVirtual, cancelled: t.statusCancelled,
    confirmed: t.statusOpen, pending: t.statusBusy,
    completed: t.statusNeutral,
  }
  const s = map[type] ?? { bg: t.accentBg, text: t.accent, border: t.accentBorder }

  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      {DOTTED.has(type) && (
        <View style={[styles.dot, { backgroundColor: s.text, shadowColor: s.text }]} />
      )}
      <Text style={[styles.label, { color: s.text }]}>{LABELS[type] ?? type}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4, elevation: 2,
  },
  label: { fontSize: 11, fontWeight: '500' },
})
