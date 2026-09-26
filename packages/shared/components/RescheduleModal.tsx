import { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { fmtLocalDate } from '../lib/format'

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return { iso: fmtLocalDate(d), label: d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) }
  })
}

const TIMES = Array.from({ length: 20 }, (_, i) => {
  const totalMins = 8 * 60 + i * 30 // 08:00 -> 17:30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  return { value: `${hh}:${mm}`, label: `${h % 12 || 12}:${mm} ${ampm}` }
})

const DATES = nextDays(21)

interface Props {
  patientName?: string
  onClose: () => void
  onConfirm: (payload: { date: string; startTime: string; reason?: string }) => Promise<string | null>
}

/**
 * Staff/doctor-initiated reschedule -- free-form date/time entry, not bound to
 * a real time_slots row (staff get discretion here, same as walk-in booking).
 * Modeled on apps/client/screens/DirectBookingScreen.tsx's own date/time chip
 * picker, the one real free-form precedent already in the codebase.
 */
export function RescheduleModal({ patientName, onClose, onConfirm }: Props) {
  const { theme: t } = useTheme()
  const [date, setDate] = useState(DATES[0].iso)
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (!time) return
    setSubmitting(true)
    setError('')
    const err = await onConfirm({ date, startTime: time, reason: reason.trim() || undefined })
    setSubmitting(false)
    if (err) { haptics.error(); setError(err); return }
    haptics.success()
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[st.title, { color: t.textPrimary }]}>Reschedule Appointment</Text>
          {patientName && <Text style={[st.sub, { color: t.textMuted }]}>{patientName}</Text>}

          <Text style={[st.label, { color: t.textMuted }]}>NEW DATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {DATES.map(d => (
              <TouchableOpacity key={d.iso} onPress={() => { haptics.tap(); setDate(d.iso) }}
                style={[st.dateChip, { backgroundColor: date === d.iso ? t.accentBg : t.inputBg, borderColor: date === d.iso ? t.accentBorder : t.cardBorder }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: date === d.iso ? t.accent : t.textPrimary }}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[st.label, { color: t.textMuted }]}>NEW TIME</Text>
          <View style={st.timeGrid}>
            {TIMES.map(tm => (
              <TouchableOpacity key={tm.value} onPress={() => { haptics.tap(); setTime(tm.value) }}
                style={[st.timeChip, { backgroundColor: time === tm.value ? t.accentBg : t.inputBg, borderColor: time === tm.value ? t.accentBorder : t.cardBorder }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: time === tm.value ? t.accent : t.textPrimary }}>{tm.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[st.label, { color: t.textMuted, marginTop: 14 }]}>REASON (OPTIONAL)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. doctor unavailable, patient requested…"
            placeholderTextColor={t.textMuted}
            style={[st.reasonInput, { color: t.textPrimary, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}
          />

          {error ? <Text style={{ fontSize: 12, color: t.danger, marginTop: 10 }}>{error}</Text> : null}

          <View style={st.confirmRow}>
            <TouchableOpacity onPress={onClose} disabled={submitting}
              style={[st.confirmBtn, { borderColor: t.cardBorder }]}>
              <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirm} disabled={submitting || !time}
              style={[st.confirmBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg, opacity: !time ? 0.5 : 1 }]}>
              {submitting ? <ActivityIndicator size="small" color={t.accent} />
                : <Text style={{ color: t.accent, fontWeight: '800', fontSize: 14 }}>Confirm New Time</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card:       { width: '100%', maxWidth: 420, maxHeight: '85%', borderRadius: 18, borderWidth: 1, padding: 20 },
  title:      { fontSize: 17, fontWeight: '800' },
  sub:        { fontSize: 13, marginTop: 4, marginBottom: 4 },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  dateChip:   { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  timeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip:   { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  reasonInput:{ borderRadius: 10, borderWidth: 1, padding: 10, fontSize: 13 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
})
