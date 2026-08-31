import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'

const LABELS: Record<string, string> = {
  open: 'Open Now', busy: 'Busy', virtual: 'Virtual',
  cancelled: 'Cancelled', confirmed: 'Confirmed',
  pending: 'Pending', completed: 'Completed',
}

export function StatusBadge({ type }: { type: string }) {
  const { theme: t } = useTheme()
  const map: Record<string, { bg: string; text: string; border: string }> = {
    open: t.statusOpen, busy: t.statusBusy,
    virtual: t.statusVirtual, cancelled: t.statusCancelled,
    confirmed: t.statusOpen, pending: t.statusBusy, completed: { bg: t.inputBg, text: t.textMuted, border: t.cardBorder },
  }
  const s = map[type] ?? { bg: t.accentBg, text: t.accent, border: t.accentBorder }
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.label, { color: s.text }]}>{LABELS[type] ?? type}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
})
