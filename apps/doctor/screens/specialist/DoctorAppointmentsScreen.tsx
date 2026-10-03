// Direct (hospital-less) bookings only -- hospital-referred/assigned patients
// already show up in "Today's Queue" for whichever hospital is currently
// active. A direct booking has no hospital at all, so it needs its own home
// regardless of which hospital (if any) is active.
import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtDate, fmt12 } from '@queue/shared/lib/format'
import { reviewDirectAppointment } from '@queue/shared/lib/api'
import { RescheduleModal } from '@queue/shared/components/RescheduleModal'
import { Segmented, Pill } from '@queue/shared/components/ui/DataViz'
import { Glass } from '@queue/shared/components/ui/Glass'
import { Avatar } from '@queue/shared/components/ui/Avatar'
import { bgFromName } from '@queue/shared/lib/adapters'

interface Props { navigation: any }

interface DirectAppt {
  id: string
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

const TABS: FilterTab[] = ['pending', 'upcoming', 'past']

function initialsOf(name: string): string {
  return (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
}

export function DoctorAppointmentsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth()
  const [tab, setTab] = useState<FilterTab>('pending')
  const [appts, setAppts] = useState<DirectAppt[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_date, start_time, type, status, approval_status, reason, home_visit_address, patient:users!appointments_patient_id_fkey(full_name, phone)')
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

  const [rescheduleId, setRescheduleId] = useState<string | null>(null)

  const pendingCount = appts.filter(a => a.status === 'pending').length

  const filtered = appts.filter(a => {
    if (tab === 'pending') return a.status === 'pending'
    if (tab === 'upcoming') return ['confirmed', 'in_progress'].includes(a.status)
    return ['completed', 'cancelled'].includes(a.status)
  })

  return (
      // SafeAreaView with an opaque canvas, matching Queue and Profile. The tab
      // navigator sets sceneStyle backgroundColor 'transparent' (App.tsx), so a screen
      // that paints nothing lets the previously-visited screen show through it --
      // which is exactly how this one read: transparent and overlapping.
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 25, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.5 }}>Appointments</Text>
          <Text style={{ fontSize: 14, color: t.textMuted, marginTop: 2 }}>Direct bookings from patients — virtual consults and home visits.</Text>
        </View>

        {/* Pending keeps its count in the label: it is the one tab representing work
            waiting on the doctor, so the number belongs where they will see it. */}
        <Segmented
          options={TABS.map(item =>
            item === 'pending' && pendingCount > 0 ? `Pending (${pendingCount})` : item[0].toUpperCase() + item.slice(1))}
          value={TABS.indexOf(tab)}
          onChange={i => setTab(TABS[i])}
          style={{ marginHorizontal: 20, marginBottom: 12 }}
        />

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <Ionicons name="calendar-outline" size={44} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary, textAlign: 'center' }}>No {tab} appointments</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {filtered.map(a => (
              <ApptCard key={a.id} appt={a} theme={t} busy={busyId === a.id}
                onApprove={() => act(a.id, { action: 'approve' })}
                onReject={reason => act(a.id, { action: 'reject', reason })}
                onStart={() => act(a.id, { action: 'start' })}
                onComplete={() => act(a.id, { action: 'complete' })}
                onCancel={reason => act(a.id, { action: 'cancel', reason })}
                onJoinCall={() => navigation.navigate('DoctorVideoCall', { appointmentId: a.id, patientName: a.patient?.full_name ?? 'Patient' })}
                onReschedule={() => setRescheduleId(a.id)}
                onViewSummary={() => navigation.navigate('ConsultationPlan', { appointmentId: a.id, patientName: a.patient?.full_name ?? 'Patient' })}
              />
            ))}
          </ScrollView>
        )}

        {rescheduleId && (
          <RescheduleModal
            patientName={appts.find(a => a.id === rescheduleId)?.patient?.full_name}
            onClose={() => setRescheduleId(null)}
            onConfirm={async payload => {
              const err = await reviewDirectAppointment(rescheduleId, { action: 'reschedule', ...payload })
              if (!err) { setRescheduleId(null); load() }
              return err
            }}
          />
        )}
      </SafeAreaView>
  )
}

