import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { supabase } from '../lib/supabase'
import { getQueuePositionBounds } from '../lib/api'
import { QueuePositionPicker } from './QueuePositionPicker'
import type { AppointmentWithRelations } from '../lib/api'

interface VitalsRow {
  weight_kg:    number | null
  height_cm:    number | null
  bp_systolic:  number | null
  bp_diastolic: number | null
  blood_sugar:  number | null
}

interface Props {
  appointment: AppointmentWithRelations
  onOpenDetail: () => void
}

// Replaces the home screen's "book an appointment" banner once the patient is
// actually checked in -- shows live queue position, vitals for this visit, and
// a way to voluntarily step back in line (never jump ahead). The "ring" alert
// (doctor/front-desk calls the patient in) is handled by HomeScreen itself via
// useRingAlert/RingOverlay, not here -- it needs to render as a true full-screen
// overlay at the screen root, which a component nested this deep can't do with
// a plain positioned View (see RingOverlay.tsx's own comment for why not Modal).
export function LiveQueueCard({ appointment, onOpenDetail }: Props) {
  const { theme: t } = useTheme()
  const [status, setStatus] = useState(appointment.status)
  const [position, setPosition] = useState<number | null>(appointment.queue_position ?? null)
  const [estimatedWait, setEstimatedWait] = useState<number | null>(appointment.estimated_wait ?? null)
  const [vitals, setVitals] = useState<VitalsRow | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const refresh = useCallback(async () => {
    const bounds = await getQueuePositionBounds(appointment.id)
    if (bounds.ok) {
      setPosition(bounds.currentPosition)
      setEstimatedWait(bounds.estimatedWait)
      setStatus(bounds.status)
    }
    const { data } = await supabase
      .from('vitals_audit_log')
      .select('weight_kg, height_cm, bp_systolic, bp_diastolic, blood_sugar')
      .eq('appointment_id', appointment.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setVitals((data as VitalsRow | null) ?? null)
  }, [appointment.id])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  const isInProgress = status === 'in_progress'

  return (
    <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <View style={st.header}>
        <Text style={[st.label, { color: t.accent }]}>
          {isInProgress ? "YOU'RE BEING SEEN" : "YOU'RE IN THE QUEUE"}
        </Text>
        <TouchableOpacity onPress={() => { haptics.tap(); onOpenDetail() }}>
          <Text style={[st.detailLink, { color: t.textMuted }]}>Details</Text>
        </TouchableOpacity>
      </View>

      <Text style={[st.doctorName, { color: t.textPrimary }]}>
        {appointment.doctor?.full_name ? `Dr. ${appointment.doctor.full_name}` : 'Doctor'}
      </Text>
      <Text style={[st.hospitalName, { color: t.textMuted }]}>{appointment.hospital?.name ?? ''}</Text>

      {isInProgress ? (
        <View style={[st.inProgressBox, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
          <Ionicons name="medical" size={16} color={t.accent} />
          <Text style={[st.inProgressText, { color: t.accent }]}>The doctor is seeing you now</Text>
        </View>
      ) : (
        <View style={st.statsRow}>
          <View style={st.statBox}>
            <Text style={[st.statNum, { color: t.accent }]}>{position ?? '—'}</Text>
            <Text style={[st.statLabel, { color: t.textMuted }]}>Position</Text>
          </View>
          <View style={[st.statDivider, { backgroundColor: t.cardBorder }]} />
          <View style={st.statBox}>
            <Text style={[st.statNum, { color: t.textPrimary }]}>{estimatedWait != null ? `~${estimatedWait}m` : '—'}</Text>
            <Text style={[st.statLabel, { color: t.textMuted }]}>Est. wait</Text>
          </View>
        </View>
      )}

      {vitals && (vitals.weight_kg != null || vitals.height_cm != null || vitals.bp_systolic != null || vitals.blood_sugar != null) && (
        <View style={[st.vitalsRow, { borderTopColor: t.cardBorder }]}>
          {vitals.weight_kg != null && <Text style={[st.vitalChip, { color: t.textMuted }]}>{vitals.weight_kg}kg</Text>}
          {vitals.height_cm != null && <Text style={[st.vitalChip, { color: t.textMuted }]}>{vitals.height_cm}cm</Text>}
          {(vitals.bp_systolic != null && vitals.bp_diastolic != null) &&
            <Text style={[st.vitalChip, { color: t.textMuted }]}>{vitals.bp_systolic}/{vitals.bp_diastolic}</Text>}
          {vitals.blood_sugar != null && <Text style={[st.vitalChip, { color: t.textMuted }]}>{vitals.blood_sugar}mg/dL</Text>}
        </View>
      )}

      {status === 'checked_in' && (
        <TouchableOpacity onPress={() => { haptics.tap(); setShowPicker(true) }} style={[st.changeBtn, { borderColor: t.cardBorder }]}>
          <Ionicons name="swap-vertical-outline" size={14} color={t.textMuted} />
          <Text style={[st.changeBtnText, { color: t.textMuted }]}>Change my position</Text>
        </TouchableOpacity>
      )}

      {showPicker && (
        <QueuePositionPicker
          appointmentId={appointment.id}
          onClose={() => setShowPicker(false)}
          onMoved={(newPosition) => { setPosition(newPosition); setShowPicker(false) }}
        />
      )}
    </View>
  )
}

const st = StyleSheet.create({
  card:        { borderRadius: 20, padding: 16, marginBottom: 18, borderWidth: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label:       { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  detailLink:  { fontSize: 11, fontWeight: '700' },
  doctorName:  { fontSize: 16, fontWeight: '800' },
  hospitalName:{ fontSize: 12, marginTop: 1 },
  inProgressBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12 },
  inProgressText: { fontSize: 13, fontWeight: '700' },
  statsRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  statBox:     { flex: 1, alignItems: 'center' },
  statNum:     { fontSize: 24, fontWeight: '800' },
  statLabel:   { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 32 },
  vitalsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  vitalChip:   { fontSize: 11, fontWeight: '600' },
  changeBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 10, marginTop: 14 },
  changeBtnText: { fontSize: 12, fontWeight: '700' },
})
