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
import { Header, HeaderIconButton, KpiCard, Card, SectionTitle, ListRow, PrimaryButton, SegmentedControl, HeaderTail } from '@queue/shared/components/ui/v3'
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
      <Header title={`${greeting}, Dr. ${firstName}`}
        subtitle={doctorProfile ? (availability === 'on_duty' ? 'On duty' : availability === 'on_break' ? 'On a break · call in paused' : 'Off duty · call in paused') : "Here's your practice today"}
        right={<ProfileAvatar size={44} name={doctorProfile?.fullName} onPress={() => navigation.navigate('SpecialistProfile')} />}>
        {doctorProfile && (
          <SegmentedControl<DoctorAvailability> onDark value={availability} onChange={changeAvailability}
            options={[{ value: 'on_duty', label: 'On duty' }, { value: 'on_break', label: 'Break' }, { value: 'off_duty', label: 'Off' }]} />
        )}
      </Header>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.accent} onRefresh={() => { setRefreshing(true); setReloadTick(n => n + 1) }} />}>
        <HeaderTail />
        {loading ? (
          <View style={{ gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
        ) : (
          <>
            {doctorProfile && (next ? (
              <Card style={{ gap: 12, borderColor: next.urgency === 'emergency' ? t.dangerBorder : t.cardBorder,
                shadowColor: '#0B1B1E', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: next.urgency === 'emergency' ? t.danger : t.accent }}>
                    {next.urgency === 'emergency' ? 'EMERGENCY · NEXT' : 'NEXT PATIENT'}{next.start_time ? ` · ${next.start_time.slice(0, 5)}` : ''}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: t.textMuted }}>{waitingCount} waiting</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: t.accent }}>
                      {(next.patient_name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>{next.patient_name ?? 'Patient'}</Text>
                    <Text style={{ fontSize: 13, color: t.textMuted }} numberOfLines={1}>
                      {[next.status === 'checked_in' ? 'Checked in' : 'Not checked in yet', next.type === 'virtual' ? 'Video' : null, next.reason].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: t.accentBg, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="pulse-outline" size={16} color={t.accent} />
                  <Text style={{ flex: 1, fontSize: 13, color: t.textSecondary }}>{vitalsLine || 'No vitals recorded yet'}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton variant="ghost" height={48} label="Open" onPress={() => navigation.navigate('PatientConsult', { appointmentId: next.id })} />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <PrimaryButton height={48} icon="notifications-outline" label={canCall ? 'Call in' : 'Paused'} loading={ringing}
                      disabled={!canCall} onPress={callIn} />
                  </View>
                </View>
              </Card>
            ) : (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cafe-outline" size={22} color={t.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>No one waiting</Text>
                  <Text style={{ fontSize: 13, color: t.textMuted }}>New patients appear here as they check in.</Text>
                </View>
              </Card>
            ))}

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <KpiCard icon="people-outline" label="Today's patients" value={todayCount}
                onPress={() => navigation.navigate('Queue')} disabled={!doctorProfile} />
              <KpiCard icon="hourglass-outline" label="Pending requests" value={pendingDirect}
                onPress={() => navigation.navigate('Appointments')} highlight={pendingDirect > 0} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <KpiCard icon="checkmark-done-outline" label="Completed this month" value={monthCompleted}
                onPress={() => navigation.navigate('Appointments')} />
              <KpiCard icon="time-outline" label="Avg. consult time"
                value={avgConsultSecs == null ? '—' : `${Math.round(avgConsultSecs / 60)}m`}
                onPress={() => navigation.navigate('Queue')} disabled={!doctorProfile} />
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

            <SectionTitle title="Quick actions" />
            <Card style={{ paddingVertical: 0 }}>
              <ListRow icon="list-outline" title="My queue" subtitle="Call in your next patient" onPress={() => navigation.navigate('Queue')} />
              <ListRow icon="calendar-outline" title="Review appointments" subtitle={pendingDirect ? `${pendingDirect} waiting for you` : 'Requests and upcoming visits'} onPress={() => navigation.navigate('Appointments')} />
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
