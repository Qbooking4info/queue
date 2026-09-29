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
import {
  getMyDoctorStats, updateMyAvailability, getMyDoctorClinics, switchMyActiveClinic,
  type DoctorAvailability, type DoctorClinicOption,
} from '@queue/shared/lib/api'
import { useMorningNudge } from '@queue/shared/hooks/useMorningNudge'
import { Flashing } from '@queue/shared/components/ui/DataViz'
import { Dropdown } from '@queue/shared/components/ui/Dropdown'

interface Props { navigation: any }

// Bright by request, with the foreground picked per colour rather than one shared
// text colour: measured against each fill, near-black reads 7.39:1 on the green and
// 11.00:1 on the yellow, while white reads 4.83:1 on the red. A single foreground
// would have failed on at least one of the three.
const DUTY_STATES: {
  key: DoctorAvailability; label: string; icon: keyof typeof Ionicons.glyphMap
  bg: string; fg: string
}[] = [
  { key: 'on_duty',  label: 'On duty',  icon: 'radio-button-on', bg: '#22C55E', fg: '#10210F' },
  { key: 'on_break', label: 'On break', icon: 'cafe-outline',    bg: '#FACC15', fg: '#10210F' },
  { key: 'off_duty', label: 'Off duty', icon: 'moon-outline',    bg: '#DC2626', fg: '#FFFFFF' },
]

