import { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'
import { moveAppointmentQueuePosition } from '../../lib/api'

interface QueueRow {
  id: string
  queue_position: number | null
  patient?: { full_name: string } | null
  walkin_patient_name?: string | null
}

interface Props {
  appt: QueueRow
  // The same doctor+day's other checked-in patients (not including appt itself) --
  // built from data the screen already has, no extra fetch needed. Ordered by
  // queue_position.
  queue: QueueRow[]
  onClose: () => void
  onMoved: () => void
}

// Lets front desk drop a checked-in patient into any slot in their doctor's
// queue -- unlike a patient's own self-delay (later-only), staff can move
// either direction. Reuses the same move_appointment_in_queue backend as the
// patient picker; this UI just lists the current order and lets staff tap a
// target slot.
export function MovePositionModal({ appt, queue, onClose, onMoved }: Props) {
  const { theme: t } = useTheme()
  const [moving, setMoving] = useState<number | null>(null)
  const [error, setError] = useState('')

  const others = queue.filter(q => q.id !== appt.id).sort((a, b) => (a.queue_position ?? Infinity) - (b.queue_position ?? Infinity))
  // Every position from 1 to (others.length + 1) is a valid slot to drop into.
  const slots = Array.from({ length: others.length + 1 }, (_, i) => i + 1)

  async function moveTo(position: number) {
    if (position === appt.queue_position) return
    setMoving(position)
    setError('')
    const { error: err } = await moveAppointmentQueuePosition(appt.id, position)
    setMoving(null)
    if (err) { haptics.error(); setError(err); return }
    haptics.success()
    onMoved()
  }

  const name = appt.patient?.full_name ?? appt.walkin_patient_name ?? 'Patient'

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[st.title, { color: t.textPrimary }]}>Move in Queue</Text>
          <Text style={[st.sub, { color: t.textMuted }]}>{name} · currently #{appt.queue_position ?? '—'}</Text>

          <View style={{ marginTop: 14, maxHeight: 320 }}>
            {slots.map(position => {
              const isCurrent = position === appt.queue_position
              const occupant = others.find(o => (o.queue_position ?? 0) === position)
              return (
                <TouchableOpacity key={position} disabled={isCurrent || moving !== null} onPress={() => moveTo(position)}
                  style={[st.slot, {
                    borderColor: isCurrent ? t.accentBorder : t.cardBorder,
                    backgroundColor: isCurrent ? t.accentBg : 'transparent',
                  }]}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isCurrent ? t.accent : t.textPrimary, width: 28 }}>#{position}</Text>
                  <Text style={{ fontSize: 13, color: t.textMuted, flex: 1 }} numberOfLines={1}>
                    {isCurrent ? `${name} (current)` : occupant ? `Currently: ${occupant.patient?.full_name ?? occupant.walkin_patient_name ?? 'Patient'}` : 'End of queue'}
                  </Text>
                  {moving === position ? <ActivityIndicator size="small" color={t.accent} />
                    : !isCurrent && <Ionicons name="arrow-forward" size={14} color={t.textMuted} />}
                </TouchableOpacity>
              )
            })}
          </View>

          {!!error && <Text style={{ fontSize: 12, color: '#FF5C5C', marginTop: 10 }}>{error}</Text>}

          <TouchableOpacity onPress={onClose} disabled={moving !== null} style={[st.closeBtn, { borderColor: t.cardBorder }]}>
            <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 20 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  closeBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
})
