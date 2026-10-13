import { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { fmtDate, fmtLocalDate, todayLocalDate } from '../lib/format'
import { CalendarPicker } from './CalendarPicker'

const MAX_DAYS_OUT = 180

interface Props {
  patientName?: string
  onClose: () => void
  onConfirm: (date: string) => Promise<string | null>
}

/**
 * "Book Follow-up" from the consult screen -- the doctor picks only a date;
 * the server finds an open slot for that day if one exists, or books the day
 * anyway if not (see POST /api/appointments/[id]/follow-up). No time picker
 * here on purpose -- that's the whole point of this being simpler than the
 * regular booking flow.
 */
export function FollowUpModal({ patientName, onClose, onConfirm }: Props) {
  const { theme: t } = useTheme()
  const [date, setDate] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bookedDate, setBookedDate] = useState<string | null>(null)

  const maxDate = fmtLocalDate(new Date(Date.now() + MAX_DAYS_OUT * 24 * 3600 * 1000))

  async function handleConfirm() {
    if (!date) return
    setSubmitting(true)
    setError('')
    const err = await onConfirm(date)
    setSubmitting(false)
    if (err) { haptics.error(); setError(err); return }
    haptics.success()
    setBookedDate(date)
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {bookedDate ? (
            <>
              <View style={[st.successIcon, { backgroundColor: t.accentBg }]}>
                <Text style={{ fontSize: 22 }}>✓</Text>
              </View>
              <Text style={[st.title, { color: t.textPrimary, textAlign: 'center' }]}>Follow-up booked</Text>
              <Text style={[st.sub, { color: t.textMuted, textAlign: 'center', marginBottom: 20 }]}>
                {patientName ?? 'The patient'} is booked in for {fmtDate(bookedDate)}.
              </Text>
              <TouchableOpacity onPress={onClose} style={[st.confirmBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
                <Text style={{ color: t.accent, fontWeight: '800', fontSize: 14 }}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[st.title, { color: t.textPrimary }]}>Book Follow-up</Text>
              {patientName && <Text style={[st.sub, { color: t.textMuted }]}>{patientName} · same clinic, same doctor</Text>}

              <View style={{ marginTop: 14, marginBottom: 6 }}>
                <CalendarPicker value={date} onChange={setDate} minDate={todayLocalDate()} maxDate={maxDate} theme={t} />
              </View>

              {error ? <Text style={{ fontSize: 12, color: t.danger, marginTop: 6 }}>{error}</Text> : null}

              <View style={st.confirmRow}>
                <TouchableOpacity onPress={onClose} disabled={submitting}
                  style={[st.confirmBtn, { borderColor: t.cardBorder }]}>
                  <Text style={{ color: t.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirm} disabled={submitting || !date}
                  style={[st.confirmBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg, opacity: !date ? 0.5 : 1 }]}>
                  {submitting ? <ActivityIndicator size="small" color={t.accent} />
                    : <Text style={{ color: t.accent, fontWeight: '800', fontSize: 14 }}>Book Follow-up</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card:        { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 20 },
  title:       { fontSize: 17, fontWeight: '800' },
  sub:         { fontSize: 13, marginTop: 4 },
  successIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  confirmRow:  { flexDirection: 'row', gap: 10, marginTop: 16 },
  confirmBtn:  { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
})
