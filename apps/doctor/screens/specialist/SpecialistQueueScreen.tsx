import { useState, useCallback, useEffect } from 'react'
import { View, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { todayLocalDate } from '@queue/shared/lib/format'
import { RescheduleModal } from '@queue/shared/components/RescheduleModal'
import {
  rescheduleHospitalAppointment, ringPatient, getHospitalHours, getMyDoctorStats,
  type DayHours,
} from '@queue/shared/lib/api'
import { compareQueueEntries } from '@queue/shared/lib/queueOrder'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, DayBar, Stat, StatStrip,
  Seg, Btn, BottomBar, Empty, Mono, Notice, type PillTone,
} from '@queue/shared/components/q'

interface ApptRow {
  id:               string
  appointment_date: string
  start_time:       string
  type:             string
  status:           string
  reason:           string | null
  urgency:          string | null
  queue_position:   number | null
  patient_name:     string | null
  patient_phone:    string | null
  patient_gender:   string | null
  // Added to get_doctor_queue by 20261121000001. Optional on the type so the
  // screen keeps working against a database where that has not been applied
  // yet -- it simply says nothing about waits instead of crashing.
  checked_in_at?:   string | null
  requeued_at?:     string | null
  patient_dob?:     string | null
  referral_reason?:         string | null
  referred_by_doctor_name?: string | null
  referring_hospital_name?: string | null
  referring_clinic_name?:   string | null
}

interface Props { navigation: any }

type Tab = 'today' | 'upcoming'

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending:     { label: 'Not here yet', tone: 'neutral' },
  confirmed:   { label: 'Not here yet', tone: 'neutral' },
  checked_in:  { label: 'Checked in',   tone: 'teal' },
  in_progress: { label: 'In consult',   tone: 'green' },
  completed:   { label: 'Done',         tone: 'neutral' },
  cancelled:   { label: 'Cancelled',    tone: 'red' },
}

/** Whole years, or null when there is no date of birth to work from. */
function age(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 && a < 130 ? a : null
}

/**
 * How long they have been waiting, from when they actually arrived.
 *
 * requeued_at wins where set: a patient sent to the laboratory and back is
 * ordered by when they came back (20261031000001), so showing the wait from
 * their original arrival would claim a longer wait than their position
 * reflects and make the queue look wrong to the one person who can fix it.
 */
function waitedMinutes(a: ApptRow, now: number): number | null {
  const from = a.requeued_at ?? a.checked_in_at
  if (!from) return null
  const ms = now - Date.parse(from)
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : null
}

