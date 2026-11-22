import { useState, useCallback, useEffect } from 'react'
import { View, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getPatientAppointments } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { arrivalWindow, todayLocalDate } from '@queue/shared/lib/format'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { useIsOffline } from '@queue/shared/hooks/useIsOffline'
import { readCache, writeCache } from '@queue/shared/lib/cache'
import {
  Screen, AppBar, Body, Card, SectionHead, Row, Hair, Seg, Empty,
  type PillTone,
} from '@queue/shared/components/q'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'

type Tab = 'upcoming' | 'past'

const UPCOMING = ['pending', 'confirmed', 'checked_in', 'in_progress']

/**
 * The handoff's pill vocabulary. `paid` is undefined until the payments query
 * returns; an unknown payment must never render as "Pay to hold", so the
 * unpaid branch tests for an explicit false.
 */
function pillFor(a: AppointmentWithRelations, paid?: boolean): { label: string; tone: PillTone; solid?: boolean } {
  const approval = (a as any).approval_status
  if (approval === 'rejected') return { label: 'Rejected', tone: 'red' }
  if (a.status === 'checked_in') return { label: 'Checked in', tone: 'teal' }
  if (a.status === 'in_progress') return { label: 'With the doctor', tone: 'teal', solid: true }
  if (a.status === 'pending' || approval === 'pending_approval') return { label: 'Awaiting approval', tone: 'amber', solid: true }
  if (paid === false) return { label: 'Pay to hold', tone: 'amber', solid: true }
  if (a.status === 'confirmed') return { label: 'Confirmed', tone: 'green' }
  if (a.status === 'completed') return { label: 'Seen', tone: 'neutral' }
  if (a.status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' }
  if (a.status === 'no_show') return { label: 'Missed', tone: 'neutral' }
  return { label: a.status.replace(/_/g, ' '), tone: 'neutral' }
}

function when(a: AppointmentWithRelations) {
  const today = todayLocalDate()
  const day = a.appointment_date === today
    ? 'Today'
    : new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' })
  const window_ = arrivalWindow(a as { start_time?: string | null; end_time?: string | null })
  return window_ ? `${day} · ${window_}` : day
}

function daysFromToday(iso: string) {
  const a = new Date(todayLocalDate() + 'T00:00:00').getTime()
  const b = new Date(iso + 'T00:00:00').getTime()
  return Math.round((b - a) / 86_400_000)
}

export function AppointmentsScreen({ navigation }: { navigation?: any }) {
  const { theme: t } = useTheme()
  const offline = useIsOffline()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([])
  /** Appointment ids with a successful payment. Absent id + loaded set = unpaid. */
  const [paidIds, setPaidIds] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // No signed-in user means there is nothing to load and never will be;
    // returning without clearing `loading` leaves a spinner for ever.
    if (!user) { setLoading(false); return }
    const result = await getPatientAppointments()
    if (result.ok) {
      setLoadError(null)
      setAppts(result.data)
      writeCache(user?.id, 'appointments', result.data)
      // One query for the whole list rather than one per row.
      const ids = result.data.map(a => a.id)
      if (ids.length) {
        const { data: pays } = await supabase.from('payments')
          .select('appointment_id').in('appointment_id', ids).eq('status', 'success')
        setPaidIds(new Set((pays ?? []).map((p: any) => p.appointment_id)))
      } else {
        setPaidIds(new Set())
      }
    } else {
      setLoadError(result.error)
    }
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => {
    readCache<AppointmentWithRelations[]>(user?.id, 'appointments').then(c => {
      if (c) { setAppts(a => a.length ? a : c); setLoading(false) }
    })
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const isPaid = (a: AppointmentWithRelations) => paidIds ? paidIds.has(a.id) : undefined

  const upcoming = appts
    .filter(a => UPCOMING.includes(a.status) && (a as any).approval_status !== 'rejected')
    .sort((a, b) => (a.appointment_date + (a.start_time ?? '')).localeCompare(b.appointment_date + (b.start_time ?? '')))
  const past = appts.filter(a => !upcoming.includes(a))

  // The handoff groups the upcoming list by how soon it is, and lifts anything
  // the patient must act on into its own group -- a visit that will be released
  // for non-payment is not just "this week".
  const needsYou = upcoming.filter(a => isPaid(a) === false)
  const rest = upcoming.filter(a => isPaid(a) !== false)
  const groups: { title: string; items: AppointmentWithRelations[] }[] = tab === 'upcoming'
    ? [
        { title: 'Today', items: rest.filter(a => daysFromToday(a.appointment_date) <= 0) },
        { title: 'This week', items: rest.filter(a => { const d = daysFromToday(a.appointment_date); return d > 0 && d <= 7 }) },
        { title: 'Later', items: rest.filter(a => daysFromToday(a.appointment_date) > 7) },
        { title: 'Needs you', items: needsYou },
      ].filter(g => g.items.length > 0)
    : [{ title: 'Past', items: past }]

  const empty = groups.length === 0

  function open(a: AppointmentWithRelations) {
    if ((a as any).approval_status === 'rejected') {
      navigation?.navigate('AppointmentDetail', { appointment: a })
    } else if (a.status === 'checked_in' || a.status === 'in_progress') {
      navigation?.navigate('LiveQueue', { appointmentId: a.id })
    } else {
      navigation?.navigate('AppointmentDetail', { appointment: a })
    }
  }

  return (
    <Screen>
      <AppBar large title="Appointments" />
      <Seg<Tab>
        value={tab} onChange={setTab}
        options={[
          { key: 'upcoming', label: upcoming.length ? `Upcoming · ${upcoming.length}` : 'Upcoming' },
          { key: 'past', label: 'Past' },
        ]}
      />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.q.primary} colors={[t.q.primary]} />
      }>
        {loading && appts.length === 0 ? (
          <View style={{ marginHorizontal: 16, marginTop: 16, gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
        ) : loadError ? (
          <Card style={{ marginTop: 16 }}>
            <Empty
              icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
              title={offline ? 'No connection' : 'Could not load your visits'}
              body={offline ? 'Your visits appear again when you are back online.' : 'Pull down, or tap below, to try again.'}
              action="Try again" onAction={() => { setLoading(true); load() }}
            />
          </Card>
        ) : empty ? (
          <Card style={{ marginTop: 16 }}>
            {tab === 'upcoming'
              ? <Empty icon="calendar-outline" title="No upcoming visits"
                  body="Book a hospital visit or see a doctor online."
                  action="Book a visit" onAction={() => navigation?.navigate('Search')} />
              : <Empty icon="time-outline" title="No past visits yet"
                  body="Completed and cancelled visits show here." />}
          </Card>
        ) : groups.map(g => (
          <View key={g.title}>
            <SectionHead title={g.title} />
            <Card>
              {g.items.map((a, i) => {
                const p = pillFor(a, isPaid(a))
                const live = a.status === 'checked_in' || a.status === 'in_progress'
                return (
                  <View key={a.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon={a.type === 'virtual' ? 'videocam-outline' : 'business-outline'}
                      iconTone={live ? 'teal' : 'neutral'}
                      tint={live}
                      title={a.hospital?.name ?? (a.type === 'virtual' ? 'Video consultation' : 'Visit')}
                      sub={[
                        a.doctor?.full_name ?? 'Doctor assigned on arrival',
                        when(a),
                        live && a.queue_position != null ? `you ${a.queue_position}` : null,
                      ].filter(Boolean).join(' · ')}
                      pill={p.label} pillTone={p.tone} pillSolid={p.solid}
                      chevron
                      onPress={() => open(a)}
                    />
                  </View>
                )
              })}
            </Card>
          </View>
        ))}
      </Body>
    </Screen>
  )
}
