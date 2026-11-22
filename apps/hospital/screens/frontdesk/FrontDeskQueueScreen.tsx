import { useState, useCallback, useEffect, type ComponentProps } from 'react'
import { View, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, SearchField, Notice,
  Btn, BottomBar, Stat, StatStrip, DayBar, Empty, IconBtn, Mono, type PillTone,
} from '@queue/shared/components/q'
import { useIsOffline } from '@queue/shared/hooks/useIsOffline'
import { getHospitalHours, type DayHours } from '@queue/shared/lib/api'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { todayLocalDate } from '@queue/shared/lib/format'
import { ringPatient } from '@queue/shared/lib/api'
import { VitalsEntryModal } from '@queue/shared/components/frontdesk/VitalsEntryModal'
import { MovePositionModal } from '@queue/shared/components/frontdesk/MovePositionModal'
import { statusBadgeColors } from '@queue/shared/lib/statusColors'
import { compareQueueEntries, queueBand } from '@queue/shared/lib/queueOrder'

interface Appt {
  id:               string
  booking_ref:      string
  appointment_date: string
  start_time:       string
  type:             string
  status:           string
  approval_status:  string | null
  reason:           string | null
  urgency:          string | null
  queue_position:   number | null
  // Arrival time, so a checked-in patient with no doctor yet still sorts by
  // when they walked in rather than falling to the bottom of the list.
  checked_in_at:    string | null
  doctor_id:          string | null
  assigned_doctor_id: string | null
  check_in_date:      string | null
  walkin_patient_name:  string | null
  walkin_patient_phone: string | null
  referral_reason?:  string | null
  patient:          { id: string; full_name: string; phone: string | null } | null
  doctor:           { full_name: string } | null
  referred_by?:      { full_name: string; title: string | null } | null
  referring_hospital?: { name: string } | null
  referring_clinic?: { name: string } | null
}

interface VitalsRow {
  weight_kg:    number | null
  height_cm:    number | null
  bp_systolic:  number | null
  bp_diastolic: number | null
  blood_sugar:  number | null
  recorded_at:  string
}

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

function buildStatusMeta(t: Parameters<typeof statusBadgeColors>[0]): Record<string, { label: string; color: string; bg: string }> {
  const sc = statusBadgeColors(t)
  return {
    pending:          { label: 'Pending',           color: sc.pending.text,          bg: sc.pending.bg },
    pending_approval: { label: 'Awaiting Approval',  color: sc.pending_approval.text, bg: sc.pending_approval.bg },
    confirmed:        { label: 'Confirmed',          color: sc.confirmed.text,        bg: sc.confirmed.bg },
    checked_in:       { label: 'Checked In',         color: sc.checked_in.text,       bg: sc.checked_in.bg },
    in_progress:      { label: 'In Progress',        color: sc.in_progress.text,      bg: sc.in_progress.bg },
    completed:        { label: 'Completed',          color: sc.completed.text,        bg: sc.completed.bg },
    cancelled:        { label: 'Cancelled',          color: sc.cancelled.text,        bg: sc.cancelled.bg },
    no_show:          { label: 'No Show',            color: sc.no_show.text,          bg: sc.no_show.bg },
  }
}