export function DoctorDashboardScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile, switchHospital } = useAuth()
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
  const [clinics, setClinics] = useState<DoctorClinicOption[]>([])
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null)
  const [clinicSwitching, setClinicSwitching] = useState(false)
  const [hospitalSwitching, setHospitalSwitching] = useState(false)

  // Two independent nudges: confirming you are on duty and confirming which clinic
  // you are sitting in are separate decisions, so acknowledging one must not silence
  // the other.
  const dutyNudge   = useMorningNudge('qb_doctor_duty_ack')
  // Key renamed from ..._clinic_ack now it covers hospital as well as clinic. The
  // only cost of the rename is one extra nudge on the day of the upgrade.
  const contextNudge = useMorningNudge('qb_doctor_context_ack')

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

      const [results, stats, availRow, clinicRes] = await Promise.all([
        Promise.all(queries),
        doctorProfile ? getMyDoctorStats() : Promise.resolve(null),
        doctorProfile
          ? supabase.from('doctors').select('availability_status').eq('id', doctorProfile.doctorId).single()
          : Promise.resolve({ data: null }),
        doctorProfile ? getMyDoctorClinics().catch(() => null) : Promise.resolve(null),
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
      setClinics(clinicRes?.clinics ?? [])
      setActiveClinicId(clinicRes?.activeClinicId ?? null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, doctorProfile]))

  async function changeClinic(clinicId: string) {
    contextNudge.acknowledge()
    if (clinicId === activeClinicId || clinicSwitching) return
    const prev = activeClinicId
    setActiveClinicId(clinicId)   // optimistic, same as availability above
    setClinicSwitching(true)
    haptics.tap()
    const err = await switchMyActiveClinic(clinicId)
    if (err) setActiveClinicId(prev)
    setClinicSwitching(false)
  }

  async function changeHospital(hospitalId: string) {
    contextNudge.acknowledge()
    if (hospitalId === doctorProfile?.hospitalId || hospitalSwitching) return
    setHospitalSwitching(true)
    haptics.tap()
    // Not optimistic, unlike duty and clinic: switching hospital re-resolves the
    // whole doctor profile in AuthContext (a different doctors row, different
    // queue), so the screen must follow that rather than guess ahead of it.
    await switchHospital(hospitalId)
    setHospitalSwitching(false)
  }

  const hospitalOptions = (doctorProfile?.linkedHospitals ?? [])
    .map(h => ({ key: h.hospitalId, label: h.hospitalName }))
  const hasHospitalLink = hospitalOptions.length > 0
  // Only flash when something can actually be changed -- nudging someone to confirm
  // a value they have no way to alter is just noise.
  const canSwitchContext = hospitalOptions.length > 1 || clinics.length > 1

  const firstName = (doctorProfile?.fullName ?? user?.full_name ?? '').split(' ')[0] || 'there'

  async function changeAvailability(status: DoctorAvailability) {
    dutyNudge.acknowledge()
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
            {/* Duty and active clinic, side by side. Both flash from 7am each day
                until touched -- a doctor who forgets to come on duty receives no
                patients, and one sitting in the wrong clinic gets the wrong queue,
                and neither failure announces itself. */}
            {doctorProfile && availability && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, alignItems: 'stretch' }}>
                <Flashing active={dutyNudge.nudging} radius={18} color={t.accent} style={{ flex: 1 }}>
                  <View style={{
                    borderRadius: 18, padding: 10, gap: 6,
                    backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.cardBorder,
                  }}>
                    <Text style={{
                      fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
                      color: t.textSecondary, marginLeft: 2, marginBottom: 1,
                    }}>
                      MY STATUS
                    </Text>
                    {/* Stacked, so the three states read as one control with one
                        selected rather than three competing buttons. */}
                    {DUTY_STATES.map(opt => {
                      const active = availability === opt.key
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => changeAvailability(opt.key)}
                          disabled={savingAvailability}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 7,
                            paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12,
                            backgroundColor: active ? opt.bg : t.canvasBg,
                            borderWidth: 1,
                            borderColor: active ? opt.bg : t.cardBorder,
                            opacity: savingAvailability && !active ? 0.5 : 1,
                          }}
                        >
                          <Ionicons name={opt.icon} size={13} color={active ? opt.fg : t.textSecondary} />
                          <Text style={{
                            fontSize: 12.5, fontWeight: active ? '800' : '600',
                            color: active ? opt.fg : t.textSecondary,
                          }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </Flashing>

                {/* Where the doctor is working right now. Previously this only
                    appeared when assigned to more than one clinic, which hid it from
                    almost everyone -- exactly one doctor in the database has two
                    clinics. It is shown whenever there is a hospital link at all,
                    because confirming where you are is worth doing even when there is
                    nothing to change, and switches to a Dropdown per line only where a
                    real choice exists. */}
                {hasHospitalLink && (
                  <Flashing active={canSwitchContext && contextNudge.nudging} radius={18} color={t.accent} style={{ flex: 1 }}>
                    <View style={{
                      flex: 1, borderRadius: 18, padding: 10, gap: 6,
                      backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.cardBorder,
                    }}>
                      <Text style={{
                        fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
                        color: t.textSecondary, marginLeft: 2, marginBottom: 1,
                      }}>
                        WHERE I AM
                      </Text>

                      {hospitalOptions.length > 1 ? (
                        <Dropdown
                          label="Active hospital"
                          icon="medkit-outline"
                          value={doctorProfile?.hospitalId ?? ''}
                          options={hospitalOptions}
                          onChange={changeHospital}
                          disabled={hospitalSwitching}
                        />
                      ) : (
                        <ContextLine
                          theme={t} icon="medkit-outline"
                          value={hospitalOptions[0]?.label ?? '—'}
                        />
                      )}

                      {clinics.length > 1 ? (
                        <Dropdown
                          label="Active clinic"
                          icon="git-branch-outline"
                          value={activeClinicId ?? ''}
                          options={clinics.map(c => ({ key: c.clinicId, label: c.clinicName }))}
                          onChange={changeClinic}
                          disabled={clinicSwitching}
                        />
                      ) : clinics.length === 1 ? (
                        <ContextLine theme={t} icon="git-branch-outline" value={clinics[0].clinicName} />
                      ) : null}

                      <Text style={{ fontSize: 11, color: t.textSecondary, marginTop: 2, lineHeight: 15 }}>
                        {hospitalSwitching || clinicSwitching
                          ? 'Switching…'
                          : canSwitchContext
                            ? "This is the queue you're seeing. Tap to change."
                            : "This is the queue you're seeing."}
                      </Text>
                    </View>
                  </Flashing>
                )}
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

          </>
        )}
      </ShellScroll>
  )
}

// StatCard lived here. MetricCard now carries these figures, with a chart that
// encodes the real counts, so the plain icon-and-number tile had no callers left.

// QuickLink moved to SpecialistProfileScreen: these four are navigation, which
// belongs on the profile tab, not competing with the day's figures on Home.

// One line of "where I am" when there is no choice to make: same shape as a
// Dropdown's trigger so the tile reads consistently whether or not it can switch,
// but without a chevron that would imply a menu that isn't there.
function ContextLine({ theme: t, icon, value }: {
  theme: any; icon: keyof typeof Ionicons.glyphMap; value: string
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12,
      backgroundColor: t.canvasBg, borderWidth: 1, borderColor: t.cardBorder,
    }}>
      <Ionicons name={icon} size={13} color={t.accent} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: t.textPrimary }}>
        {value}
      </Text>
    </View>
  )
}
