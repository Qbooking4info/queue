import { useState, useEffect, useCallback } from 'react'
import { ValueChip } from './ui/ValueChip'
import { Hero, HeroChip } from './ui/Glass'
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
    // Being in the queue right now is the most live thing on the home screen, so
    // it takes the gradient hero -- teal or blue depending on the family -- rather
    // than another quiet white panel. The raised white ValueChips read especially
    // well against it, which is the point: the numbers stay the loudest element.
    <Hero style={st.card} radius={20} pad={16}>
      <View style={st.header}>
        <Text style={[st.label, { color: t.onHero, opacity: 0.85 }]}>
          {isInProgress ? "YOU'RE BEING SEEN" : "YOU'RE IN THE QUEUE"}
        </Text>
        <TouchableOpacity onPress={() => { haptics.tap(); onOpenDetail() }}>
          <Text style={[st.detailLink, { color: t.onHero, opacity: 0.85 }]}>Details</Text>
        </TouchableOpacity>
      </View>

      <Text style={[st.doctorName, { color: t.onHero }]}>
        {appointment.doctor?.full_name ? `Dr. ${appointment.doctor.full_name}` : 'Doctor'}
      </Text>
      <Text style={[st.hospitalName, { color: t.onHero, opacity: 0.8 }]}>{appointment.hospital?.name ?? ''}</Text>

      {isInProgress ? (
        <HeroChip style={st.inProgressBox}>
          <Ionicons name="medical" size={16} color={t.onHero} />
          <Text style={[st.inProgressText, { color: t.onHero }]}>The doctor is seeing you now</Text>
        </HeroChip>
      ) : (
        // Both figures are server-computed and real (queue_position and the
        // historically-derived estimated_wait), so they earn the raised chip
        // treatment -- the number is the whole point of this card.
        <View style={st.statsRow}>
          <View style={st.statBox}>
            <ValueChip value={position ?? '—'} unit="in line" />
          </View>
          <View style={st.statBox}>
            <ValueChip value={estimatedWait != null ? estimatedWait : '—'} unit="min wait" />
          </View>
        </View>
      )}

      {vitals && (vitals.weight_kg != null || vitals.height_cm != null || vitals.bp_systolic != null || vitals.blood_sugar != null) && (
        <View style={[st.vitalsRow, { borderTopColor: 'rgba(255,255,255,0.28)' }]}>
          {vitals.weight_kg != null && <Text style={[st.vitalChip, { color: t.onHero, opacity: 0.9 }]}>{vitals.weight_kg}kg</Text>}
          {vitals.height_cm != null && <Text style={[st.vitalChip, { color: t.onHero, opacity: 0.9 }]}>{vitals.height_cm}cm</Text>}
          {(vitals.bp_systolic != null && vitals.bp_diastolic != null) &&
            <Text style={[st.vitalChip, { color: t.onHero, opacity: 0.9 }]}>{vitals.bp_systolic}/{vitals.bp_diastolic}</Text>}
          {vitals.blood_sugar != null && <Text style={[st.vitalChip, { color: t.onHero, opacity: 0.9 }]}>{vitals.blood_sugar}mg/dL</Text>}
        </View>
      )}

      {status === 'checked_in' && (
        <TouchableOpacity
          onPress={() => { haptics.tap(); setShowPicker(true) }}
          style={[st.changeBtn, { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.14)' }]}>
          <Ionicons name="swap-vertical-outline" size={14} color={t.onHero} />
          <Text style={[st.changeBtnText, { color: t.onHero }]}>Change my position</Text>
        </TouchableOpacity>
      )}

      {showPicker && (
        <QueuePositionPicker
          appointmentId={appointment.id}
          onClose={() => setShowPicker(false)}
          onMoved={(newPosition) => { setPosition(newPosition); setShowPicker(false) }}
        />
      )}
    </Hero>
  )
}

const st = StyleSheet.create({
  card:        { marginBottom: 18 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label:       { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  detailLink:  { fontSize: 11, fontWeight: '700' },
  doctorName:  { fontSize: 16, fontWeight: '800' },
  hospitalName:{ fontSize: 12, marginTop: 1 },
  inProgressBox: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  inProgressText: { fontSize: 13, fontWeight: '700' },
  statsRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  statBox:     { flex: 1, alignItems: 'stretch' },
  vitalsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  vitalChip:   { fontSize: 11, fontWeight: '600' },
  changeBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 10, marginTop: 14 },
  changeBtnText: { fontSize: 12, fontWeight: '700' },
})
