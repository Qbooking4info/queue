import { useState, useCallback } from 'react'
import { View, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import {
  getTodayAppointments, getDoctorsOnDuty, getMyHospital, fmtLocalDate,
  type AdminAppointmentRow, type AdminDoctorRow,
} from '@queue/shared/lib/admin-api'
import { getHospitalHours, type DayHours } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { useUnreadMessages } from '@queue/shared/hooks/useUnreadMessages'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, DayBar, Stat, StatStrip,
  IconBtn, Empty, Initials, Mono, type PillTone,
} from '@queue/shared/components/q'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
// Same rule as the web banner (useInboundAmbulances): heading here, still live.
const LIVE = new Set(['matched', 'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination'])

/** Inbound ambulances, via the route the ambulance desk uses. Quiet on failure. */
async function fetchInbound(): Promise<{ count: number; soonestEta: number | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { count: 0, soonestEta: null }
    const res = await fetch(`${API_URL}/api/ambulances`, { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (!res.ok) return { count: 0, soonestEta: null }
    const body = await res.json()
    const live = ((body.requests ?? []) as { status: string; is_inbound?: boolean; eta_seconds?: number | null }[])
      .filter(r => r.is_inbound && LIVE.has(r.status))
    const etas = live.map(r => r.eta_seconds).filter((n): n is number => typeof n === 'number')
    return { count: live.length, soonestEta: etas.length ? Math.min(...etas) : null }
  } catch {
    return { count: 0, soonestEta: null }
  }
}

const AVAILABILITY: Record<string, { label: string; tone: PillTone }> = {
  on_duty: { label: 'On duty', tone: 'green' },
  on_break: { label: 'Break', tone: 'amber' },
  off_duty: { label: 'Off duty', tone: 'neutral' },
}

/** Minutes since an ISO timestamp, or null. */
function minutesSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - Date.parse(iso)
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60_000)) : null
}

function humanAge(mins: number | null): string | undefined {
  if (mins == null) return undefined
  if (mins < 60) return `oldest ${mins} min`
  return `oldest ${Math.floor(mins / 60)} h`
}

