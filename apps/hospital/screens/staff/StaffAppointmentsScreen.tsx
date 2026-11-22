import { useState, useCallback, useEffect } from 'react'
import { View, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useFocusEffect } from '@react-navigation/native'
import {
  Screen, AppBar, Body, Card, Row, Hair, Chip, SearchField, Btn,
  Empty, Initials, type PillTone,
} from '@queue/shared/components/q'
import { startConversation } from '@queue/shared/lib/chat'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'
import { statusBadgeColors } from '@queue/shared/lib/statusColors'
import { RescheduleModal } from '@queue/shared/components/RescheduleModal'
import { rescheduleHospitalAppointment } from '@queue/shared/lib/api'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Appt {
  id: string
  booking_ref: string
  appointment_date: string
  start_time: string
  type: string
  status: string
  approval_status: string | null
  reason: string | null
  urgency: string | null
  queue_position: number | null
  walkin_patient_name: string | null
  walkin_patient_phone: string | null
  patient: { id: string; full_name: string; phone: string | null } | null
  doctor: { full_name: string } | null
  clinic: { name: string } | null
}

type FilterTab = 'pending' | 'today' | 'upcoming' | 'past'


function fmt12(time: string) {
  if (!time) return '—'
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

interface Props { navigation: any }

export function StaffAppointmentsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const sc = statusBadgeColors(t)
  const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    pending:          { label: 'Pending',           color: sc.pending.text,          bg: sc.pending.bg },
    pending_approval: { label: 'Awaiting Approval',  color: sc.pending_approval.text, bg: sc.pending_approval.bg },
    confirmed:        { label: 'Confirmed',          color: sc.confirmed.text,        bg: sc.confirmed.bg },
    checked_in:       { label: 'Checked In',         color: sc.checked_in.text,       bg: sc.checked_in.bg },
    in_progress:      { label: 'In Progress',        color: sc.in_progress.text,      bg: sc.in_progress.bg },
    completed:        { label: 'Completed',          color: sc.completed.text,        bg: sc.completed.bg },
    cancelled:        { label: 'Cancelled',          color: sc.cancelled.text,        bg: sc.cancelled.bg },
    no_show:          { label: 'No Show',            color: sc.no_show.text,          bg: sc.no_show.bg },
  }
  const [appts,      setAppts]      = useState<Appt[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actioning,  setActioning]  = useState<string | null>(null)
  // Pre-check-in only; see the gate on the button below.
  const [rescheduling, setRescheduling] = useState<Appt | null>(null)
  const [tab,        setTab]        = useState<FilterTab>('pending')
  const [search,     setSearch]     = useState('')

  const hospitalId = staffProfile?.hospitalId
  const today = todayLocalDate()

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)

    let query = supabase
      .from('appointments')
      .select('id, booking_ref, appointment_date, start_time, type, status, approval_status, reason, urgency, queue_position, walkin_patient_name, walkin_patient_phone, patient:users!appointments_patient_id_fkey(id, full_name, phone), doctor:doctors!appointments_doctor_id_fkey(full_name), clinic:hospital_clinics!appointments_clinic_id_fkey(name)')
      .eq('hospital_id', hospitalId)
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: true })
      .limit(200)

    if (tab === 'pending') {
      query = query.eq('approval_status', 'pending_approval')
    } else if (tab === 'today') {
      query = query.eq('appointment_date', today)
    } else if (tab === 'upcoming') {
      query = query.gt('appointment_date', today)
    } else if (tab === 'past') {
      query = query.lt('appointment_date', today)
    }

    const { data } = await query
    // See FrontDeskQueueScreen.tsx: Supabase's generated types model these FK
    // joins as arrays even though each appointment has exactly one of each.
    setAppts((data ?? []) as unknown as Appt[])
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, tab])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useEffect(() => {
    if (!hospitalId) return
    const ch = supabase
      .channel(`staff-appts:${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `hospital_id=eq.${hospitalId}` }, () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [hospitalId, load])

  async function handleApprove(appt: Appt) {
    setActioning(appt.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      const res = await fetch(`${API_URL}/api/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Approval failed')
      }
      haptics.success()
      load(true)
    } catch (e) {
      haptics.error()
      Alert.alert('Error', e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setActioning(null)
    }
  }

  async function handleReject(appt: Appt) {
    Alert.alert('Reject Booking', 'Cancel this appointment request?', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        setActioning(appt.id)
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const jwt = session?.access_token
          if (!jwt) throw new Error('Not authenticated')
          // The API requires a non-empty rejection note (it's shown to the patient in
          // their refund notification) -- mirrors the generic note the web dashboard's
          // front-desk reject action sends (rejectPendingApprovalAppointment).
          const res = await fetch(`${API_URL}/api/appointments/${appt.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ action: 'reject', note: 'Cancelled by hospital staff' }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => null)
            throw new Error(body?.error ?? 'Rejection failed')
          }
          haptics.success()
          load(true)
        } catch (e) {
          haptics.error()
          Alert.alert('Error', e instanceof Error ? e.message : 'Rejection failed')
        } finally {
          setActioning(null)
        }
      }}
    ])
  }

  const filtered = search.trim()
    ? appts.filter(a => (a.patient?.full_name ?? a.walkin_patient_name ?? '').toLowerCase().includes(search.toLowerCase()) || a.booking_ref?.toLowerCase().includes(search.toLowerCase()))
    : appts

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'pending',  label: 'Pending' },
    { key: 'today',    label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past',     label: 'Past' },
  ]

  return (
    <Screen>
      <AppBar large title="Appointments" />

      <SearchField value={search} onChangeText={setSearch} placeholder="Search patient or booking ref…" />

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
        {TABS.map(tb => (
          <Chip key={tb.key} label={tb.label} on={tab === tb.key} onPress={() => setTab(tb.key)} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          {filtered.length === 0 ? (
            <Card style={{ marginTop: 12 }}>
              <Empty
                icon="calendar-outline"
                title={search ? 'Nothing matches that' : tab === 'pending' ? 'Nothing to approve' : 'No appointments'}
                body={search
                  ? `Nothing matches “${search}”.`
                  : tab === 'pending' ? 'Every booking is up to date.' : 'Nothing here yet.'}
              />
            </Card>
          ) : (
            <Card>
              {filtered.map((appt, i) => {
                const dispStatus = appt.approval_status === 'pending_approval' ? 'pending_approval' : appt.status
                const isLoading = actioning === appt.id
                const canApprove = appt.approval_status === 'pending_approval'
                const canReschedule = ['pending', 'confirmed'].includes(appt.status)
                const isEmergency = appt.urgency === 'emergency'

                const pill: { label: string; tone: PillTone; solid?: boolean } =
                  isEmergency ? { label: 'Emergency', tone: 'red', solid: true }
                  : dispStatus === 'pending_approval' ? { label: 'Awaiting', tone: 'amber', solid: true }
                  : dispStatus === 'in_progress' ? { label: 'In progress', tone: 'teal', solid: true }
                  : dispStatus === 'checked_in' ? { label: 'Checked in', tone: 'teal' }
                  : dispStatus === 'confirmed' ? { label: 'Confirmed', tone: 'green' }
                  : dispStatus === 'completed' ? { label: 'Seen', tone: 'neutral' }
                  : dispStatus === 'no_show' ? { label: 'No show', tone: 'neutral' }
                  : { label: dispStatus.replace(/_/g, ' '), tone: 'neutral' }

                return (
                  <View key={appt.id}>
                    {i > 0 && <Hair />}
                    <Row
                      leading={<Initials name={appt.patient?.full_name ?? appt.walkin_patient_name} size={40} />}
                      tint={isEmergency}
                      title={appt.patient?.full_name ?? appt.walkin_patient_name ?? 'Walk-in'}
                      sub={[
                        appt.clinic?.name,
                        `${fmtDate(appt.appointment_date)} · ${fmt12(appt.start_time)}`,
                        appt.doctor?.full_name,
                        appt.booking_ref,
                      ].filter(Boolean).join(' · ')}
                      pill={pill.label}
                      pillTone={pill.tone}
                      pillSolid={pill.solid}
                    />

                    {(canApprove || canReschedule || !!appt.patient?.id) && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
                        {canApprove && (
                          <>
                            <Btn label="Approve" small loading={isLoading} disabled={!!actioning}
                              onPress={() => handleApprove(appt)} />
                            <Btn label="Decline" variant="secondary" small disabled={!!actioning}
                              onPress={() => handleReject(appt)} />
                          </>
                        )}
                        {/* Moving the visit is only safe before the patient is in
                            a queue: once checked in, the queue trigger owns the
                            ordering (the route re-checks status anyway). */}
                        {canReschedule && (
                          <Btn label="Reschedule" variant="secondary" small icon="calendar-outline"
                            disabled={!!actioning} onPress={() => setRescheduling(appt)} />
                        )}
                        {!!appt.patient?.id && (
                          <Btn
                            label="Message" variant="secondary" small icon="chatbubble-ellipses-outline"
                            onPress={async () => {
                              haptics.tap()
                              const r = await startConversation('patient', appt.patient!.id, appt.id)
                              if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
                              else Alert.alert('Messages', r.notReady
                                ? 'Messaging is being switched on. Please check back soon.'
                                : r.error)
                            }}
                          />
                        )}
                      </View>
                    )}

                    {!!appt.reason && (
                      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                        <Text numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60 }}>
                          {appt.reason}
                        </Text>
                      </View>
                    )}
                  </View>
                )
              })}
            </Card>
          )}
        </Body>
      )}

      {rescheduling && (
        <RescheduleModal
          patientName={rescheduling.patient?.full_name ?? rescheduling.walkin_patient_name ?? undefined}
          onClose={() => setRescheduling(null)}
          onConfirm={async payload => {
            const err = await rescheduleHospitalAppointment(rescheduling.id, payload)
            if (err) return err
            setRescheduling(null)
            await load(true)
            return null
          }}
        />
      )}
    </Screen>
  )
}
