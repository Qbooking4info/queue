// Direct (hospital-less) bookings only -- hospital-referred/assigned patients
// already show up in "Today's Queue" for whichever hospital is currently
// active. A direct booking has no hospital at all, so it needs its own home
// regardless of which hospital (if any) is active.
import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtDate, fmt12 } from '@queue/shared/lib/format'
import { reviewDirectAppointment } from '@queue/shared/lib/api'

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

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Awaiting your review', color: '#EF9F27', bg: 'rgba(239,159,39,0.12)' },
  confirmed:   { label: 'Confirmed',            color: '#00C265', bg: 'rgba(0,194,101,0.12)' },
  in_progress: { label: 'In progress',          color: '#FF8C42', bg: 'rgba(255,140,66,0.14)' },
  completed:   { label: 'Completed',            color: '#7A9089', bg: 'rgba(122,144,137,0.12)' },
  cancelled:   { label: 'Cancelled',             color: '#FF5C5C', bg: 'rgba(255,92,92,0.1)' },
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

  const filtered = appts.filter(a => {
    if (tab === 'pending') return a.status === 'pending'
    if (tab === 'upcoming') return ['confirmed', 'in_progress'].includes(a.status)
    return ['completed', 'cancelled'].includes(a.status)
  })

  return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.5 }}>Appointments</Text>
          <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Direct bookings from patients — virtual consults and home visits.</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 12 }}>
          {(['pending', 'upcoming', 'past'] as FilterTab[]).map(item => (
            <TouchableOpacity key={item} onPress={() => setTab(item)}
              style={{
                paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99,
                backgroundColor: tab === item ? t.accentBg : t.cardBg,
                borderWidth: 1, borderColor: tab === item ? t.accentBorder : t.cardBorder,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: tab === item ? t.accent : t.textMuted, textTransform: 'capitalize' }}>
                {item}{item === 'pending' && appts.some(a => a.status === 'pending') ? ` (${appts.filter(a => a.status === 'pending').length})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <Ionicons name="calendar-outline" size={44} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.textPrimary, textAlign: 'center' }}>No {tab} appointments</Text>
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
              />
            ))}
          </ScrollView>
        )}
      </View>
  )
}

function ApptCard({ appt, theme: t, busy, onApprove, onReject, onStart, onComplete, onCancel, onJoinCall }: {
  appt: DirectAppt; theme: any; busy: boolean
  onApprove: () => void; onReject: (reason: string) => void; onStart: () => void
  onComplete: () => void; onCancel: (reason: string) => void; onJoinCall: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
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
          {appt.status === 'confirmed' && appt.type === 'home_visit' && (
            <ActionBtn label="Start Visit" theme={t} primary disabled={busy} onPress={onStart} />
          )}
          {appt.status === 'confirmed' && (
            <ActionBtn label="Cancel" theme={t} muted disabled={busy} onPress={() => onCancel('Cancelled by doctor')} />
          )}
          {appt.status === 'in_progress' && appt.type === 'home_visit' && (
            <ActionBtn label="Mark Completed" theme={t} primary disabled={busy} onPress={onComplete} />
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
