// Direct (hospital-less) bookings only -- hospital-referred/assigned patients
// already show up in "Today's Queue" for whichever hospital is currently
// active. A direct booking has no hospital at all, so it needs its own home
// regardless of which hospital (if any) is active.
import { useCallback, useState } from 'react'
import { View, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, RefreshControl } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtDate, fmt12 } from '@queue/shared/lib/format'
import { reviewDirectAppointment } from '@queue/shared/lib/api'
import { Header, SegmentedControl, EmptyState } from '@queue/shared/components/ui/v3'
import { statusBadgeColors } from '@queue/shared/lib/statusColors'
import { addToGoogleCalendar } from '@queue/shared/lib/calendar'

interface Props { navigation: any }

interface DirectAppt {
  id: string
  patient_id: string
  appointment_date: string
  start_time: string
  type: string
  status: string
  approval_status: string | null
  reason: string | null
  home_visit_address: string | null
  patient: { full_name: string; phone: string | null } | null
}

type FilterTab = 'pending' | 'upcoming' | 'past'

export function DoctorAppointmentsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth()
  const [tab, setTab] = useState<FilterTab>('pending')
  const [appts, setAppts] = useState<DirectAppt[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('id, patient_id, appointment_date, start_time, type, status, approval_status, reason, home_visit_address, patient:users!appointments_patient_id_fkey(full_name, phone)')
      .eq('doctor_user_id', user.id)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })
    setAppts((data as any[]) ?? [])
    setLoading(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function act(id: string, action: Parameters<typeof reviewDirectAppointment>[1], reason?: string) {
    setBusyId(id)
    const err = await reviewDirectAppointment(id, action)
    setBusyId(null)
    if (err) { haptics.error(); return }
    haptics.success()
    load()
  }

  const filtered = appts.filter(a => {
    if (tab === 'pending') return a.status === 'pending'
    if (tab === 'upcoming') return ['confirmed', 'in_progress'].includes(a.status)
    return ['completed', 'cancelled'].includes(a.status)
  })

  const pendingCount = appts.filter(a => a.status === 'pending').length

  return (
      <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <Header title="Appointments" subtitle="Direct virtual consults and home visits">
          <SegmentedControl<FilterTab> onDark value={tab} onChange={setTab}
            options={[
              { value: 'pending', label: `Pending${pendingCount ? ` (${pendingCount})` : ''}` },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
            ]} />
        </Header>
        <View style={{ height: 14 }} />

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="calendar-outline" title={`No ${tab} appointments`}
            body={tab === 'pending' ? 'New patient requests show up here for you to approve.' : undefined} />
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.accent}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}>
            {filtered.map(a => (
              <ApptCard key={a.id} appt={a} theme={t} busy={busyId === a.id}
                onApprove={() => act(a.id, { action: 'approve' })}
                onReject={reason => act(a.id, { action: 'reject', reason })}
                onStart={() => act(a.id, { action: 'start' })}
                onComplete={() => act(a.id, { action: 'complete' })}
                onCancel={reason => act(a.id, { action: 'cancel', reason })}
                onJoinCall={() => navigation.navigate('DoctorVideoCall', { appointmentId: a.id, patientName: a.patient?.full_name ?? 'Patient' })}
                onCarePlan={() => navigation.navigate('CarePlanCompose', { patientId: a.patient_id, patientName: a.patient?.full_name })}
              />
            ))}
          </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
  )
}

