import { useState, useCallback, useEffect } from 'react'
import { View, Pressable, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { useLocation, distanceKm } from '@queue/shared/contexts/LocationContext'
import {
  getHospitals, getNextAppointment, getActiveQueueAppointment,
  getQueuePositionBounds, getCompletedAppointments,
} from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { haptics } from '@queue/shared/lib/haptics'
import { readCache, writeCache } from '@queue/shared/lib/cache'
import { formatWait } from '@queue/shared/lib/waitTime'
import { todayLocalDate } from '@queue/shared/lib/format'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import {
  Screen, AppBar, Body, Card, CardLabel, CardActions, CardAction, SectionHead,
  Row, Hair, Pill, Mono, Btn, SearchField, IconBtn, Initials, Empty, NUMS,
  type PillTone,
} from '@queue/shared/components/q'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'

/**
 * Status pill wording and tone, matching the handoff's Appointments screen.
 *
 * `paid` is passed in rather than read off the appointment: payment lives in
 * its own table, so an appointment row alone cannot tell paid from unpaid.
 * Undefined means "not known yet", which must not render as "Pay to hold" --
 * telling a patient who has paid that they have not is the worse error.
 */
function statusPill(a: AppointmentWithRelations, paid?: boolean): { label: string; tone: PillTone; solid?: boolean } {
  if (a.status === 'checked_in') return { label: 'Checked in', tone: 'teal' }
  if (a.status === 'in_progress') return { label: 'With the doctor', tone: 'teal', solid: true }
  if (a.status === 'pending' || a.approval_status === 'pending') return { label: 'Awaiting approval', tone: 'amber', solid: true }
  if (paid === false) return { label: 'Pay to hold', tone: 'amber', solid: true }
  if (a.status === 'confirmed') return { label: 'Confirmed', tone: 'green' }
  if (a.status === 'completed') return { label: 'Seen', tone: 'neutral' }
  return { label: a.status.replace(/_/g, ' '), tone: 'neutral' }
}

function dayLabel(iso: string) {
  if (iso === todayLocalDate()) return 'Today'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

// The handoff prints an arrival WINDOW ("12:00-14:00"). Appointments carry a
// single start_time and no end, so this prints the one time we actually have
// rather than inventing a window the front desk would not honour.
function startTime(a: AppointmentWithRelations) {
  return a.start_time ? a.start_time.slice(0, 5) : null
}

function formatDistance(km?: number, city?: string | null) {
  if (km == null) return city ?? 'Nearby'
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

interface Props { navigation: any }

export function HomeScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth() as any
  const { coords } = useLocation()
  const [hospitals, setHospitals] = useState<(DisplayHospital & { distanceKm?: number })[]>([])
  const [nextAppt, setNextAppt] = useState<AppointmentWithRelations | null>(null)
  const [activeAppt, setActiveAppt] = useState<AppointmentWithRelations | null>(null)
  const [virtualDoctors, setVirtualDoctors] = useState<number | null>(null)
  const [results, setResults] = useState<any[]>([])
  const [unread, setUnread] = useState(0)
  const [ahead, setAhead] = useState<number | null>(null)
  const [wait, setWait] = useState<number | null>(null)
  const [paid, setPaid] = useState<boolean | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [raw, appt, active, docs] = await Promise.all([
        getHospitals(),
        user ? getNextAppointment(user.id) : Promise.resolve(null),
        user ? getActiveQueueAppointment(user.id) : Promise.resolve(null),
        supabase.from('doctors').select('id', { count: 'exact', head: true }).eq('accepts_virtual', true).eq('is_active', true),
      ])
      const mapped = raw.map(h => {
        const dh = toDisplayHospital(h) as DisplayHospital & { distanceKm?: number }
        if (coords && h.latitude != null && h.longitude != null) {
          dh.distanceKm = distanceKm(coords, { latitude: h.latitude, longitude: h.longitude })
        }
        return dh
      }).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      setHospitals(mapped)
      setNextAppt(appt)
      setActiveAppt(active)
      setVirtualDoctors(docs.count ?? null)
      writeCache(user?.id, 'home', { hospitals: mapped, nextAppt: appt, activeAppt: active, virtualDoctors: docs.count ?? null })

      if (user) {
        const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('is_read', false)
        setUnread(count ?? 0)
        // The handoff's second card is "Lab results available". There is no
        // lab-results table yet (see docs/repair/ISSUES.md), so this card shows
        // what the record actually holds -- the diagnosis and notes a doctor
        // wrote at a completed visit -- and says so in its own label. Nothing
        // here invents a result the patient could act on.
        const done = await getCompletedAppointments(user.id)
        setResults((done ?? []).filter((a: any) => a.diagnosis || a.doctor_notes).slice(0, 2))
      }

      // Paid-ness of the visit on the card. One row, one query.
      const forPill = active ?? appt
      if (forPill) {
        const { data: pay } = await supabase.from('payments')
          .select('id').eq('appointment_id', forPill.id).limit(1).maybeSingle()
        setPaid(!!pay)
      } else {
        setPaid(undefined)
      }

      // Live queue figures for the card. Only meaningful once checked in.
      if (active) {
        const b = await getQueuePositionBounds(active.id)
        if (b.ok) { setAhead(b.aheadOfYou); setWait(b.estimatedWait) }
      } else {
        setAhead(null); setWait(null)
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [user, coords])

  // Paint the last good copy immediately, then refresh over it.
  useEffect(() => {
    readCache<any>(user?.id, 'home').then(c => {
      if (!c) return
      setHospitals(h => h.length ? h : c.hospitals ?? [])
      setNextAppt(a => a ?? c.nextAppt ?? null)
      setActiveAppt(a => a ?? c.activeAppt ?? null)
      setVirtualDoctors(v => v ?? c.virtualDoctors ?? null)
      setLoading(false)
    })
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const visit = activeAppt ?? nextAppt
  const inQueue = !!activeAppt
  const pill = visit ? statusPill(visit, paid) : null
  const waitText = formatWait(wait)

  return (
    <Screen>
      <AppBar>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 10, paddingVertical: 12 }}>
          {/* The avatar is the ONLY route to Profile now that the fourth tab is
              My Records -- and from Profile to the wallet, dependents, insurance
              and sign-out. It is a 44px target and says where it goes. */}
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button" accessibilityLabel="Your profile and account settings"
            style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : null}>
            <Initials name={user?.full_name} size={44} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.27, color: t.q.ink }}>
              {user?.full_name ?? 'Your account'}
            </Text>
            <Text style={{ fontSize: 13, color: t.q.ink60 }}>
              Your health hub{user?.patient_code ? ` · ${user.patient_code}` : ''}
            </Text>
          </View>
          <IconBtn name="notifications-outline" label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            badge={unread > 0} onPress={() => navigation.navigate('Notifications')} />
        </View>
      </AppBar>

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.q.primary} colors={[t.q.primary]} />
      }>
        <SearchField placeholder="Search doctor, specialty or clinic…" onPress={() => navigation.navigate('Search')} />

        <View style={{ height: 6 }} />

        {loading && !visit ? (
          <View style={{ marginHorizontal: 16 }}><SkeletonCard /></View>
        ) : visit ? (
          <Card>
            <View style={{ padding: 14, gap: 6 }}>
              <CardLabel>{inQueue ? 'In the queue' : 'Upcoming appointment'}</CardLabel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <Initials name={visit.doctor?.full_name ?? 'Queue'} size={44} tint="#7C2D12" />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', letterSpacing: -0.24, color: t.q.ink }}>
                    {visit.doctor?.full_name ?? 'Doctor assigned on arrival'}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 17, color: t.q.ink60 }}>
                    {[visit.doctor?.specialty?.name, visit.hospital?.name].filter(Boolean).join(' · ') || 'Your visit'}
                  </Text>
                </View>
                {!!pill && <Pill label={pill.label} tone={pill.tone} solid={pill.solid} />}
              </View>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                <Mono size={13}>{dayLabel(visit.appointment_date)}</Mono>
                {!!startTime(visit) && <Mono size={13}>{startTime(visit)}</Mono>}
                {!!visit.booking_ref && <Mono size={13} color={t.q.ink60}>{visit.booking_ref}</Mono>}
              </View>
            </View>

            {/* The live strip. "Now serving" is deliberately absent: the API
                reports how many people are ahead of this patient, not which
                number is currently with the doctor, and a number captioned
                "now serving" that is really "someone's position" would be a
                lie the patient can check against the waiting room. */}
            {inQueue && (
              <Row
                tint
                onPress={() => navigation.navigate('LiveQueue', { appointmentId: visit.id })}
                leading={
                  <View style={{ flexDirection: 'row', gap: 18 }}>
                    <View>
                      <Text style={{ fontSize: 11, color: t.q.ink60 }}>You</Text>
                      <Text style={[{ fontSize: 26, fontWeight: '800', color: t.q.ink }, NUMS]}>
                        {visit.queue_position ?? '—'}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 11, color: t.q.ink60 }}>Ahead of you</Text>
                      <Text style={[{ fontSize: 26, fontWeight: '800', color: t.q.primary }, NUMS]}>
                        {ahead ?? '—'}
                      </Text>
                    </View>
                  </View>
                }
                title=""
                right={
                  <Text style={{ flex: 1, fontSize: 13, color: t.q.ink70, textAlign: 'right' }}>
                    {waitText ? `about ${waitText}` : 'Waiting time updating'}
                  </Text>
                }
                chevron
              />
            )}

            <CardActions>
              <CardAction first label="Book new" onPress={() => navigation.navigate('Search')} />
              <CardAction
                label={inQueue ? 'Live queue' : 'View booking'}
                onPress={() => navigation.navigate(
                  inQueue ? 'LiveQueue' : 'AppointmentDetail',
                  inQueue ? { appointmentId: visit.id } : { appointment: visit },
                )}
              />
            </CardActions>
          </Card>
        ) : (
          <Card>
            <Empty
              icon="calendar-outline"
              title="No upcoming visit"
              body="Book a hospital visit, see a doctor online, or browse by specialty."
            />
            <CardActions>
              <CardAction first label="Book a visit" onPress={() => navigation.navigate('Search')} />
              <CardAction label="See a doctor online" onPress={() => navigation.navigate('VirtualCare')} />
            </CardActions>
          </Card>
        )}

        {failed && (
          <View style={{ marginTop: 12 }}>
            <Card pad style={{ backgroundColor: t.q.redBg, borderColor: 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 13, color: t.q.ink }}>Couldn&apos;t load everything.</Text>
                <Btn label="Try again" variant="secondary" small onPress={load} />
              </View>
            </Card>
          </View>
        )}

        {results.length > 0 && (
          <>
            <View style={{ height: 12 }} />
            <Card>
              <View style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 }}>
                <CardLabel>From your last visits</CardLabel>
              </View>
              {results.map((a, i) => (
                <View key={a.id}>
                  {i > 0 && <Hair />}
                  <Row
                    icon="flask-outline"
                    title={a.diagnosis ?? 'Consultation notes'}
                    sub={[a.doctor?.full_name, new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                    pill="Reviewed" pillTone="green"
                    chevron
                    onPress={() => navigation.navigate('Prescriptions')}
                  />
                </View>
              ))}
              <CardActions>
                <CardAction first label="All records" onPress={() => navigation.navigate('MyRecords')} />
                <CardAction label="Prescriptions" onPress={() => navigation.navigate('Prescriptions')} />
              </CardActions>
            </Card>
          </>
        )}

        <View style={{ height: 12 }} />

        {/* Virtual care and the ambulance lost their tiles when the quick-tile
            grid went; without these two rows Home has no route to either. */}
        <Card>
          <Row
            icon="videocam-outline"
            title="See a doctor from home"
            sub={virtualDoctors ? `${virtualDoctors} ${virtualDoctors === 1 ? 'doctor' : 'doctors'} available for video, audio or chat` : 'Video, audio or chat consultations'}
            chevron
            onPress={() => navigation.navigate('VirtualCare')}
          />
          <Hair />
          <Row
            icon="car-outline"
            title="Ambulance"
            sub="Request a crew, or book an emergency slot"
            chevron
            onPress={() => navigation.navigate('AmbulanceHome')}
          />
        </Card>

        <View style={{ height: 12 }} />

        <Card style={{ backgroundColor: t.q.redBg, borderColor: 'transparent' }}>
          <Row
            icon="warning-outline" iconTone="red"
            title="Need help now?"
            sub="Emergency SOS or an emergency slot"
            titleColor={t.q.red}
            subColor={t.q.ink70}
            chevron
            onPress={() => { haptics.heavy(); navigation.navigate('Sos') }}
          />
        </Card>

        <SectionHead title="Near you" action="See all" onAction={() => navigation.navigate('Search')} />
        {loading && hospitals.length === 0 ? (
          <View style={{ marginHorizontal: 16 }}><SkeletonCard /></View>
        ) : hospitals.length === 0 ? (
          <Card><Empty icon="business-outline" title="No hospitals to show yet"
            body="We could not reach the hospital list. Pull down to try again." /></Card>
        ) : (
          <Card>
            {hospitals.slice(0, 3).map((h, i) => (
              <View key={String(h.id)}>
                {i > 0 && <Hair />}
                <Row
                  icon="business-outline"
                  title={h.name}
                  sub={`${h.rating ? `★ ${h.rating.toFixed(1)} · ` : ''}${formatDistance(h.distanceKm, h.city)}`}
                  chevron
                  onPress={() => navigation.navigate('HospitalProfile', { hospital: h })}
                />
              </View>
            ))}
          </Card>
        )}
      </Body>
    </Screen>
  )
}