function ApptCard({ appt, theme: t, busy, onApprove, onReject, onStart, onComplete, onCancel, onJoinCall, onReschedule, onViewSummary }: {
  appt: DirectAppt; theme: any; busy: boolean
  onApprove: () => void; onReject: (reason: string) => void; onStart: () => void
  onComplete: () => void; onCancel: (reason: string) => void; onJoinCall: () => void
  onReschedule: () => void; onViewSummary: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const { chipElevation } = useTheme()
  // Tones rather than raw colours now, so the pill matches every other status pill in
  // the app instead of carrying its own palette. Dots only on live states -- a settled
  // Completed or Cancelled has nothing to signal.
  type Tone = 'statusOpen' | 'statusBusy' | 'statusVirtual' | 'statusCancelled' | 'statusProgress' | 'statusNeutral'
  const STATUS_META: Record<string, { label: string; tone: Tone; dot?: boolean }> = {
    pending:     { label: 'Awaiting review', tone: 'statusBusy',      dot: true },
    confirmed:   { label: 'Confirmed',       tone: 'statusOpen',      dot: true },
    in_progress: { label: 'In progress',     tone: 'statusProgress',  dot: true },
    completed:   { label: 'Completed',       tone: 'statusNeutral' },
    cancelled:   { label: 'Cancelled',       tone: 'statusCancelled' },
  }
  const meta = STATUS_META[appt.status] ?? STATUS_META.pending

  return (
    <Glass radius={20} pad={16} style={{ marginHorizontal: 20, marginBottom: 12 }}>
      {/* Identity row: who, what kind of visit, and where it stands. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar
          initials={initialsOf(appt.patient?.full_name ?? 'Patient')}
          bg={bgFromName(appt.patient?.full_name ?? 'Patient')}
          size={44}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }} numberOfLines={1}>
            {appt.patient?.full_name ?? 'Patient'}
          </Text>
          <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 1 }}>
            {appt.type === 'virtual' ? 'Virtual consult' : 'Home visit'}
          </Text>
        </View>
        <Pill label={meta.label} tone={meta.tone} dot={meta.dot} />
      </View>

      {/* When, in a raised chip so the date and time are the one thing that reads at
          a glance down a long list. */}
      <View style={[{
        flexDirection: 'row', gap: 14, marginTop: 12,
        paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14,
        backgroundColor: t.chip, borderWidth: 1, borderColor: t.chipBorder,
      }, chipElevation]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar-outline" size={14} color={t.accent} />
          <Text style={{ fontSize: 12, color: t.textSecondary }}>{fmtDate(appt.appointment_date)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="time-outline" size={14} color={t.accent} />
          <Text style={{ fontSize: 12, color: t.textSecondary }}>{fmt12(appt.start_time)}</Text>
        </View>
      </View>

      {/* Detail lines share one gap instead of the 6/6/10 mix they had, which made
          the block read as unaligned. */}
      {(!!appt.reason || (appt.type === 'home_visit' && !!appt.home_visit_address) || !!appt.patient?.phone) && (
        <View style={{ gap: 6, marginTop: 12 }}>
          {!!appt.reason && (
            <Text style={{ fontSize: 13.5, color: t.textSecondary }}>{appt.reason}</Text>
          )}
          {appt.type === 'home_visit' && !!appt.home_visit_address && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Ionicons name="location-outline" size={13} color={t.textSecondary} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 13.5, color: t.textSecondary, flex: 1 }}>{appt.home_visit_address}</Text>
            </View>
          )}
          {!!appt.patient?.phone && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="call-outline" size={13} color={t.textSecondary} />
              <Text style={{ fontSize: 13.5, color: t.textSecondary }}>{appt.patient.phone}</Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: 12 }} />

      {showReject ? (
        <View>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reason for declining…" placeholderTextColor={t.textMuted}
            style={{ borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, borderRadius: 10, padding: 10, fontSize: 14, color: t.textPrimary, marginBottom: 8 }} />
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
          {/* Reschedule is pre-check-in only -- pending/confirmed bookings can
              still move; once a visit has started there's nothing left to move. */}
          {['pending', 'confirmed'].includes(appt.status) && (
            <ActionBtn label="Reschedule" theme={t} muted disabled={busy} onPress={onReschedule} />
          )}
          {/* The one place a doctor writes diagnosis/investigations/treatment
              for a virtual visit and the patient gets to see it. */}
          {appt.status === 'completed' && appt.type === 'virtual' && (
            <ActionBtn label="Consultation Plan" theme={t} muted disabled={busy} onPress={onViewSummary} />
          )}
        </View>
      )}
    </Glass>
  )
}

function ActionBtn({ label, theme: t, onPress, primary, danger, muted, disabled }: {
  label: string; theme: any; onPress: () => void; primary?: boolean; danger?: boolean; muted?: boolean; disabled?: boolean
}) {
  const bg = primary ? t.accent : danger ? t.dangerSubtle : t.inputBg
  const border = primary ? t.accent : danger ? t.dangerBorder : t.cardBorder
  const color = primary ? t.onAccent : danger ? t.danger : t.textSecondary
  return (
    <TouchableOpacity disabled={disabled} onPress={() => { haptics.tap(); onPress() }}
      style={{ flex: 1, minWidth: 100, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: bg, borderWidth: 1, borderColor: border, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color }}>{label}</Text>
    </TouchableOpacity>
  )
}