function fmt12(t: string) {
  if (!t) return '—'
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

interface Props { navigation: any }

export function FrontDeskQueueScreen({ navigation }: Props) {
  const { theme: t }   = useTheme()
  const { staffProfile } = useAuth()
  const [appts,      setAppts]      = useState<Appt[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actioning,  setActioning]  = useState<string | null>(null)
  const [tab,        setTab]        = useState<'today' | 'all'>('today')
  const [search,     setSearch]     = useState('')
  const [vitalsMap,  setVitalsMap]  = useState<Map<string, VitalsRow>>(new Map())
  const [vitalsTarget, setVitalsTarget] = useState<Appt | null>(null)
  const [moveTarget,   setMoveTarget]   = useState<Appt | null>(null)
  const [ringing,      setRinging]      = useState<string | null>(null)

  const hospitalId = staffProfile?.hospitalId

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) { setLoading(false); return }
    if (!silent) setLoading(true)
    const today = todayLocalDate()
    let query = supabase
      .from('appointments')
      .select(`
        id, booking_ref, appointment_date, start_time, type, status, approval_status, reason, urgency,
        queue_position, checked_in_at, doctor_id, assigned_doctor_id, check_in_date,
        walkin_patient_name, walkin_patient_phone, referral_reason,
        patient:users!appointments_patient_id_fkey(id, full_name, phone),
        doctor:doctors!appointments_doctor_id_fkey(full_name),
        referred_by:doctors!appointments_referred_by_doctor_id_fkey(full_name, title),
        referring_hospital:hospitals!appointments_referring_hospital_id_fkey(name),
        referring_clinic:hospital_clinics!appointments_referring_clinic_id_fkey(name)
      `)
      .eq('hospital_id', hospitalId)
      .order('appointment_date', { ascending: true })
      .order('start_time',       { ascending: true })

    // Matches get_doctor_queue's own convention: a booking dated for another day that
    // physically checked in today belongs on today's list too, not just whatever day
    // it was originally booked for.
    if (tab === 'today') query = query.or(`appointment_date.eq.${today},check_in_date.eq.${today}`)

    const { data } = await query
    // Supabase's generated types model the patient/doctor FK joins below as
    // arrays even though each appointment has exactly one of each at runtime
    // (a known codegen limitation for `!fk_name(...)` embeds it can't prove
    // are one-to-one) -- cast through unknown to reflect the real shape.
    const rows = (data ?? []) as unknown as Appt[]
    setAppts(rows)
    setLoading(false)
    setRefreshing(false)
    loadVitals(rows)
  }, [hospitalId, tab])

  // vitals_audit_log has no hospital_id column to filter a realtime channel on
  // cleanly, and vitals are recorded once or twice per visit (not high-frequency),
  // so a light poll while focused is simpler than wiring up realtime here.
  const loadVitals = useCallback(async (rows: Appt[]) => {
    const ids = rows.filter(a => a.status === 'checked_in' || a.status === 'in_progress').map(a => a.id)
    if (ids.length === 0) { setVitalsMap(new Map()); return }
    const { data } = await supabase
      .from('vitals_audit_log')
      .select('appointment_id, weight_kg, height_cm, bp_systolic, bp_diastolic, blood_sugar, recorded_at')
      .in('appointment_id', ids)
      .order('recorded_at', { ascending: false })
    const map = new Map<string, VitalsRow>()
    for (const row of (data as any[]) ?? []) {
      if (!map.has(row.appointment_id)) map.set(row.appointment_id, row)
    }
    setVitalsMap(map)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useEffect(() => {
    const interval = setInterval(() => loadVitals(appts), 15000)
    return () => clearInterval(interval)
  }, [appts, loadVitals])

  useEffect(() => {
    if (!hospitalId) return
    const channel = supabase
      .channel(`frontdesk:${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `hospital_id=eq.${hospitalId}` },
        () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [hospitalId, load])

  async function handleCheckIn(appt: Appt) {
    if (appt.status !== 'confirmed' && appt.status !== 'pending') {
      Alert.alert('Cannot check in', `Status is "${buildStatusMeta(t)[appt.status]?.label ?? appt.status}".`)
      return
    }
    if (appt.approval_status === 'pending_approval') {
      Alert.alert('Cannot check in', 'This booking is still awaiting approval.')
      return
    }
    setActioning(appt.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      // Routed through the same PATCH /api/appointments/[id] endpoint the web dashboard
      // uses (not a raw table update) so check_in_date/queue_position get set -- a direct
      // update here left check_in_date null, so a future- or past-dated booking that
      // walked in today never actually joined today's queue.
      const res = await fetch(`${API_URL}/api/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ action: 'check_in' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Check-in failed')
      }
      haptics.success()
      load(true)
    } catch (e) {
      haptics.error()
      Alert.alert('Error', e instanceof Error ? e.message : 'Check-in failed')
    } finally {
      setActioning(null)
    }
  }

  async function handleApprove(appt: Appt) {
    setActioning(appt.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      // Routed through the same PATCH /api/appointments/[id] endpoint the web dashboard
      // uses (not a raw table update) so the patient actually gets notified their
      // booking was approved -- a direct update here would silently skip that.
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

  function handleReject(appt: Appt) {
    Alert.alert('Reject Booking', 'The patient will be notified. No payment was taken, so there is nothing to refund.', [
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
            body: JSON.stringify({ action: 'reject', note: 'Cancelled by front desk' }),
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

  async function handleRing(appt: Appt) {
    setRinging(appt.id)
    const { error } = await ringPatient(appt.id)
    setRinging(null)
    if (error) { haptics.error(); Alert.alert('Error', error) } else haptics.success()
  }

  const offline = useIsOffline()

  // Opening hours drive the day bar. Loaded once per hospital; a hospital with
  // none set simply gets no bar rather than an invented day.
  const [hours, setHours] = useState<DayHours[] | null>(null)
  useEffect(() => {
    if (!hospitalId) return
    let cancelled = false
    getHospitalHours(hospitalId).then(h => { if (!cancelled) setHours(h) }).catch(() => {})
    return () => { cancelled = true }
  }, [hospitalId])
  const today_ = hours?.find(h => h.day === new Date().getDay())

  const today = todayLocalDate()

  // Client-side search filter (no API call)
  const filtered = search.trim()
    ? appts.filter(a => (a.patient?.full_name ?? a.walkin_patient_name ?? '').toLowerCase().includes(search.toLowerCase()))
    : appts

  // Emergency walk-ins sort to the top of the active queue — same tiering used on the
  // web front-desk queue and the specialist queue. queue_position (nulls-last) is the
  // secondary key so a manual reorder (this screen's own Move action, or a patient's
  // self-delay) is actually visible here, not just on the doctor's own queue screen.
  const active = filtered
    .filter(a => !['completed', 'cancelled', 'no_show'].includes(a.status))
    .sort(compareQueueEntries)
  const done   = filtered.filter(a =>  ['completed', 'cancelled', 'no_show'].includes(a.status))

  // Stats from full (unfiltered) list
  const checkedInCount = appts.filter(a => a.status === 'checked_in').length
  const pendingCount   = appts.filter(a => ['pending', 'pending_approval', 'confirmed'].includes(a.status)).length

  // The handoff's three groups are exactly the three bands queueOrder already
  // sorts by, so the headings name the ordering rule instead of inventing a
  // second one: numbered, arrived-but-unassigned, not here yet.
  const numbered = active.filter(a => queueBand(a) === 0)
  const arrived = active.filter(a => queueBand(a) === 1)
  const expected = active.filter(a => queueBand(a) === 2)

  const emergencies = active.filter(a => a.urgency === 'emergency').length
  const longestWait = active
    .filter(a => a.status === 'checked_in')
    .map(a => (a.checked_in_at ? Math.round((Date.now() - Date.parse(a.checked_in_at)) / 60_000) : null))
    .filter((n): n is number => n != null && Number.isFinite(n))
    .reduce<number | null>((max, n) => (max == null || n > max ? n : max), null)

  const groups: { title: string; items: Appt[]; note?: string }[] = [
    { title: `Numbered · ${numbered.length}`, items: numbered },
    { title: `Arrived · no doctor yet · ${arrived.length}`, items: arrived },
    { title: `Not arrived · ${expected.length}`, items: expected },
  ].filter(g => g.items.length > 0)

  return (
    <Screen>
      <AppBar large title="Live queue" right={
        <IconBtn name="refresh-outline" label="Refresh the queue"
          onPress={() => { haptics.tap(); setRefreshing(true); load(true) }} />
      } />

      {today_ && !today_.closed && (
        <DayBar opensAt={today_.open.slice(0, 5)} closesAt={today_.close.slice(0, 5)} />
      )}

      <Seg<'today' | 'all'>
        value={tab} onChange={setTab}
        options={[{ key: 'today', label: 'Today' }, { key: 'all', label: 'All' }]}
      />

      <SearchField value={search} onChangeText={setSearch} placeholder="Search by patient name…" />

      {offline && (
        <Notice tone="amber" icon="cloud-offline-outline">
          You are offline. This is the last queue your device received — check-ins and approvals will
          not send until the network is back.
        </Notice>
      )}

      {loading && appts.length === 0 ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          <StatStrip>
            <Stat label="Waiting" value={checkedInCount}
              note={longestWait != null ? `longest ${longestWait} min` : 'nobody waiting'} />
            <Stat label="Unassigned" value={arrived.length}
              tone={arrived.length > 0 ? 'amber' : undefined}
              note={arrived.length ? 'need a doctor' : 'all assigned'} />
            <Stat label="Emergencies" value={emergencies}
              tone={emergencies > 0 ? 'red' : undefined}
              note={emergencies ? 'brought forward' : 'none today'} last />
          </StatStrip>

          {filtered.length === 0 && (
            <Card style={{ marginTop: 12 }}>
              <Empty
                icon="clipboard-outline"
                title={search ? 'Nobody matches that' : 'No one in the queue yet'}
                body={search
                  ? `Nothing matches "${search}". Try a different name.`
                  : tab === 'today'
                    ? 'Bookings for today show up here. Add a walk-in to put someone on the queue now.'
                    : 'No appointments found.'}
                action={!search && tab === 'today' ? 'Add a walk-in' : undefined}
                onAction={!search && tab === 'today' ? () => navigation.navigate('WalkInBooking') : undefined}
              />
            </Card>
          )}

          {groups.map(g => (
            <View key={g.title}>
              <SectionHead title={g.title} />
              <Card>
                {g.items.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 && <Hair />}
                    <QueueRow
                      appt={a} t={t} today={today} actioning={actioning} ringing={ringing}
                      vitals={vitalsMap.get(a.id) ?? null}
                      onCheckIn={handleCheckIn} onApprove={handleApprove} onReject={handleReject}
                      onRing={handleRing} onRecordVitals={setVitalsTarget} onMove={setMoveTarget}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ))}

          {done.length > 0 && (
            <>
              <SectionHead title={`Finished today · ${done.length}`} />
              <Card>
                {done.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 && <Hair />}
                    <Row
                      number={a.queue_position ?? undefined}
                      dim
                      title={a.patient?.full_name ?? a.walkin_patient_name ?? 'Walk-in patient'}
                      sub={`${fmt12(a.start_time)}${a.doctor ? ' · ' + a.doctor.full_name : ''}`}
                      pill={a.status === 'completed' ? 'Seen' : a.status === 'no_show' ? 'Missed' : 'Cancelled'}
                      pillTone="neutral"
                    />
                  </View>
                ))}
              </Card>
            </>
          )}
        </Body>
      )}

      <BottomBar meta={
        <>
          {offline && (
            <>
              <Mono size={12} weight="700" color={t.q.amber}>Offline</Mono>
              <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
            </>
          )}
          <Mono size={12}>Waiting {checkedInCount}</Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12} color={arrived.length ? t.q.amber : undefined}>Unassigned {arrived.length}</Mono>
        </>
      }>
        <Btn grow label="Check someone in" icon="person-add-outline"
          onPress={() => navigation.navigate('WalkInBooking')} />
      </BottomBar>

      {vitalsTarget && (
        <VitalsEntryModal
          appointmentId={vitalsTarget.id}
          patientName={vitalsTarget.patient?.full_name ?? vitalsTarget.walkin_patient_name ?? 'Patient'}
          onClose={() => setVitalsTarget(null)}
          onSaved={() => { setVitalsTarget(null); loadVitals(appts) }}
        />
      )}

      {moveTarget && (
        <MovePositionModal
          appt={moveTarget}
          queue={active.filter(a => a.status === 'checked_in'
            && a.doctor_id === moveTarget.doctor_id && a.assigned_doctor_id === moveTarget.assigned_doctor_id
            && a.check_in_date === moveTarget.check_in_date)}
          onClose={() => setMoveTarget(null)}
          onMoved={() => { setMoveTarget(null); load(true) }}
        />
      )}
    </Screen>
  )
}

/**
 * One patient in the queue.
 *
 * The old card stacked a name, phone, meta line, reason, referral, two badges,
 * a booking ref, a vitals strip and up to five buttons. At a front desk that is
 * read dozens of times an hour, so this is one row carrying the number, who
 * they are and one status -- with the actions that apply to THIS state, and
 * nothing else, underneath it.
 */
function QueueRow({ appt, t, today, actioning, ringing, vitals, onCheckIn, onApprove, onReject, onRing, onRecordVitals, onMove }: {
  appt: Appt
  t: any
  today: string
  actioning: string | null
  ringing: string | null
  vitals: VitalsRow | null
  onCheckIn: (a: Appt) => void
  onApprove: (a: Appt) => void
  onReject: (a: Appt) => void
  onRing: (a: Appt) => void
  onRecordVitals: (a: Appt) => void
  onMove: (a: Appt) => void
}) {
  // `status` and `approval_status` are independent columns -- a booking awaiting
  // manual review has status='pending', approval_status='pending_approval';
  // status itself never holds that string.
  const dispStatus = appt.approval_status === 'pending_approval' ? 'pending_approval' : appt.status
  const isLoading = actioning === appt.id
  const canCheckIn = (appt.status === 'confirmed' || appt.status === 'pending')
    && appt.appointment_date === today && appt.approval_status !== 'pending_approval'
  const canApprove = appt.approval_status === 'pending_approval'
  const isEmergency = appt.urgency === 'emergency'
  const showVitals = appt.status === 'checked_in' || appt.status === 'in_progress'
  const isRinging = ringing === appt.id

  const waited = appt.checked_in_at
    ? Math.round((Date.now() - Date.parse(appt.checked_in_at)) / 60_000)
    : null

  const pill: { label: string; tone: PillTone; solid?: boolean } =
    isEmergency ? { label: 'Emergency', tone: 'red', solid: true }
    : dispStatus === 'in_progress' ? { label: 'Now', tone: 'teal', solid: true }
    : dispStatus === 'checked_in' ? { label: 'Checked in', tone: 'teal' }
    : dispStatus === 'pending_approval' ? { label: 'Awaiting', tone: 'amber', solid: true }
    : dispStatus === 'confirmed' ? { label: 'Expected', tone: 'neutral' }
    : { label: dispStatus.replace(/_/g, ' '), tone: 'neutral' }

  const sub = [
    appt.appointment_date !== today ? appt.appointment_date : null,
    appt.doctor ? appt.doctor.full_name : 'No doctor yet',
    waited != null ? `waited ${waited} min` : fmt12(appt.start_time),
    appt.type === 'virtual' ? 'video' : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <Row
        number={appt.queue_position ?? undefined}
        icon={appt.queue_position == null ? (appt.type === 'virtual' ? 'videocam-outline' : 'person-outline') : undefined}
        iconTone={isEmergency ? 'red' : 'neutral'}
        tint={isEmergency || dispStatus === 'in_progress'}
        title={appt.patient?.full_name ?? appt.walkin_patient_name ?? 'Walk-in patient'}
        sub={sub}
        pill={pill.label}
        pillTone={pill.tone}
        pillSolid={pill.solid}
      />

      {/* Only the actions this patient's state allows. */}
      {(canApprove || canCheckIn || showVitals) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
          {canApprove && (
            <>
              <Btn label="Approve" small loading={isLoading} disabled={!!actioning}
                onPress={() => onApprove(appt)} />
              <Btn label="Decline" variant="secondary" small disabled={!!actioning}
                onPress={() => onReject(appt)} />
            </>
          )}
          {canCheckIn && (
            <Btn label="Check in" small loading={isLoading} disabled={!!actioning}
              icon="arrow-forward" onPress={() => onCheckIn(appt)} />
          )}
          {showVitals && (
            <>
              <Btn label={vitals ? 'Vitals' : 'Add vitals'} variant="secondary" small
                icon="fitness-outline" onPress={() => onRecordVitals(appt)} />
              {appt.status === 'checked_in' && (
                <Btn label="Move" variant="secondary" small icon="swap-vertical-outline"
                  onPress={() => onMove(appt)} />
              )}
              <Btn label={isRinging ? 'Ringing…' : 'Ring'} variant="secondary" small
                icon="notifications-outline" loading={isRinging} onPress={() => onRing(appt)} />
            </>
          )}
        </View>
      )}

      {/* Vitals read as data, so they are set in the mono face and only shown
          when there is something to show. */}
      {showVitals && vitals && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 14, paddingBottom: 12 }}>
          {vitals.bp_systolic != null && vitals.bp_diastolic != null && (
            <Mono size={12} color={t.q.ink70}>BP {vitals.bp_systolic}/{vitals.bp_diastolic}</Mono>
          )}
          {vitals.weight_kg != null && <Mono size={12} color={t.q.ink70}>{vitals.weight_kg} kg</Mono>}
          {vitals.height_cm != null && <Mono size={12} color={t.q.ink70}>{vitals.height_cm} cm</Mono>}
          {vitals.blood_sugar != null && <Mono size={12} color={t.q.ink70}>{vitals.blood_sugar} mg/dL</Mono>}
        </View>
      )}
    </>
  )
}
