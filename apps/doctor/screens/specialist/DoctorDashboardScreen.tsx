import { useCallback, useState } from 'react'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { haptics } from '@queue/shared/lib/haptics'
import { View, ScrollView, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { todayLocalDate } from '@queue/shared/lib/format'
import { KpiCard, Card, SectionTitle, ListRow, PrimaryButton, SegmentedControl } from '@queue/shared/components/ui/v3'
import {
  TopBar, TopBarButton, SectionHead, HeroCard, HeroBody, CountTile,
  StatGrid, QuickRow, QuickTile,
} from '@queue/shared/components/ui/home'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { getMyDoctorStats, setMyAvailability, ringPatient, type DoctorAvailability } from '@queue/shared/lib/api'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'

// Next patient in today's queue: emergencies first, then whoever is checked in, then by position.
interface NextPatient {
  id: string; patient_name: string | null; reason: string | null; urgency: string | null
  status: string; start_time: string; queue_position: number | null; type: string
}
interface Vitals { bp_systolic: number | null; bp_diastolic: number | null; weight_kg: number | null; blood_sugar: number | null }
const WAITING = ['pending', 'confirmed', 'checked_in']
const rank = (a: NextPatient) => (a.urgency === 'emergency' ? 0 : 10) + (a.status === 'checked_in' ? 0 : 5)

interface Props { navigation: any }

function longDate(d = new Date()) {
  return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function DoctorDashboardScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [todayCount, setTodayCount] = useState(0)
  const [pendingDirect, setPendingDirect] = useState(0)
  const [monthCompleted, setMonthCompleted] = useState(0)
  const [avgConsultSecs, setAvgConsultSecs] = useState<number | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [availability, setAvailability] = useState<DoctorAvailability>('on_duty')
  const [next, setNext] = useState<NextPatient | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [waitingCount, setWaitingCount] = useState(0)
  const [ringing, setRinging] = useState(false)

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      if (!refreshing) setLoading(true)
      const today = todayLocalDate()
      const monthStart = today.slice(0, 7) + '-01'

      const queries = [
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('doctor_user_id', user?.id ?? '').eq('status', 'pending').eq('approval_status', 'pending_review'),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('doctor_user_id', user?.id ?? '').eq('status', 'completed').gte('appointment_date', monthStart),
      ]
      if (doctorProfile) {
        queries.push(
          supabase.from('appointments').select('*', { count: 'exact', head: true })
            .eq('doctor_id', doctorProfile.doctorId).eq('appointment_date', today).neq('status', 'cancelled'),
        )
      }

      const [results, stats, availRes, queueRes] = await Promise.all([
        Promise.all(queries),
        doctorProfile ? getMyDoctorStats() : Promise.resolve(null),
        doctorProfile ? supabase.from('doctors').select('availability_status').eq('id', doctorProfile.doctorId).maybeSingle() : Promise.resolve({ data: null }),
        doctorProfile ? supabase.rpc('get_doctor_queue', { p_doctor_id: doctorProfile.doctorId, p_date: today, p_today: today }) : Promise.resolve({ data: [] }),
      ])
      const waiting = (((queueRes as any).data ?? []) as NextPatient[]).filter(a => WAITING.includes(a.status))
        .sort((a, b) => rank(a) - rank(b) || (a.queue_position ?? 999) - (b.queue_position ?? 999))
      const first = waiting[0] ?? null
      const v = first ? (await supabase.from('vitals_audit_log').select('bp_systolic, bp_diastolic, weight_kg, blood_sugar')
        .eq('appointment_id', first.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle()).data : null
      if (cancelled) return
      setPendingDirect(results[0].count ?? 0)
      setMonthCompleted(results[1].count ?? 0)
      setTodayCount(doctorProfile ? (results[2]?.count ?? 0) : 0)
      setAvgConsultSecs(stats?.avgConsultSecs ?? null)
      const av = (availRes as any).data?.availability_status
      if (av === 'on_duty' || av === 'on_break' || av === 'off_duty') setAvailability(av)
      setWaitingCount(waiting.length)
      setNext(first)
      setVitals((v as Vitals | null) ?? null)
      setLoading(false)
      setRefreshing(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, doctorProfile, reloadTick]))

  const firstName = (doctorProfile?.fullName ?? user?.full_name ?? '').split(' ')[0] || 'there'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

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

  const canCall = availability === 'on_duty'
  const vitalsLine = vitals ? [
    vitals.bp_systolic && vitals.bp_diastolic ? `BP ${vitals.bp_systolic}/${vitals.bp_diastolic}` : null,
    vitals.weight_kg ? `${vitals.weight_kg} kg` : null,
    vitals.blood_sugar ? `Sugar ${vitals.blood_sugar}` : null,
  ].filter(Boolean).join(' · ') : ''

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <TopBar
        avatar={<ProfileAvatar size={40} name={doctorProfile?.fullName} onPress={() => navigation.navigate('SpecialistProfile')} />}
        eyebrow={longDate()}
        title={`${greeting}, Dr. ${firstName}`}
        onAvatarPress={() => navigation.navigate('SpecialistProfile')}
        right={<TopBarButton icon="person-circle-outline" label="Your profile"
          onPress={() => navigation.navigate('SpecialistProfile')} />}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.accent} onRefresh={() => { setRefreshing(true); setReloadTick(n => n + 1) }} />}>
        {/* Duty status moved out of the header and onto the page, where the
            rest of the controls now live. */}
        {doctorProfile && (
          <SegmentedControl<DoctorAvailability> value={availability} onChange={changeAvailability}
            options={[{ value: 'on_duty', label: 'On duty' }, { value: 'on_break', label: 'Break' }, { value: 'off_duty', label: 'Off' }]} />
        )}
        {loading ? (
          <View style={{ gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
        ) : (
          <>
            {doctorProfile && (
              <HeroCard
                eyebrow={next
                  ? (next.urgency === 'emergency' ? 'EMERGENCY · NEXT' : 'NEXT PATIENT')
                  : 'WAITING ROOM'}
                status={{
                  label: availability === 'on_duty' ? 'Accepting patients'
                       : availability === 'on_break' ? 'On a break' : 'Not accepting',
                  icon: availability === 'on_duty' ? 'checkmark-circle' : 'pause-circle',
                }}
                onPress={next ? () => navigation.navigate('PatientConsult', { appointmentId: next.id }) : undefined}
                footer={[
                  { label: "Today's schedule", icon: 'calendar-outline', onPress: () => navigation.navigate('Appointments') },
                  { label: 'Open queue', icon: 'list-outline', onPress: () => navigation.navigate('Queue') },
                ]}
              >
                <HeroBody
                  leading={<CountTile value={waitingCount} label="waiting" />}
                  title={next ? (next.patient_name ?? 'Patient') : 'No patients waiting'}
                  subtitle={next
                    ? [next.start_time ? next.start_time.slice(0, 5) : null, next.reason].filter(Boolean).join(' · ') || null
                    : 'Patients appear here as soon as they check in.'}
                  meta={next && canCall ? 'Tap to open the consultation' : null}
                />
              </HeroCard>
            )}

            <View style={{ gap: 10 }}>
              <SectionHead title="Today at a glance" action="Insights"
                onAction={() => navigation.navigate('DoctorAnalytics')} />
              <StatGrid items={[
                { label: "Patients today", value: todayCount,
                  onPress: doctorProfile ? () => navigation.navigate('Queue') : undefined },
                { label: 'Pending requests', value: pendingDirect,
                  onPress: () => navigation.navigate('Appointments') },
                { label: 'Completed this month', value: monthCompleted,
                  onPress: () => navigation.navigate('Appointments') },
                // Muted when there is nothing yet, so an empty figure does not
                // read as a real measurement of zero.
                avgConsultSecs == null
                  ? { label: 'Avg. consult time', value: '— no data yet', muted: true }
                  : { label: 'Avg. consult time', value: `${Math.round(avgConsultSecs / 60)}m`,
                      onPress: () => navigation.navigate('Queue') },
              ]} />
            </View>

            {!doctorProfile && (
              <Card style={{ gap: 8, backgroundColor: t.accentBg, borderColor: t.accentBorder }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: t.accent }}>Not linked to a hospital yet</Text>
                <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 19 }}>
                  You can still accept direct virtual consults and home visits from patients. Turn those on in Settings,
                  or share your Doctor ID with a hospital to also see their queue here.
                </Text>
                <PrimaryButton variant="ghost" height={48} icon="qr-code-outline" label="View your Doctor ID"
                  onPress={() => navigation.navigate('Hospitals')} />
              </Card>
            )}

            <View style={{ gap: 12 }}>
              <SectionHead title="Quick actions" />
              <QuickRow>
                <QuickTile icon="calendar-clear" label="Availability" color="#4FD1B0"
                  onPress={() => navigation.navigate('Settings')} />
                <QuickTile icon="videocam" label="Start call" color="#7C9BF2"
                  onPress={() => navigation.navigate('Queue')} />
                <QuickTile icon="document-text" label="Prescribe" color="#F0B254"
                  onPress={() => navigation.navigate('Queue')} />
                <QuickTile icon="people" label="Patients" color="#6EE7C0"
                  onPress={() => navigation.navigate('Appointments')} />
              </QuickRow>
            </View>

            {/* The rest of the menu still belongs somewhere, just not as four
                more taps competing with the tiles above. */}
            <Card style={{ paddingVertical: 0 }}>
              <ListRow icon="chatbubble-ellipses-outline" title="Messages" subtitle="Chat consults with your patients" onPress={() => navigation.navigate('Messages')} />
              <ListRow icon="business-outline" title="Hospitals & Doctor ID" onPress={() => navigation.navigate('Hospitals')} />
              <ListRow icon="cash-outline" title="Settings & fees" last onPress={() => navigation.navigate('Settings')} />
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  )
}
