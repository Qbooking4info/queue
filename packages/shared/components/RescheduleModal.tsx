import { useState } from 'react'
import { Modal, View, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native'
import { Text } from './ui/Typography'
import { PrimaryButton } from './ui/v3'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { fmtLocalDate } from '../lib/format'

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return {
      iso: fmtLocalDate(d),
      label: d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }),
    }
  })
}

// 08:00 -> 17:30 in half-hour steps.
const TIMES = Array.from({ length: 20 }, (_, i) => {
  const totalMins = 8 * 60 + i * 30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const mm = String(m).padStart(2, '0')
  return {
    value: `${String(h).padStart(2, '0')}:${mm}`,
    label: `${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`,
  }
})

const DATES = nextDays(21)

interface Props {
  patientName?: string
  onClose: () => void
  /** Resolves to an error string, or null on success. */
  onConfirm: (payload: { date: string; startTime: string; reason?: string }) => Promise<string | null>
}

/**
 * Staff/doctor-initiated reschedule -- free-form date/time entry, deliberately
 * not bound to a real time_slots row, so staff keep the same discretion they
 * have when booking a walk-in. Modelled on DirectBookingScreen's date/time chip
 * picker, the free-form precedent already in the codebase.
 *
 * Only offered before check-in; the caller gates on status, and the route
 * re-checks it in the UPDATE's WHERE clause.
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
          <Text style={[st.title, { color: t.textPrimary }]}>Reschedule appointment</Text>
          {!!patientName && <Text style={[st.sub, { color: t.textMuted }]}>{patientName}</Text>}

          <Text style={[st.label, { color: t.textMuted }]}>NEW DATE</Text>
          {/* flexGrow/flexShrink 0: a horizontal ScrollView in a column parent
              otherwise stretches and clips the rows under it. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0, marginBottom: 14 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {DATES.map(d => {
              const on = date === d.iso
              return (
                <TouchableOpacity
                  key={d.iso}
                  onPress={() => { haptics.tap(); setDate(d.iso) }}
                  style={[st.chip, {
                    backgroundColor: on ? t.accentBg : t.inputBg,
                    borderColor: on ? t.accentBorder : t.cardBorder,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: on ? t.accent : t.textPrimary }}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <Text style={[st.label, { color: t.textMuted }]}>NEW TIME</Text>
          <View style={st.timeGrid}>
            {TIMES.map(x => {
              const on = time === x.value
              return (
                <TouchableOpacity
                  key={x.value}
                  onPress={() => { haptics.tap(); setTime(x.value) }}
                  style={[st.timeChip, {
                    backgroundColor: on ? t.accentBg : t.inputBg,
                    borderColor: on ? t.accentBorder : t.cardBorder,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: on ? t.accent : t.textPrimary }}>
                    {x.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[st.label, { color: t.textMuted, marginTop: 14 }]}>REASON (OPTIONAL)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Tell the patient why"
            placeholderTextColor={t.textMuted}
            style={[st.input, { backgroundColor: t.inputBg, borderColor: t.cardBorder, color: t.textPrimary }]}
          />

          {!!error && <Text style={[st.error, { color: t.danger }]}>{error}</Text>}

          <View style={{ gap: 10, marginTop: 18 }}>
            <PrimaryButton
              label={submitting ? 'Rescheduling…' : 'Confirm new time'}
              onPress={handleConfirm}
              loading={submitting}
              disabled={submitting || !time}
            />
            <PrimaryButton label="Cancel" variant="ghost" onPress={onClose} disabled={submitting} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, maxHeight: '88%' },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 10, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  error: { fontSize: 13, marginTop: 12 },
})
