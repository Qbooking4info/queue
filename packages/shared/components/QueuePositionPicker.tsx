import { useEffect, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { getQueuePositionBounds, moveAppointmentQueuePosition } from '../lib/api'

interface Props {
  appointmentId: string
  onClose: () => void
  onMoved: (newPosition: number) => void
}

// A patient voluntarily stepping back in the queue -- never jumping ahead.
// Only positions LATER than their current one are offered at all; the backend
// enforces the same rule independently, this is just what makes the choice
// make sense in the UI. No other patients' names are shown, only positions.
//
// Confirmation is an inline step within this same Modal, not a second
// Alert.alert() call -- AlertContext's own Modal is mounted once at the app
// root (so its web portal node is created at app startup), while this Modal
// is created on demand when the picker opens; on web, react-native-web's
// Modal doesn't reliably stack the more-recently-mounted one on top by
// visibility, so an Alert triggered from inside an already-open screen-level
// Modal like this one renders BEHIND it -- confirmed live, the "Move" button
// was completely covered by this picker's own overlay and unclickable.
export function QueuePositionPicker({ appointmentId, onClose, onMoved }: Props) {
  const { theme: t } = useTheme()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPosition, setCurrentPosition] = useState<number | null>(null)
  const [maxPosition, setMaxPosition] = useState<number | null>(null)
  const [pendingPosition, setPendingPosition] = useState<number | null>(null)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getQueuePositionBounds(appointmentId).then(result => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) { setError(result.error); return }
      setCurrentPosition(result.currentPosition)
      setMaxPosition(result.maxPosition)
    })
    return () => { cancelled = true }
  }, [appointmentId])

  async function confirmMove() {
    if (pendingPosition == null) return
    setMoving(true)
    const { error: err } = await moveAppointmentQueuePosition(appointmentId, pendingPosition)
    setMoving(false)
    if (err) { haptics.error(); setError(err); setPendingPosition(null); return }
    haptics.success()
    onMoved(pendingPosition)
  }

  const laterPositions = currentPosition != null && maxPosition != null
    ? Array.from({ length: maxPosition - currentPosition }, (_, i) => currentPosition + i + 1)
    : []

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[st.title, { color: t.textPrimary }]}>Change Queue Position</Text>

          {loading ? (
            <ActivityIndicator color={t.accent} style={{ marginVertical: 24 }} />
          ) : pendingPosition != null ? (
            <>
              <Text style={[st.sub, { color: t.textMuted }]}>
                Move to #{pendingPosition}? Everyone currently between your spot and the new one will move up to fill the gap.
              </Text>
              <View style={st.confirmRow}>
                <TouchableOpacity onPress={() => setPendingPosition(null)} disabled={moving}
                  style={[st.confirmBtn, { borderColor: t.cardBorder }]}>
                  <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmMove} disabled={moving}
                  style={[st.confirmBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
                  {moving ? <ActivityIndicator size="small" color={t.accent} />
                    : <Text style={{ color: t.accent, fontWeight: '800', fontSize: 14 }}>Move to #{pendingPosition}</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : error ? (
            <Text style={{ fontSize: 13, color: '#FF5C5C', marginTop: 12 }}>{error}</Text>
          ) : laterPositions.length === 0 ? (
            <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 12 }}>
              You're already at the end of the queue.
            </Text>
          ) : (
            <>
              <Text style={[st.sub, { color: t.textMuted }]}>
                You're currently #{currentPosition}. Pick a later position to let others go ahead of you.
              </Text>
              <View style={{ marginTop: 14 }}>
                {laterPositions.map(position => (
                  <TouchableOpacity key={position} onPress={() => setPendingPosition(position)}
                    style={[st.slot, { borderColor: t.cardBorder }]}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: t.textPrimary }}>Move to #{position}</Text>
                    <Ionicons name="arrow-forward" size={14} color={t.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {pendingPosition == null && (
            <TouchableOpacity onPress={onClose} style={[st.closeBtn, { borderColor: t.cardBorder }]}>
              <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 20 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  slot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  closeBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
})
