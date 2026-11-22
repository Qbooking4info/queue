import { useState, useEffect, useCallback } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { supabase } from '../lib/supabase'
import { getQueuePositionBounds } from '../lib/api'
import { formatWait, formatQueueStanding, formatAsOf, isWaitStale } from '../lib/waitTime'
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
  const [ahead, setAhead] = useState<number | null>(null)
  const [queueTotal, setQueueTotal] = useState<number | null>(null)
  const [emergenciesAhead, setEmergenciesAhead] = useState<number | null>(null)
  const [asOf, setAsOf] = useState<string | null>(null)
  // Bumped on every tick so the staleness notice appears even when the poll
  // itself is what stopped working -- that is precisely the case where the
  // patient must not keep reading a frozen number as live.
  const [now, setNow] = useState(() => Date.now())
  const [vitals, setVitals] = useState<VitalsRow | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const refresh = useCallback(async () => {
    const bounds = await getQueuePositionBounds(appointment.id)
    if (bounds.ok) {
      setPosition(bounds.currentPosition)
      setEstimatedWait(bounds.estimatedWait)
      setStatus(bounds.status)
      setAhead(bounds.aheadOfYou)
      setQueueTotal(bounds.queueTotal)
      setEmergenciesAhead(bounds.emergenciesAhead)
      setAsOf(bounds.asOf)
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
    const interval = setInterval(() => { setNow(Date.now()); refresh() }, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  const isInProgress = status === 'in_progress'
  const stale = isWaitStale(asOf, now)
  const waitText = formatWait(estimatedWait)

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
        // Who is in front of you and roughly how long, rather than a bare rank
        // and a minute count. The rank is still shown, smaller, because staff
        // ask for it by number -- but it is no longer the headline, and an
        // emergency that pushes the patient back is now named instead of
        // appearing as an unexplained jump.
        <View style={st.queueBlock}>
          <Text style={[st.standing, { color: t.accent }]}>
            {formatQueueStanding(ahead, emergenciesAhead)}
          </Text>
          <Text style={[st.waitText, { color: t.textPrimary }]}>
            {waitText ?? 'Wait time not available yet'}
          </Text>
          <Text style={[st.statLabel, { color: t.textMuted }]}>
            {stale
              ? 'Not updating — check your connection'
              : [position != null ? `Position ${position}${queueTotal != null ? ` of ${queueTotal}` : ''}` : null,
                 formatAsOf(asOf)].filter(Boolean).join(' · ')}
          </Text>
          <Text style={[st.hedge, { color: t.textMuted }]}>
            Indicative — you may not be called in exactly this order.
          </Text>
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
  queueBlock:  { marginTop: 14, gap: 2 },
  standing:    { fontSize: 18, fontWeight: '800' },
  waitText:    { fontSize: 14, fontWeight: '700' },
  statLabel:   { fontSize: 11, marginTop: 2 },
  hedge:       { fontSize: 10, marginTop: 4, fontStyle: 'italic' },
  vitalsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  vitalChip:   { fontSize: 11, fontWeight: '600' },
  changeBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 10, marginTop: 14 },
  changeBtnText: { fontSize: 12, fontWeight: '700' },
})