function fmtDate(d: string): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function SpecialistQueueScreen({ navigation }: Props) {
  const { theme: t }  = useTheme()
  const { doctorProfile } = useAuth()
  const [tab,        setTab]        = useState<Tab>('today')
  const [appts,      setAppts]      = useState<ApptRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hours,      setHours]      = useState<DayHours[] | null>(null)
  const [avgSecs,    setAvgSecs]    = useState<number | null>(null)
  const [ringingId,  setRingingId]  = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState<ApptRow | null>(null)
  // Waits are only interesting as they grow, so the figures tick without
  // re-polling the server.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async (silent = false) => {
    // A doctor with no hospital link has no queue to load. Returning early
    // without clearing `loading` left them on skeletons for ever, now that the
    // Queue tab is reachable before a hospital links them.
    if (!doctorProfile) { setLoading(false); return }
    if (!silent) setLoading(true)

    const today = todayLocalDate()
    const { data } = await supabase.rpc('get_doctor_queue', {
      p_doctor_id: doctorProfile.doctorId,
      p_date:      tab === 'today' ? today : null,
      p_today:     today,
    })

    setAppts((data as ApptRow[]) ?? [])
    setLoading(false)
  }, [doctorProfile, tab])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Session bar and the median consult only change by the day, so they load
  // once rather than on every queue refresh.
  useEffect(() => {
    if (!doctorProfile) return
    let cancelled = false
    Promise.all([
      getHospitalHours(doctorProfile.hospitalId).catch(() => null),
      getMyDoctorStats().catch(() => null),
    ]).then(([h, s]) => {
      if (cancelled) return
      setHours(h)
      setAvgSecs(s?.avgConsultSecs ?? null)
    })
    return () => { cancelled = true }
  }, [doctorProfile])

  useEffect(() => {
    if (!doctorProfile || tab !== 'today') return
    const ch = supabase
      .channel(`doctor-queue:${doctorProfile.doctorId}`)
      .on('postgres_changes' as any, {
        event: '*', schema: 'public', table: 'appointments',
        filter: `doctor_id=eq.${doctorProfile.doctorId}`,
      }, () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [doctorProfile, tab, load])

  // Same ordering as the front-desk queue and the web dashboard: emergencies
  // first, then whoever actually has a queue position (i.e. has checked in), in
  // that order, and everyone not yet arrived after them by appointment time.
  const active = appts
    .filter(a => ['pending', 'confirmed', 'checked_in', 'in_progress'].includes(a.status))
    .sort(compareQueueEntries)
  const done = appts.filter(a => a.status === 'completed')
  const waiting = active.filter(a => a.status === 'checked_in' || a.status === 'in_progress')
  const emergencies = active.filter(a => a.urgency === 'emergency')
  const longestWait = waiting
    .map(a => waitedMinutes(a, now))
    .filter((n): n is number => n != null)
    .reduce<number | null>((max, n) => (max == null || n > max ? n : max), null)
  const inConsult = active.find(a => a.status === 'in_progress') ?? null
  const next = active.find(a => a.status !== 'in_progress') ?? null
  const today_ = hours?.find(h => h.day === new Date().getDay())

  async function callIn(a: ApptRow) {
    setRingingId(a.id)
    const { error } = await ringPatient(a.id)
    setRingingId(null)
    if (error) { haptics.error(); Alert.alert('Could not ring the patient', error); return }
    haptics.success()
    navigation.navigate('PatientConsult', { appointmentId: a.id })
  }

  function openRow(a: ApptRow) {
    haptics.tap()
    navigation.navigate('PatientConsult', { appointmentId: a.id })
  }

  function rowFor(a: ApptRow, opts: { dim?: boolean } = {}) {
    const meta = STATUS[a.status] ?? STATUS.pending
    const emergency = a.urgency === 'emergency'
    const years = age(a.patient_dob)
    const waited = opts.dim ? null : waitedMinutes(a, now)
    return (
      <Row
        key={a.id}
        compact
        number={a.queue_position ?? undefined}
        title={[a.patient_name ?? 'Unknown patient', years != null ? `${years}` : null].filter(Boolean).join(', ')}
        titleColor={emergency ? t.q.red : undefined}
        dim={opts.dim}
        sub={[
          tab === 'upcoming' ? fmtDate(a.appointment_date) : null,
          // What the doctor is deciding on: how long this person has been
          // sitting there, not when they were booked.
          waited != null
            ? (a.requeued_at ? `back ${waited} min ago` : `waited ${waited} min`)
            : (a.start_time ? a.start_time.slice(0, 5) : null),
          emergency ? 'brought forward' : null,
          a.type === 'virtual' ? 'video' : null,
          a.referred_by_doctor_name ? `referred by ${a.referred_by_doctor_name}` : a.reason,
        ].filter(Boolean).join(' · ') || null}
        pill={emergency ? 'Emergency' : meta.label}
        pillTone={emergency ? 'red' : meta.tone}
        pillSolid={emergency}
        onPress={() => openRow(a)}
      />
    )
  }

  return (
    <Screen>
      <AppBar
        large
        title="My queue"
        sub={doctorProfile
          ? `${active.length} waiting · ${done.length} seen today`
          : 'Not linked to a hospital'}
      />

      <Seg<Tab>
        value={tab} onChange={setTab}
        options={[{ key: 'today', label: "Today's queue" }, { key: 'upcoming', label: 'Upcoming' }]} />

      {tab === 'today' && today_ && !today_.closed && (
        <DayBar label="Session" opensAt={today_.open.slice(0, 5)} closesAt={today_.close.slice(0, 5)} />
      )}

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
            onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false) }} />
        }>
          {tab === 'today' && (
            <Card style={{ marginTop: 12 }}>
              <StatStrip>
                <Stat label="Seen" value={done.length}
                  note={avgSecs == null ? 'no consults yet' : `avg ${Math.round(avgSecs / 60)} min`} />
                <Stat label="Waiting" value={waiting.length}
                  tone={emergencies.length > 0 ? 'red' : undefined}
                  note={emergencies.length
                    ? `${emergencies.length} emergency`
                    : longestWait != null ? `longest ${longestWait} min`
                    : waiting.length ? 'checked in' : 'nobody checked in'} />
                <Stat label="Not here yet"
                  value={active.length - waiting.length}
                  note="booked, not arrived" last />
              </StatStrip>
            </Card>
          )}

          {tab === 'today' && emergencies.length > 0 && (
            <Notice tone="red" icon="alert-circle">
              {emergencies.length === 1
                ? `${emergencies[0].patient_name ?? 'A patient'} was brought forward as an emergency. They sit above the numbered queue.`
                : `${emergencies.length} patients were brought forward as emergencies. They sit above the numbered queue.`}
            </Notice>
          )}

          {active.length === 0 && done.length === 0 ? (
            <Card style={{ marginTop: 12 }}>
              <Empty
                icon="people-outline"
                title={tab === 'today' ? 'Nobody in your queue' : 'Nothing booked beyond today'}
                body={tab === 'today'
                  ? 'Patients appear here as soon as the front desk checks them in.'
                  : 'Upcoming bookings with your name on them show up here.'} />
            </Card>
          ) : (
            <>
              {active.length > 0 && (
                <>
                  <SectionHead title={tab === 'today' ? 'Up next' : 'Upcoming'} />
                  <Card>
                    {active.map((a, i) => (
                      <View key={a.id}>
                        {i > 0 && <Hair />}
                        {rowFor(a)}
                      </View>
                    ))}
                  </Card>
                </>
              )}

              {done.length > 0 && (
                <>
                  <SectionHead title={`Seen today · ${done.length}`} />
                  <Card>
                    {done.map((a, i) => (
                      <View key={a.id}>
                        {i > 0 && <Hair />}
                        {rowFor(a, { dim: true })}
                      </View>
                    ))}
                  </Card>
                </>
              )}
            </>
          )}

          {/* Rescheduling is only offered before check-in: after that the patient
              is in a queue and the renumber trigger owns their position. */}
          {tab === 'upcoming' && active.some(a => ['pending', 'confirmed'].includes(a.status)) && (
            <>
              <SectionHead title="Move a booking" />
              <Card>
                {active.filter(a => ['pending', 'confirmed'].includes(a.status)).map((a, i) => (
                  <View key={a.id}>
                    {i > 0 && <Hair />}
                    <Row
                      compact
                      title={a.patient_name ?? 'Unknown patient'}
                      sub={`${fmtDate(a.appointment_date)} · ${a.start_time?.slice(0, 5) ?? ''}`}
                      right={<Btn label="Reschedule" variant="secondary" small onPress={() => { haptics.tap(); setRescheduling(a) }} />}
                    />
                  </View>
                ))}
              </Card>
            </>
          )}
        </Body>
      )}

      {tab === 'today' && doctorProfile && (
        <BottomBar meta={<>
          <Mono size={12} weight="600" color={inConsult ? t.q.primary : t.q.ink60}>
            {inConsult ? `In consult · ${inConsult.patient_name ?? 'patient'}` : 'No consult running'}
          </Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12} weight="600">Seen {done.length}</Mono>
        </>}>
          {inConsult ? (
            <Btn grow label="Back to consultation" icon="arrow-forward-outline"
              onPress={() => openRow(inConsult)} />
          ) : next ? (
            <Btn grow
              label={next.queue_position != null ? `Call number ${next.queue_position}` : `Call ${next.patient_name ?? 'next patient'}`}
              icon="megaphone-outline"
              loading={ringingId === next.id}
              onPress={() => callIn(next)} />
          ) : (
            <Btn grow label="Nobody to call" variant="secondary" disabled onPress={() => {}} />
          )}
        </BottomBar>
      )}

      {rescheduling && (
        <RescheduleModal
          patientName={rescheduling.patient_name ?? undefined}
          onClose={() => setRescheduling(null)}
          onConfirm={async payload => {
            const err = await rescheduleHospitalAppointment(rescheduling.id, payload)
            if (err) return err
            setRescheduling(null)
            await load()
            return null
          }}
        />
      )}
    </Screen>
  )
}
