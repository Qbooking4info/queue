import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Glass } from '@queue/shared/components/ui/Glass'
import { MetricCard } from '@queue/shared/components/ui/MetricCard'
import { Ticks, Gauge, Pill } from '@queue/shared/components/ui/DataViz'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'
import { ShellScroll } from '@queue/shared/components/AppShell'
import { getMyDoctorStats, updateMyAvailability, type DoctorAvailability } from '@queue/shared/lib/api'

interface Props { navigation: any }

const AVAIL_OPTIONS: { key: DoctorAvailability; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'on_duty',  label: 'On Duty',  icon: 'radio-button-on' },
  { key: 'on_break', label: 'On Break', icon: 'cafe-outline' },
  { key: 'off_duty', label: 'Off Duty', icon: 'moon-outline' },
]

export function DoctorDashboardScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [todayCount, setTodayCount] = useState(0)
  const [pendingDirect, setPendingDirect] = useState(0)
  const [monthCompleted, setMonthCompleted] = useState(0)
  const [avgConsultSecs, setAvgConsultSecs] = useState<number | null>(null)
  const [todayCompleted, setTodayCompleted] = useState(0)
  const [inQueue, setInQueue] = useState(0)
  const [queueEmergencies, setQueueEmergencies] = useState(0)
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null)
  const [savingAvailability, setSavingAvailability] = useState(false)

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
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
          // Seen today, for the progress dial: how far through the day's list we are.
          supabase.from('appointments').select('*', { count: 'exact', head: true })
            .eq('doctor_id', doctorProfile.doctorId).eq('appointment_date', today).eq('status', 'completed'),
          // Waiting right now. check_in_date, not appointment_date: someone booked for
          // another day who physically checked in today is in today's queue, which is
          // the same convention get_doctor_queue uses.
          supabase.from('appointments').select('*', { count: 'exact', head: true })
            .eq('doctor_id', doctorProfile.doctorId).eq('check_in_date', today).eq('status', 'checked_in'),
          supabase.from('appointments').select('*', { count: 'exact', head: true })
            .eq('doctor_id', doctorProfile.doctorId).eq('check_in_date', today).eq('status', 'checked_in')
            .eq('urgency', 'emergency'),
        )
      }

      const [results, stats, availRow] = await Promise.all([
        Promise.all(queries),
        doctorProfile ? getMyDoctorStats() : Promise.resolve(null),
        doctorProfile
          ? supabase.from('doctors').select('availability_status').eq('id', doctorProfile.doctorId).single()
          : Promise.resolve({ data: null }),
      ])
      if (cancelled) return
      setPendingDirect(results[0].count ?? 0)
      setMonthCompleted(results[1].count ?? 0)
      setTodayCount(doctorProfile ? (results[2]?.count ?? 0) : 0)
      setTodayCompleted(doctorProfile ? (results[3]?.count ?? 0) : 0)
      setInQueue(doctorProfile ? (results[4]?.count ?? 0) : 0)
      setQueueEmergencies(doctorProfile ? (results[5]?.count ?? 0) : 0)
      setAvgConsultSecs(stats?.avgConsultSecs ?? null)
      setAvailability(((availRow as any)?.data?.availability_status as DoctorAvailability) ?? null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, doctorProfile]))

  const firstName = (doctorProfile?.fullName ?? user?.full_name ?? '').split(' ')[0] || 'there'

  async function changeAvailability(status: DoctorAvailability) {
    if (status === availability || savingAvailability) return
    const prev = availability
    setAvailability(status) // optimistic -- this is the same status hospital staff see live
    setSavingAvailability(true)
    haptics.tap()
    const error = await updateMyAvailability(status)
    setSavingAvailability(false)
    if (error) { haptics.error(); setAvailability(prev) } else { haptics.success() }
  }

  return (
      <ShellScroll>
        <Text style={{ fontSize: 28, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.5, marginBottom: 4 }}>
          Welcome, Dr. {firstName}
        </Text>
        <Text style={{ fontSize: 15, color: t.textMuted, marginBottom: 24 }}>
          Here's what's happening across your practice.
        </Text>

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {doctorProfile && availability && (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
                {AVAIL_OPTIONS.map(opt => {
                  const active = availability === opt.key
                  return (
                    <TouchableOpacity key={opt.key} onPress={() => changeAvailability(opt.key)}
                      disabled={savingAvailability}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                        paddingVertical: 9, borderRadius: 12, borderWidth: 1,
                        backgroundColor: active ? t.accentBg : t.cardBg,
                        borderColor: active ? t.accentBorder : t.cardBorder,
                        opacity: savingAvailability && !active ? 0.5 : 1,
                      }}>
                      <Ionicons name={opt.icon} size={12} color={active ? t.accent : t.textMuted} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? t.accent : t.textMuted }}>{opt.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Tick counts here encode the real figures rather than decorating: one tick
                per person waiting (emergencies at full height), and one tick per patient
                on today's list, lit as each is seen. */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                onPress={() => { haptics.tap(); navigation.navigate('Queue') }} disabled={!doctorProfile}>
                <MetricCard
                  icon="people-outline" title="In queue"
                  sub={queueEmergencies > 0 ? `${queueEmergencies} emergency` : 'None urgent'}
                  value={inQueue} unit={inQueue === 1 ? 'patient' : 'patients'}
                  tone={queueEmergencies > 0 ? t.danger : undefined}
                  iconColor={queueEmergencies > 0 ? t.danger : t.accent}
                  chart={<Ticks
                    data={inQueue ? Array.from({ length: Math.min(inQueue, 14) }, (_, i) => (i < queueEmergencies ? 1 : 0.45)) : [0]}
                  />}
                />
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                onPress={() => { haptics.tap(); navigation.navigate('Queue') }} disabled={!doctorProfile}>
                <MetricCard
                  icon="medkit-outline" title="Seen today"
                  sub={avgConsultSecs == null ? 'No consults yet' : `Avg ${Math.round(avgConsultSecs / 60)} min`}
                  value={todayCompleted} unit={todayCompleted === 1 ? 'visit' : 'visits'}
                  chart={<Ticks
                    data={todayCount ? Array.from({ length: Math.min(todayCount, 14) }, () => 0.5) : [0]}
                    highlight={todayCompleted > 0 ? Math.min(todayCompleted, 14) - 1 : undefined}
                  />}
                />
              </TouchableOpacity>
            </View>

            {/* Progress through today's list. Real: completed over today's non-cancelled
                appointments, not a notional slot capacity the schedule doesn't publish. */}
            {doctorProfile && (
              <Glass radius={22} pad={16} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                <Gauge
                  fraction={todayCount ? todayCompleted / todayCount : 0}
                  caption={todayCompleted}
                  sub={`of ${todayCount}`}
                  size={112}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.textPrimary }}>Today's list</Text>
                  <Text style={{ fontSize: 12, color: t.textSecondary, marginTop: 3, lineHeight: 17 }}>
                    {todayCount === 0
                      ? 'Nothing booked for today yet.'
                      : todayCompleted >= todayCount
                        ? 'Everyone booked for today has been seen.'
                        : `${todayCount - todayCompleted} still to be seen${inQueue ? `, ${inQueue} waiting now` : ''}.`}
                  </Text>
                  <View style={{ marginTop: 10, flexDirection: 'row' }}>
                    <Pill
                      label={availability === 'on_duty' ? 'On duty' : availability === 'on_break' ? 'On break' : 'Off duty'}
                      tone={availability === 'on_duty' ? 'statusOpen' : availability === 'on_break' ? 'statusBusy' : 'statusNeutral'}
                      dot={availability === 'on_duty'}
                    />
                  </View>
                </View>
              </Glass>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                onPress={() => { haptics.tap(); navigation.navigate('Appointments') }}>
                <MetricCard
                  icon="hourglass-outline" title="Pending" sub="Awaiting your review"
                  value={pendingDirect} unit={pendingDirect === 1 ? 'request' : 'requests'}
                  tone={pendingDirect > 0 ? t.accent : undefined}
                />
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
                onPress={() => { haptics.tap(); navigation.navigate('Appointments') }}>
                <MetricCard
                  icon="checkmark-done-outline" title="This month" sub="Completed visits"
                  value={monthCompleted} unit="visits"
                />
              </TouchableOpacity>
            </View>

            {!doctorProfile && (
              <View style={{ backgroundColor: t.accentBg, borderColor: t.accentBorder, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: t.accent, marginBottom: 4 }}>Not linked to a hospital yet</Text>
                <Text style={{ fontSize: 14, color: t.textSecondary, marginBottom: 10 }}>
                  You can still accept direct virtual consults and home visits from patients. Turn those on in Settings,
                  or share your Doctor ID with a hospital to also see their queue here.
                </Text>
                <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Hospitals') }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>View your Doctor ID →</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <QuickLink theme={t} icon="calendar-outline" label="Review appointments" onPress={() => navigation.navigate('Appointments')} />
              <QuickLink theme={t} icon="bar-chart-outline" label="My Analytics" onPress={() => navigation.navigate('DoctorAnalytics')} />
              <QuickLink theme={t} icon="settings-outline" label="Edit settings & fees" onPress={() => navigation.navigate('Settings')} />
              <QuickLink theme={t} icon="business-outline" label="Hospitals & Doctor ID" onPress={() => navigation.navigate('Hospitals')} />
            </View>
          </>
        )}
      </ShellScroll>
  )
}

// StatCard lived here. MetricCard now carries these figures, with a chart that
// encodes the real counts, so the plain icon-and-number tile had no callers left.

function QuickLink({ theme: t, icon, label, onPress }: {
  theme: any; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void
}) {
  return (
    <TouchableOpacity onPress={() => { haptics.tap(); onPress() }}>
      <Glass radius={999} pad={0} blur={false}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingVertical: 10, paddingHorizontal: 16,
        }}>
          <Ionicons name={icon} size={15} color={t.accent} />
          <Text style={{ fontSize: 14, fontWeight: '500', color: t.textPrimary }}>{label}</Text>
        </View>
      </Glass>
    </TouchableOpacity>
  )
}