function ApptCard({ appt, theme: t, busy, onApprove, onReject, onStart, onComplete, onCancel, onJoinCall, onCarePlan }: {
  appt: DirectAppt; theme: any; busy: boolean
  onApprove: () => void; onReject: (reason: string) => void; onStart: () => void
  onComplete: () => void; onCancel: (reason: string) => void; onJoinCall: () => void
  onCarePlan: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const sc = statusBadgeColors(t)
  const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    pending:     { label: 'Awaiting your review', color: sc.pending.text,     bg: sc.pending.bg },
    confirmed:   { label: 'Confirmed',            color: sc.confirmed.text,   bg: sc.confirmed.bg },
    in_progress: { label: 'In progress',          color: sc.in_progress.text, bg: sc.in_progress.bg },
    completed:   { label: 'Completed',            color: sc.completed.text,   bg: sc.completed.bg },
    cancelled:   { label: 'Cancelled',            color: sc.cancelled.text,   bg: sc.cancelled.bg },
  }
  const meta = STATUS_META[appt.status] ?? STATUS_META.pending

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 16, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.textPrimary }}>{appt.patient?.full_name ?? 'Patient'}</Text>
          <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {fmtDate(appt.appointment_date)} · {fmt12(appt.start_time)} · {appt.type === 'virtual' ? 'Virtual consult' : 'Home visit'}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: meta.bg }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: meta.color }}>{meta.label}</Text>
        </View>
      </View>

      {appt.reason && <Text style={{ fontSize: 12, color: t.textSecondary, marginBottom: 6 }}>{appt.reason}</Text>}
      {['confirmed', 'in_progress'].includes(appt.status) && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add to Google Calendar"
          onPress={() => addToGoogleCalendar({
            title: `${appt.type === 'virtual' ? 'Video consult' : 'Home visit'}: ${appt.patient?.full_name ?? 'Patient'}`,
            date: appt.appointment_date, time: appt.start_time,
            location: appt.type === 'home_visit' ? (appt.home_visit_address ?? undefined) : 'Queue Doctor (video)',
            details: appt.reason ?? undefined,
          }).catch(() => {})}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 10, borderRadius: 99, backgroundColor: t.accentBg, marginBottom: 8 }}>
          <Ionicons name="calendar-outline" size={14} color={t.accent} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>Add to Google Calendar</Text>
        </TouchableOpacity>
      )}
      {appt.type === 'home_visit' && appt.home_visit_address && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
          <Ionicons name="location-outline" size={13} color={t.textMuted} style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 12, color: t.textSecondary, flex: 1 }}>{appt.home_visit_address}</Text>
        </View>
      )}
      {appt.patient?.phone && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Ionicons name="call-outline" size={13} color={t.textMuted} />
          <Text style={{ fontSize: 12, color: t.textSecondary }}>{appt.patient.phone}</Text>
        </View>
      )}

      {showReject ? (
        <View>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reason for declining…" placeholderTextColor={t.textMuted}
            style={{ borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, borderRadius: 10, padding: 10, fontSize: 12, color: t.textPrimary, marginBottom: 8 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionBtn label="Cancel" theme={t} onPress={() => setShowReject(false)} muted />
            <ActionBtn label="Confirm Decline" theme={t} danger disabled={!reason.trim() || busy}
              onPress={() => { onReject(reason.trim()); setShowReject(false) }} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {appt.status === 'pending' && (
            <>
              <ActionBtn label="Approve" theme={t} primary disabled={busy} onPress={onApprove} />
              <ActionBtn label="Decline" theme={t} danger disabled={busy} onPress={() => setShowReject(true)} />
            </>
          )}
          {appt.status === 'confirmed' && appt.type === 'virtual' && (
            <ActionBtn label="Join Call" theme={t} primary disabled={busy} onPress={onJoinCall} />
          )}
          {/* A call already in progress (started here or from another device/tab,
              or left stuck after a disconnect) has no other way back in -- without
              this, an interrupted call could never be resumed or properly ended. */}
          {appt.status === 'in_progress' && appt.type === 'virtual' && (
            <ActionBtn label="Rejoin Call" theme={t} primary disabled={busy} onPress={onJoinCall} />
          )}
          {appt.status === 'confirmed' && appt.type === 'home_visit' && (
            <ActionBtn label="Start Visit" theme={t} primary disabled={busy} onPress={onStart} />
          )}
          {appt.status === 'confirmed' && (
            <ActionBtn label="Cancel" theme={t} muted disabled={busy} onPress={() => onCancel('Cancelled by doctor')} />
          )}
          {appt.status === 'in_progress' && appt.type === 'home_visit' && (
            <ActionBtn label="Mark Completed" theme={t} primary disabled={busy} onPress={onComplete} />
          )}
          {/* The independent half of "a doctor seeing a patient". Offered once
              the visit is under way or done -- there is nothing to plan for a
              booking that has not happened yet. */}
          {(appt.status === 'in_progress' || appt.status === 'completed') && (
            <ActionBtn label="Care plan" theme={t} disabled={busy} onPress={onCarePlan} />
          )}
        </View>
      )}
    </View>
  )
}

function ActionBtn({ label, theme: t, onPress, primary, danger, muted, disabled }: {
  label: string; theme: any; onPress: () => void; primary?: boolean; danger?: boolean; muted?: boolean; disabled?: boolean
}) {
  const bg = primary ? t.accent : danger ? t.dangerSubtle : t.inputBg
  const border = primary ? t.accent : danger ? t.dangerBorder : t.cardBorder
  const color = primary ? (t.id === 'forest' ? '#061208' : '#fff') : danger ? t.danger : t.textSecondary
  return (
    <TouchableOpacity disabled={disabled} onPress={() => { haptics.tap(); onPress() }}
      style={{ flex: 1, minWidth: 100, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: bg, borderWidth: 1, borderColor: border, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color }}>{label}</Text>
    </TouchableOpacity>
  )
}