export function AdminDashboardScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()

  const [appts, setAppts] = useState<AdminAppointmentRow[]>([])
  const [doctors, setDoctors] = useState<AdminDoctorRow[]>([])
  const [hours, setHours] = useState<DayHours[] | null>(null)
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inbound, setInbound] = useState<{ count: number; soonestEta: number | null }>({ count: 0, soonestEta: null })
  const [approvals, setApprovals] = useState<{ count: number; oldestMins: number | null }>({ count: 0, oldestMins: null })
  const unreadMessages = useUnreadMessages('hospital')

  const hospitalId = staffProfile?.hospitalId
  const clinicId = staffProfile?.clinicId ?? null
  const isClinicScoped = staffProfile?.role === 'clinic_admin' && !!clinicId

  const load = useCallback(async (silent = false) => {
    // Without a hospital there is nothing to load and never will be. Returning
    // without clearing `loading` left the screen on skeletons for ever.
    if (!hospitalId) { setLoading(false); return }
    if (!silent) setLoading(true)

    // The oldest unapproved booking, not just how many: "3 waiting, oldest 2 h"
    // is the figure that decides whether this is urgent.
    let approvalsQ = supabase.from('appointments')
      .select('created_at')
      .eq('hospital_id', hospitalId).eq('approval_status', 'pending_approval')
      .order('created_at', { ascending: true })
    if (isClinicScoped && clinicId) approvalsQ = approvalsQ.eq('clinic_id', clinicId)

    const [a, d, inb, appr, hrs, hosp] = await Promise.all([
      getTodayAppointments(hospitalId, isClinicScoped ? clinicId : null),
      getDoctorsOnDuty(hospitalId, isClinicScoped ? clinicId : null),
      fetchInbound(),
      approvalsQ,
      getHospitalHours(hospitalId).catch(() => null),
      getMyHospital(hospitalId).catch(() => null),
    ])

    const rows = (appr.data ?? []) as { created_at: string }[]
    setApprovals({ count: rows.length, oldestMins: rows.length ? minutesSince(rows[0].created_at) : null })
    setInbound(inb)
    setAppts(a)
    setDoctors(d)
    setHours(hrs)
    setHospitalName(hosp?.name ?? null)
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, clinicId, isClinicScoped])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const waiting = appts.filter(a => a.status === 'checked_in')
  const longestWait = waiting
    .map(a => minutesSince(a.checked_in_at))
    .filter((n): n is number => n != null)
    .reduce<number | null>((max, n) => (max == null || n > max ? n : max), null)

  // Per-doctor waiting counts, off the list already fetched.
  const waitingByDoctor = waiting.reduce<Record<string, number>>((acc, a) => {
    if (a.doctor_id) acc[a.doctor_id] = (acc[a.doctor_id] ?? 0) + 1
    return acc
  }, {})

  const today = hours?.find(h => h.day === new Date().getDay())
  const onDutyCount = doctors.filter(d => d.availability_status === 'on_duty').length

  return (
    <Screen>
      <AppBar>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 10, paddingVertical: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.q.sel, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.q.primary }}>Q</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.27, color: t.q.ink }}>
              {hospitalName ?? 'Your hospital'}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: t.q.ink60 }}>
              {[
                staffProfile?.role === 'front_desk' ? 'Front desk'
                  : staffProfile?.role === 'clinic_admin' ? 'Clinic admin'
                  : 'Hospital admin',
                staffProfile?.name,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <IconBtn
            name="notifications-outline"
            label={unreadMessages ? `Alerts, ${unreadMessages} unread` : 'Alerts'}
            badge={unreadMessages > 0 || inbound.count > 0}
            onPress={() => navigation.navigate('AmbulanceAlerts')}
          />
        </View>
      </AppBar>

      {/* Opening hours drive this. A hospital that has not set hours gets no
          bar at all rather than an invented 08:00-18:00 day. */}
      {today && !today.closed && (
        <DayBar opensAt={today.open.slice(0, 5)} closesAt={today.close.slice(0, 5)} />
      )}

      {loading && appts.length === 0 ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          <StatStrip>
            <Stat
              label="Waiting" value={waiting.length}
              note={longestWait != null ? `longest ${longestWait} min` : 'nobody checked in'}
              onPress={() => navigation.navigate('FrontDeskQueue')}
            />
            <Stat
              label="To approve" value={approvals.count}
              tone={approvals.count > 0 ? 'amber' : undefined}
              note={humanAge(approvals.oldestMins) ?? 'nothing pending'}
              onPress={() => navigation.navigate('StaffAppointments')}
            />
            <Stat
              label="Incoming" value={inbound.count}
              tone={inbound.count > 0 ? 'red' : undefined}
              note={inbound.soonestEta != null ? `${Math.round(inbound.soonestEta / 60)} min away` : 'ambulance'}
              last
              onPress={() => navigation.navigate('AmbulanceRequests')}
            />
          </StatStrip>

          {(inbound.count > 0 || approvals.count > 0 || unreadMessages > 0) && (
            <>
              <SectionHead title="Needs you now" />
              <Card>
                {inbound.count > 0 && (
                  <Row
                    icon="medical" iconTone="red"
                    title={`Ambulance arriving · ${inbound.count} inbound`}
                    sub={inbound.soonestEta != null
                      ? `Nearest crew ${Math.round(inbound.soonestEta / 60)} min away — see triage and assign a doctor`
                      : 'See triage and assign a doctor'}
                    titleColor={t.q.red}
                    chevron
                    onPress={() => navigation.navigate('AmbulanceRequests')}
                  />
                )}
                {approvals.count > 0 && (
                  <>
                    {inbound.count > 0 && <Hair />}
                    <Row
                      icon="hourglass-outline" iconTone="amber"
                      title={`${approvals.count} booking${approvals.count === 1 ? '' : 's'} awaiting approval`}
                      sub="Approve or decline so patients are not left waiting"
                      right={<Mono size={13} weight="700" color={t.q.amber}>{approvals.count}</Mono>}
                      chevron
                      onPress={() => navigation.navigate('StaffAppointments')}
                    />
                  </>
                )}
                {unreadMessages > 0 && (
                  <>
                    {(inbound.count > 0 || approvals.count > 0) && <Hair />}
                    <Row
                      icon="chatbubbles-outline"
                      title={`${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`}
                      sub="From patients, doctors or crews"
                      chevron
                      onPress={() => navigation.navigate('HospitalMessages')}
                    />
                  </>
                )}
              </Card>
            </>
          )}

          <SectionHead title="Capacity" />
          <Card>
            <Row
              icon="bed-outline"
              title="Ward & triage capacity"
              sub="What you are telling patients and crews about bed space"
              chevron
              onPress={() => navigation.navigate('Beds')}
            />
            <Hair />
            <Row
              icon="person-add-outline"
              title="Check someone in"
              sub="Register a walk-in straight onto the queue"
              chevron
              onPress={() => navigation.navigate('WalkInBooking')}
            />
          </Card>

          <SectionHead title={`Doctors on duty · ${onDutyCount} of ${doctors.length}`} />
          {doctors.length === 0 ? (
            <Card>
              <Empty icon="medkit-outline" title="No doctors yet"
                body="Link your doctors under More, then Staff & doctors."
                action="Staff & doctors" onAction={() => navigation.navigate('StaffManagement')} />
            </Card>
          ) : (
            <Card>
              {doctors.map((d, i) => {
                const av = AVAILABILITY[d.availability_status] ?? AVAILABILITY.on_duty
                const n = waitingByDoctor[d.id] ?? 0
                return (
                  <View key={d.id}>
                    {i > 0 && <Hair />}
                    <Row
                      leading={<Initials name={d.full_name} size={40} tint="#7C2D12" />}
                      title={[d.title, d.full_name].filter(Boolean).join(' ')}
                      sub={[d.specialty_name, n ? `${n} waiting` : null].filter(Boolean).join(' · ') || null}
                      pill={av.label}
                      pillTone={av.tone}
                    />
                  </View>
                )
              })}
            </Card>
          )}

          <SectionHead title={`Today · ${appts.length} booked`} action="Open queue"
            onAction={() => navigation.navigate('FrontDeskQueue')} />
          {appts.length === 0 ? (
            <Card>
              <Empty icon="clipboard-outline" title="Nothing booked today"
                body="Bookings and walk-ins for today show up here." />
            </Card>
          ) : (
            <Card>
              {appts.slice(0, 6).map((a, i) => (
                <View key={a.id}>
                  {i > 0 && <Hair />}
                  <Row
                    number={a.queue_position ?? undefined}
                    icon={a.queue_position == null ? 'time-outline' : undefined}
                    iconTone="neutral"
                    title={a.patient_name}
                    sub={`${a.start_time} · ${a.doctor_name}`}
                    pill={a.status.replace(/_/g, ' ')}
                    pillTone={
                      a.status === 'in_progress' ? 'teal'
                      : a.status === 'checked_in' ? 'teal'
                      : a.status === 'completed' ? 'green'
                      : a.status === 'no_show' || a.status === 'cancelled' ? 'neutral'
                      : 'amber'
                    }
                  />
                </View>
              ))}
            </Card>
          )}
        </Body>
      )}
    </Screen>
  )
}
