// Direct (hospital-less) bookings only -- hospital-referred/assigned patients
// already show up in "My queue" for whichever hospital is currently active. A
// direct booking has no hospital at all, so it needs its own home regardless of
// which hospital (if any) is active.
import { useCallback, useState } from 'react'
import { View, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { fmtDate } from '@queue/shared/lib/format'
import { reviewDirectAppointment, getHospitalHours, type DayHours } from '@queue/shared/lib/api'
import { addToGoogleCalendar } from '@queue/shared/lib/calendar'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, Btn,
  CardActions, CardAction, Empty, Initials, Mono, Field, Pill, type PillTone,
} from '@queue/shared/components/q'

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
  // Stamped at booking by set_appointment_fee (20261122000001), never revised
  // afterwards -- so this is what was agreed, not the doctor's price today.
  consultation_fee: number | null
  patient: { full_name: string; phone: string | null } | null
}

type FilterTab = 'pending' | 'upcoming' | 'past'

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending:     { label: 'Awaiting your review', tone: 'amber' },
  confirmed:   { label: 'Confirmed',            tone: 'green' },
  in_progress: { label: 'In progress',          tone: 'teal' },
  completed:   { label: 'Completed',            tone: 'neutral' },
  cancelled:   { label: 'Cancelled',            tone: 'red' },
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

