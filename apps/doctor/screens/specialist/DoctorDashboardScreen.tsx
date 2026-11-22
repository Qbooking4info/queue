import { useCallback, useState } from 'react'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { haptics } from '@queue/shared/lib/haptics'
import { View, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { todayLocalDate } from '@queue/shared/lib/format'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, DayBar, Stat, StatStrip,
  Seg, Btn, BottomBar, Initials, Mono, Notice,
} from '@queue/shared/components/q'
import {
  getMyDoctorStats, setMyAvailability, ringPatient, getHospitalHours,
  type DoctorAvailability, type DayHours,
} from '@queue/shared/lib/api'
import { useUnreadMessages } from '@queue/shared/hooks/useUnreadMessages'
import { useOpenLocumJobs } from '@queue/shared/hooks/useOpenLocumJobs'
import { compareQueueEntries } from '@queue/shared/lib/queueOrder'

// Next patient in today's queue: emergencies first, then whoever is checked in, then by position.
interface NextPatient {
  id: string; patient_name: string | null; reason: string | null; urgency: string | null
  status: string; start_time: string; queue_position: number | null; type: string
}
const WAITING = ['pending', 'confirmed', 'checked_in']
const rank = (a: NextPatient) => (a.urgency === 'emergency' ? 0 : 10) + (a.status === 'checked_in' ? 0 : 5)

interface Props { navigation: any }

