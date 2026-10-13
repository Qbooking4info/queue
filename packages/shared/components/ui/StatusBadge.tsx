import { View, StyleSheet } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '../../contexts/ThemeContext'

// v3.1: status is always a word plus a glyph, never colour alone.
const LABELS: Record<string, string> = {
  open: 'Open now', busy: 'Busy', virtual: 'Virtual',
  pending: '● Pending', pending_approval: '● Pending', confirmed: '✓ Confirmed',
  checked_in: '→ Checked in', in_progress: '◉ In progress', completed: '✓ Completed',
  cancelled: '✕ Cancelled', no_show: '✕ No-show', emergency: '! Emergency',
}

export function StatusBadge({ type, label }: { type: string; label?: string }) {
  const { theme: t } = useTheme()
  const map: Record<string, { bg: string; text: string; border: string }> = {
    open: t.statusOpen, busy: t.statusBusy, virtual: t.statusVirtual,
    pending: t.statusBusy, pending_approval: t.statusApproval, confirmed: t.statusOpen,
    checked_in: t.statusVirtual, in_progress: t.statusProgress, completed: t.statusSuccess,
    cancelled: t.statusCancelled, no_show: t.statusNeutral,
    emergency: { bg: t.dangerBg, text: t.danger, border: t.dangerBorder },
  }
  const s = map[type] ?? { bg: t.accentBg, text: t.accent, border: t.accentBorder }
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.label, { color: s.text }]}>{label ?? LABELS[type] ?? type}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, borderWidth: 1, alignSelf: 'flex-start' },
  label: { fontSize: 11, fontWeight: '700' },
})