export function DoctorAppointmentsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile } = useAuth()
  const [tab, setTab] = useState<FilterTab>('pending')
  const [appts, setAppts] = useState<DirectAppt[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [hours, setHours] = useState<DayHours[] | null>(null)
  const [clinicCount, setClinicCount] = useState<number | null>(null)

  const load = useCallback(async () => {
    // No signed-in user means there is nothing to load and never will be;
    // returning without clearing `loading` leaves a spinner for ever.
    if (!user) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('id, patient_id, appointment_date, start_time, type, status, approval_status, reason, home_visit_address, consultation_fee, patient:users!appointments_patient_id_fkey(full_name, phone)')
      .eq('doctor_user_id', user.id)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })
    setAppts((data as any[]) ?? [])

    // The clinic line at the bottom: today's session at the active hospital,
    // which is where the rest of this doctor's day actually happens.
    if (doctorProfile) {
      const [h, c] = await Promise.all([
        getHospitalHours(doctorProfile.hospitalId).catch(() => null),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('doctor_id', doctorProfile.doctorId).eq('appointment_date', todayStr()).neq('status', 'cancelled'),
      ])
      setHours(h)
      setClinicCount(c.count ?? 0)
    }
    setLoading(false)
  }, [user, doctorProfile])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function act(id: string, action: Parameters<typeof reviewDirectAppointment>[1]) {
    setBusyId(id)
    const err = await reviewDirectAppointment(id, action)
    setBusyId(null)
    if (err) { haptics.error(); Alert.alert('That did not work', err); return }
    haptics.success()
    load()
  }

  const filtered = appts.filter(a => {
    if (tab === 'pending') return a.status === 'pending'
    if (tab === 'upcoming') return ['confirmed', 'in_progress'].includes(a.status)
    return ['completed', 'cancelled'].includes(a.status)
  })
  const pendingCount = appts.filter(a => a.status === 'pending').length

  // Upcoming is grouped by day, the way the handoff reads it: Today, Tomorrow,
  // then the date.
  const groups: { label: string; rows: DirectAppt[] }[] = []
  for (const a of filtered) {
    const label = tab === 'pending' ? 'Awaiting your review' : dayLabel(a.appointment_date)
    const g = groups.find(x => x.label === label)
    if (g) g.rows.push(a)
    else groups.push({ label, rows: [a] })
  }

  const today_ = hours?.find(h => h.day === new Date().getDay())

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar large title="Schedule" sub="Direct virtual consults and home visits" />

        <Seg<FilterTab>
          value={tab} onChange={setTab}
          options={[
            { key: 'pending', label: pendingCount ? `To review · ${pendingCount}` : 'To review' },
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'past', label: 'Past' },
          ]} />

        {loading ? (
          <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
        ) : (
          <Body refreshControl={
            <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />
          }>
            {filtered.length === 0 ? (
              <Card style={{ marginTop: 12 }}>
                <Empty
                  icon="calendar-outline"
                  title={tab === 'pending' ? 'Nothing to review' : tab === 'upcoming' ? 'Nothing booked' : 'Nothing past'}
                  body={tab === 'pending'
                    ? 'Patients who book you directly for a video call or a home visit land here for you to accept.'
                    : tab === 'upcoming'
                      ? 'Accepted direct bookings show up here. Your hospital queue is under Queue.'
                      : 'Completed and cancelled direct bookings stay here.'} />
              </Card>
            ) : groups.map(g => (
              <View key={g.label}>
                <SectionHead title={g.label} />
                {g.rows.map(a => (
                  <ApptCard key={a.id} appt={a} busy={busyId === a.id}
                    onAct={action => act(a.id, action)}
                    onJoinCall={() => navigation.navigate('DoctorVideoCall', { appointmentId: a.id, patientName: a.patient?.full_name ?? 'Patient' })}
                    onCarePlan={() => navigation.navigate('CarePlanCompose', { patientId: a.patient_id, patientName: a.patient?.full_name })} />
                ))}
              </View>
            ))}

            {/* The clinic session, so Schedule answers "what does my whole day
                look like" and not only "what did patients book me for". */}
            {doctorProfile && (
              <>
                <SectionHead title="At your hospital" />
                <Card>
                  <Row
                    icon="business-outline" iconTone="teal"
                    title={doctorProfile.linkedHospitals.find(h => h.hospitalId === doctorProfile.hospitalId)?.hospitalName ?? 'Your hospital'}
                    sub={[
                      today_ && !today_.closed ? `${today_.open.slice(0, 5)}–${today_.close.slice(0, 5)}` : 'Hours not set',
                      clinicCount != null ? `${clinicCount} booked today` : null,
                    ].filter(Boolean).join(' · ')}
                    chevron
                    onPress={() => navigation.navigate('Queue')} />
                </Card>
              </>
            )}
          </Body>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}

function dayLabel(date: string): string {
  const today = todayStr()
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  if (date === today) return 'Today'
  if (date === tomorrow) return 'Tomorrow'
  return fmtDate(date)
}

function ApptCard({ appt, busy, onAct, onJoinCall, onCarePlan }: {
  appt: DirectAppt
  busy: boolean
  onAct: (action: Parameters<typeof reviewDirectAppointment>[1]) => void
  onJoinCall: () => void
  onCarePlan: () => void
}) {
  const { theme: t } = useTheme()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const meta = STATUS[appt.status] ?? STATUS.pending
  const isVirtual = appt.type === 'virtual'
  const name = appt.patient?.full_name ?? 'Patient'

  return (
    <Card style={{ marginTop: 12 }}>
      <Row
        leading={<Initials name={name} size={40} />}
        title={name}
        sub={[
          isVirtual ? 'Video consult' : 'Home visit',
          dayLabel(appt.appointment_date),
          appt.start_time?.slice(0, 5),
        ].filter(Boolean).join(' · ')}
        right={appt.consultation_fee != null
          ? <Mono size={13} weight="700">₦{Number(appt.consultation_fee).toLocaleString('en-NG')}</Mono>
          : <Mono size={12} color={t.q.ink60}>{isVirtual ? 'video' : 'home'}</Mono>} />
      <Hair />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {!!appt.reason && <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink }}>{appt.reason}</Text>}
          {!isVirtual && !!appt.home_visit_address && (
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60, marginTop: appt.reason ? 4 : 0 }}>
              {appt.home_visit_address}
            </Text>
          )}
          {!!appt.patient?.phone && (
            <Text style={{ fontSize: 12.5, color: t.q.ink60, marginTop: 4 }}>{appt.patient.phone}</Text>
          )}
        </View>
        <Pill label={meta.label} tone={meta.tone} />
      </View>

      {appt.status === 'pending' && (
        showReject ? (
          <View style={{ padding: 14, gap: 10 }}>
            <Field label="Why are you declining?" value={reason} onChangeText={setReason}
              placeholder="The patient sees this" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn grow label="Keep it" variant="secondary" onPress={() => { setShowReject(false); setReason('') }} />
              <Btn grow label="Decline" variant="danger" disabled={!reason.trim() || busy}
                onPress={() => { onAct({ action: 'reject', reason: reason.trim() }); setShowReject(false) }} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
            <Btn grow label="Accept" loading={busy} onPress={() => onAct({ action: 'approve' })} />
            <Btn label="Decline" variant="secondary" onPress={() => setShowReject(true)} />
          </View>
        )
      )}

      {appt.status !== 'pending' && (
        <CardActions>
          {appt.status === 'confirmed' && isVirtual && <CardAction first label="Join call" onPress={onJoinCall} />}
          {appt.status === 'in_progress' && isVirtual && <CardAction first label="Rejoin call" onPress={onJoinCall} />}
          {appt.status === 'confirmed' && !isVirtual && <CardAction first label="Start visit" onPress={() => onAct({ action: 'start' })} />}
          {appt.status === 'in_progress' && !isVirtual && <CardAction first label="Mark completed" onPress={() => onAct({ action: 'complete' })} />}
          {(appt.status === 'in_progress' || appt.status === 'completed') && (
            <CardAction first={appt.status === 'completed'} label="Care plan" onPress={onCarePlan} />
          )}
          {appt.status === 'confirmed' && (
            <CardAction label="Add to calendar" onPress={() => addToGoogleCalendar({
              title: `${isVirtual ? 'Video consult' : 'Home visit'}: ${name}`,
              date: appt.appointment_date, time: appt.start_time,
              location: isVirtual ? 'Queue Doctor (video)' : (appt.home_visit_address ?? undefined),
              details: appt.reason ?? undefined,
            }).catch(() => {})} />
          )}
          {appt.status === 'confirmed' && (
            <CardAction label="Cancel" onPress={() => onAct({ action: 'cancel', reason: 'Cancelled by the doctor' })} />
          )}
        </CardActions>
      )}
    </Card>
  )
}