export function DoctorDashboardScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [todayCount, setTodayCount] = useState(0)
  const [pendingDirect, setPendingDirect] = useState(0)
  const [pendingReferrals, setPendingReferrals] = useState(0)
  const [avgConsultSecs, setAvgConsultSecs] = useState<number | null>(null)
  const [hours, setHours] = useState<DayHours[] | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [availability, setAvailability] = useState<DoctorAvailability>('on_duty')
  const [next, setNext] = useState<NextPatient | null>(null)
  const [waitingCount, setWaitingCount] = useState(0)
  const [ringing, setRinging] = useState(false)
  const unread = useUnreadMessages('doctor')
  const openJobs = useOpenLocumJobs(true)

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      if (!refreshing) setLoading(true)
      const today = todayLocalDate()

      const queries = [
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('doctor_user_id', user?.id ?? '').eq('status', 'pending').eq('approval_status', 'pending_review'),
      ]
      if (doctorProfile) {
        queries.push(
          supabase.from('appointments').select('*', { count: 'exact', head: true })
            .eq('doctor_id', doctorProfile.doctorId).eq('appointment_date', today).neq('status', 'cancelled'),
          // Referrals addressed to this doctor that the receiving hospital has
          // not decided yet -- the Inbox tab's own figure, shown here so Home
          // says what is waiting without opening it.
          supabase.from('appointments').select('*', { count: 'exact', head: true })
            .eq('doctor_id', doctorProfile.doctorId).eq('booking_mode', 'referral')
            .eq('approval_status', 'pending_approval'),
        )
      }

      const [results, stats, availRes, queueRes, hrs] = await Promise.all([
        Promise.all(queries),
        doctorProfile ? getMyDoctorStats() : Promise.resolve(null),
        doctorProfile ? supabase.from('doctors').select('availability_status').eq('id', doctorProfile.doctorId).maybeSingle() : Promise.resolve({ data: null }),
        doctorProfile ? supabase.rpc('get_doctor_queue', { p_doctor_id: doctorProfile.doctorId, p_date: today, p_today: today }) : Promise.resolve({ data: [] }),
        doctorProfile ? getHospitalHours(doctorProfile.hospitalId).catch(() => null) : Promise.resolve(null),
      ])
      const waiting = (((queueRes as any).data ?? []) as NextPatient[]).filter(a => WAITING.includes(a.status))
        .sort((a, b) => rank(a) - rank(b) || compareQueueEntries(a, b))
      if (cancelled) return
      setPendingDirect(results[0].count ?? 0)
      setTodayCount(doctorProfile ? (results[1]?.count ?? 0) : 0)
      setPendingReferrals(doctorProfile ? (results[2]?.count ?? 0) : 0)
      setAvgConsultSecs(stats?.avgConsultSecs ?? null)
      setHours(hrs)
      const av = (availRes as any).data?.availability_status
      if (av === 'on_duty' || av === 'on_break' || av === 'off_duty') setAvailability(av)
      setWaitingCount(waiting.length)
      setNext(waiting[0] ?? null)
      setLoading(false)
      setRefreshing(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, doctorProfile, reloadTick]))

  async function changeAvailability(v: DoctorAvailability) {
    const prev = availability
    setAvailability(v)
    const err = await setMyAvailability(v)
    if (err) { haptics.error(); setAvailability(prev); Alert.alert('Availability', err) }
    else haptics.success()
  }

  async function callIn() {
    if (!next) return
    setRinging(true)
    const { error } = await ringPatient(next.id)
    setRinging(false)
    if (error) { haptics.error(); Alert.alert('Could not ring the patient', error) }
    else { haptics.success(); Alert.alert('Patient called', `${next.patient_name ?? 'The patient'} is being rung now.`) }
  }

  const name = doctorProfile?.fullName ?? user?.full_name ?? 'Doctor'
  const displayName = /^dr\b/i.test(name) ? name : `Dr ${name}`
  const hospitalName = doctorProfile
    ? doctorProfile.linkedHospitals.find(h => h.hospitalId === doctorProfile.hospitalId)?.hospitalName ?? null
    : null
  const today_ = hours?.find(h => h.day === new Date().getDay())
  const canCall = availability === 'on_duty' && !!next

  return (
    <Screen>
      <AppBar>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 10, paddingVertical: 12 }}>
          <Initials name={name} size={44} tint="#7C2D12" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.27, color: t.q.ink }}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: t.q.ink60 }}>
              {hospitalName ?? 'Direct bookings only'}
            </Text>
          </View>
          <Btn label="Profile" variant="secondary" small onPress={() => navigation.navigate('SpecialistProfile')} />
        </View>
      </AppBar>

      {/* The session bar is the active hospital's opening hours. A hospital that
          has not set hours gets no bar rather than an invented 08:00-18:00 day. */}
      {today_ && !today_.closed && (
        <DayBar label="Session" opensAt={today_.open.slice(0, 5)} closesAt={today_.close.slice(0, 5)} />
      )}

      {loading && !next && todayCount === 0 ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
            onRefresh={() => { setRefreshing(true); setReloadTick(n => n + 1) }} />
        }>
          {doctorProfile && (
            <View style={{ paddingTop: 2 }}>
              {/* Three states, not a switch: "on a break" is a real value in
                  `doctors.availability_status` and the front desk schedules
                  around it, so collapsing it into on/off would lose it. */}
              <Seg<DoctorAvailability>
                value={availability} onChange={changeAvailability}
                options={[
                  { key: 'on_duty', label: 'On duty' },
                  { key: 'on_break', label: 'On a break' },
                  { key: 'off_duty', label: 'Off duty' },
                ]} />
              <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60, marginTop: 4, marginHorizontal: 20 }}>
                {availability === 'on_duty' ? 'Patients are being assigned to you.'
                  : availability === 'on_break' ? 'The front desk can see you are away from your room.'
                  : 'No new patients will be assigned to you.'}
              </Text>
            </View>
          )}

          <SectionHead title="Today at a glance" action="Analytics"
            onAction={() => navigation.navigate('DoctorAnalytics')} />
          <Card>
            <StatStrip>
              <Stat
                label="Patients today" value={todayCount}
                note={waitingCount ? `${waitingCount} waiting` : 'nobody waiting'}
                onPress={doctorProfile ? () => navigation.navigate('Queue') : undefined} />
              <Stat
                label="Pending requests" value={pendingDirect}
                tone={pendingDirect > 0 ? 'amber' : undefined}
                note="video & home"
                onPress={() => navigation.navigate('Appointments')} />
              {/* Muted dash rather than a 0, so an empty figure does not read as
                  a real measurement of zero. */}
              <Stat
                label="Avg consult"
                value={avgConsultSecs == null ? '—' : Math.round(avgConsultSecs / 60)}
                unit={avgConsultSecs == null ? undefined : 'min'}
                note={avgConsultSecs == null ? 'no consults yet' : 'all time'}
                last
                onPress={() => navigation.navigate('DoctorAnalytics')} />
            </StatStrip>
          </Card>

          {(next != null || pendingReferrals > 0) && (
            <>
              <SectionHead title="Needs you now" />
              <Card>
                {next && (
                  <Row
                    icon={next.urgency === 'emergency' ? 'alert-circle' : 'person-outline'}
                    iconTone={next.urgency === 'emergency' ? 'red' : 'teal'}
                    number={next.queue_position ?? undefined}
                    title={next.patient_name ?? 'Patient'}
                    sub={[
                      next.urgency === 'emergency' ? 'Brought forward as an emergency' : null,
                      next.reason,
                      next.start_time ? next.start_time.slice(0, 5) : null,
                    ].filter(Boolean).join(' · ') || 'Next in your queue'}
                    titleColor={next.urgency === 'emergency' ? t.q.red : undefined}
                    chevron
                    onPress={() => navigation.navigate('PatientConsult', { appointmentId: next.id })} />
                )}
                {pendingReferrals > 0 && (
                  <>
                    {next && <Hair />}
                    <Row
                      icon="file-tray-outline" iconTone="amber"
                      title={`${pendingReferrals} referral${pendingReferrals === 1 ? '' : 's'} addressed to you`}
                      sub="Still waiting on the hospital's decision"
                      right={<Mono size={13} weight="700" color={t.q.amber}>{pendingReferrals}</Mono>}
                      chevron
                      onPress={() => navigation.navigate('ReferralInbox')} />
                  </>
                )}
              </Card>
            </>
          )}

          {!doctorProfile && (
            <View>
              <Notice tone="teal" icon="information-circle-outline">
                You are not linked to a hospital yet, so there is no queue here. You can still take direct
                video consults and home visits — turn those on in Settings & fees, or give your Doctor ID
                to a hospital admin to be added to their queue.
              </Notice>
              <View style={{ paddingHorizontal: 16 }}>
                <Btn label="View your Doctor ID" variant="secondary" icon="qr-code-outline"
                  onPress={() => navigation.navigate('Hospitals')} />
              </View>
            </View>
          )}

          <SectionHead title="Quick actions" />
          <Card>
            <Row icon="chatbubble-outline" title="Chat consults"
              sub={unread > 0 ? `${unread} unread from your patients` : 'Patients and your hospitals'}
              pill={unread > 0 ? String(unread) : undefined} pillTone="red"
              chevron onPress={() => navigation.navigate('Messages')} />
            <Hair />
            <Row icon="business-outline" title="Hospitals & Doctor ID"
              sub={doctorProfile
                ? `${doctorProfile.linkedHospitals.length} linked`
                : 'Link yourself to a hospital'}
              chevron onPress={() => navigation.navigate('Hospitals')} />
            <Hair />
            <Row icon="briefcase-outline" title="Locum board"
              sub={openJobs > 0 ? `${openJobs} open shift${openJobs === 1 ? '' : 's'} near you` : 'Shifts and posts'}
              pill={openJobs > 0 ? String(openJobs) : undefined} pillTone="teal"
              chevron onPress={() => navigation.navigate('LocumBoard')} />
            <Hair />
            <Row icon="trending-up-outline" title="My analytics" sub="Visits, wait times, show-up"
              chevron onPress={() => navigation.navigate('DoctorAnalytics')} />
            <Hair />
            <Row icon="options-outline" title="Settings & fees" sub="Availability, fees, virtual care"
              chevron onPress={() => navigation.navigate('Settings')} />
          </Card>
        </Body>
      )}

      {doctorProfile && (
        <BottomBar meta={<>
          <Mono size={12} weight="600" color={t.q.primary}>
            {next ? (next.patient_name ?? 'Patient') : 'Nobody waiting'}
          </Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12} weight="600">{waitingCount} waiting</Mono>
        </>}>
          <Btn grow label="Open queue" onPress={() => navigation.navigate('Queue')} />
          {canCall && (
            <Btn label="Call in" variant="secondary" icon="megaphone-outline" loading={ringing} onPress={callIn} />
          )}
        </BottomBar>
      )}
    </Screen>
  )
}
