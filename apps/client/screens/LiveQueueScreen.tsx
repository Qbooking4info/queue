import { useCallback, useEffect, useRef, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getAppointmentById, getQueuePositionBounds } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { readCache, writeCache } from '@queue/shared/lib/cache'
import { haptics } from '@queue/shared/lib/haptics'
import { showQueueNotification, clearQueueNotification } from '@queue/shared/lib/queueNotification'
import { formatWait, formatAsOf, isWaitStale } from '@queue/shared/lib/waitTime'
import { QueuePositionPicker } from '@queue/shared/components/QueuePositionPicker'
import {
  Screen, AppBar, Body, Card, Journey, StatStrip, Stat, Notice, Btn, BottomBar,
  Row, Hair, Mono, Empty, DetailRow, CardLabel, NUMS,
} from '@queue/shared/components/q'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'

const STEPS = ['Booked', 'Paid', 'Checked in', 'In the queue', 'Called', 'Seen']

/**
 * Where this visit stands on the journey rail, and whether it is stuck.
 *
 * "Paid" is a real stop, not a formality: an unpaid booking is released, so
 * the rail has to show the patient held at that step rather than sliding past
 * it. `paid === undefined` means the payment query has not answered yet, and
 * is treated as not-stuck -- a false "you have not paid" is worse than a
 * late one.
 */
function journeyAt(a: AppointmentWithRelations, paid?: boolean): { index: number; blocking?: number } {
  if (a.status === 'completed') return { index: 5 }
  if (a.status === 'in_progress') return { index: 4 }
  if (a.status === 'checked_in') return { index: a.queue_position != null ? 3 : 2 }
  if (paid === false) return { index: 1, blocking: 1 }
  if (paid === true) return { index: 2 }
  return { index: 1 }
}

interface Props { navigation: any; route: { params: { appointmentId: string } } }

export function LiveQueueScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth() as any
  const id = route.params?.appointmentId

  const [appt, setAppt] = useState<AppointmentWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [paid, setPaid] = useState<boolean | undefined>(undefined)
  const [ahead, setAhead] = useState<number | null>(null)
  const [emergencies, setEmergencies] = useState<number | null>(null)
  const [nowServing, setNowServing] = useState<number | null>(null)
  const [queueTotal, setQueueTotal] = useState<number | null>(null)
  const [wait, setWait] = useState<number | null>(null)
  const [asOf, setAsOf] = useState<string | null>(null)
  const [showLate, setShowLate] = useState(false)
  // Re-rendered on a tick so the "updating live" caption can turn into "not
  // updating" even when the poll itself is what broke -- which is exactly the
  // case where a frozen number must not keep passing for a live one.
  const [, setTick] = useState(0)
  const lastPos = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const a = await getAppointmentById(id).catch(() => null)
    if (a) {
      setAppt(a)
      writeCache(user?.id, 'queue:' + id, { a, at: Date.now() })
    }
    const b = await getQueuePositionBounds(id)
    if (b.ok) {
      setAhead(b.aheadOfYou)
      setEmergencies(b.emergenciesAhead)
      setNowServing(b.nowServing)
      setQueueTotal(b.queueTotal)
      setWait(b.estimatedWait)
      setAsOf(b.asOf)
    }
    const { data: pay } = await supabase.from('payments')
      .select('id').eq('appointment_id', id).eq('status', 'success').limit(1).maybeSingle()
    setPaid(!!pay)
    setLoading(false)
  }, [id, user?.id])

  // The pass has to open at the front desk with no signal: cached copy first.
  useEffect(() => {
    readCache<{ a: AppointmentWithRelations; at: number }>(user?.id, 'queue:' + id).then(c => {
      if (c) { setAppt(p => p ?? c.a); setLoading(false) }
    })
  }, [id, user?.id])

  // Realtime on this one row, with a poll behind it: Realtime drops silently
  // on flaky mobile data, and this screen is read in a waiting room.
  useEffect(() => {
    load()
    const ch = supabase.channel(`live-queue-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `id=eq.${id}` }, () => load())
      .subscribe()
    const poll = setInterval(load, 20_000)
    const tick = setInterval(() => setTick(n => n + 1), 15_000)
    return () => { supabase.removeChannel(ch); clearInterval(poll); clearInterval(tick) }
  }, [id, load])

  // Feel the queue move, and keep the Android shade in step with the screen.
  useEffect(() => {
    if (!appt) return
    const pos = appt.queue_position
    const live = appt.status === 'checked_in'
    if (live && pos != null && lastPos.current != null && pos < lastPos.current) {
      if (pos === 1) haptics.success()
      else haptics.tap()
    }
    lastPos.current = pos ?? null
    if (live && pos != null) {
      showQueueNotification(
        appt.id,
        pos === 1 ? 'You are next' : `Number ${pos} in the queue`,
        formatWait(appt.estimated_wait) ?? (appt.doctor?.full_name ?? 'Queue'),
      )
    } else if (appt.status === 'in_progress') {
      showQueueNotification(appt.id, 'It is your turn', 'Go to the consulting room')
    } else {
      clearQueueNotification()
    }
  }, [appt?.status, appt?.queue_position, appt?.estimated_wait])

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  if (!appt) {
    return (
      <Screen>
        <AppBar title="In the queue" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 16 }}>
          <Empty icon="ticket-outline" title="We could not find this visit"
            body="It may have been cancelled or moved."
            action="Back to appointments" onAction={() => navigation.goBack()} />
        </Card>
      </Screen>
    )
  }

  const { index, blocking } = journeyAt(appt, paid)
  const checkedIn = appt.status === 'checked_in' || appt.status === 'in_progress'
  const withDoctor = appt.status === 'in_progress'
  const stale = isWaitStale(asOf)
  const waitText = formatWait(wait)
  // formatWait returns a sentence ("About 20-25 min"); the figure strip wants
  // the band on its own with "min" as a separate unit.
  const waitBand = waitText?.replace(/^About\s*/, '').replace(/\s*min$/, '') ?? '—'
  const waitUnit = waitText?.endsWith('min') ? 'min' : undefined

  return (
    <Screen>
      <AppBar
        title={appt.hospital?.name ?? 'Your visit'}
        sub={appt.clinic?.name ?? appt.doctor?.specialty?.name ?? appt.booking_ref}
        onBack={() => navigation.goBack()}
      />

      <Body>
        <Journey steps={STEPS} activeIndex={index} blockingIndex={blocking} />

        {checkedIn ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18, paddingHorizontal: 20, paddingBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: t.q.ink60 }}>Your number</Text>
                <Text accessibilityLiveRegion="polite"
                  style={[{ fontSize: 72, lineHeight: 76, fontWeight: '800', letterSpacing: -2.9, color: t.q.ink }, NUMS]}>
                  {appt.queue_position ?? '—'}
                </Text>
              </View>
              <View style={{ borderLeftWidth: 1, borderLeftColor: t.q.line, paddingLeft: 16, paddingBottom: 8 }}>
                {/* The number on the waiting-room board. This is checkable
                    against the wall, so it is the real one the doctor is with
                    -- null between patients, which is said rather than left
                    showing the last person's number. */}
                <Text style={{ fontSize: 12, fontWeight: '600', color: t.q.ink60 }}>
                  {withDoctor ? 'Status' : 'Now serving'}
                </Text>
                <Text style={[{ fontSize: 30, lineHeight: 34, fontWeight: '800', color: t.q.primary }, NUMS]}>
                  {withDoctor ? 'You' : nowServing ?? '—'}
                </Text>
                {!withDoctor && nowServing == null && (
                  <Text style={{ fontSize: 11, color: t.q.ink60 }}>between patients</Text>
                )}
              </View>
            </View>

            <StatStrip>
              <Stat
                label="Ahead of you"
                value={withDoctor ? '0' : ahead ?? '—'}
                note={emergencies && emergencies > 0
                  ? `${emergencies} brought forward`
                  : queueTotal != null ? `${queueTotal} in today's queue` : undefined}
              />
              <Stat label="Your wait" value={withDoctor ? 'Now' : waitBand} unit={withDoctor ? undefined : waitUnit}
                note={withDoctor ? 'you are with the doctor' : 'estimated, never under-promised'} />
              <Stat label="As of" value={formatAsOf(asOf)?.replace('as of ', '') ?? '—'}
                note={stale ? 'not updating' : 'updating live'} last />
            </StatStrip>

            {stale && (
              <Notice tone="amber" icon="cloud-offline-outline">
                These figures stopped updating. They are the last ones your phone received, so treat
                them as older than they look.
              </Notice>
            )}

            {!!emergencies && emergencies > 0 && (
              <Notice tone="teal" icon="information-circle-outline">
                {emergencies === 1 ? 'An emergency case was' : `${emergencies} emergency cases were`} brought in
                ahead of you. Your number did not lose its place in the ordinary queue.
              </Notice>
            )}
          </>
        ) : (
          <>
            <Card>
              <View style={{ padding: 14, gap: 6 }}>
                <CardLabel>Not in the queue yet</CardLabel>
                <Text style={{ fontSize: 14, lineHeight: 20, color: t.q.ink70 }}>
                  {blocking != null
                    ? 'This booking is not paid. Unpaid bookings are released, so pay to keep your arrival window.'
                    : 'Your number is given when the front desk checks you in. Show your queue pass when you arrive.'}
                </Text>
              </View>
            </Card>
            {blocking != null && (
              <Notice tone="amber">Pay before your arrival window to keep this place.</Notice>
            )}
          </>
        )}

        <Card style={{ marginTop: 12 }}>
          <View style={{ padding: 14, paddingBottom: 6 }}><CardLabel>Your visit</CardLabel></View>
          <DetailRow label="Hospital" value={appt.hospital?.name ?? '—'} />
          <DetailRow label="Clinic" value={appt.clinic?.name ?? appt.doctor?.specialty?.name ?? 'General outpatient'} />
          <DetailRow label="Doctor" value={appt.doctor?.full_name ?? 'Assigned on arrival'} />
          <DetailRow label="Arrive" value={appt.start_time ? appt.start_time.slice(0, 5) : '—'} />
          <DetailRow label="Reference" value={appt.booking_ref ?? '—'} mono last />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Row icon="chatbubble-outline" title="Message the front desk"
            sub="Directions, payments, paperwork" chevron
            onPress={() => navigation.navigate('Chat', { hospitalId: appt.hospital?.id })} />
          <Hair />
          <Row icon="document-text-outline" title="Appointment details"
            sub="Preparation, fee and cancellation" chevron
            onPress={() => navigation.navigate('AppointmentDetail', { appointment: appt })} />
        </Card>

        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
            Emergencies are seen first, then patients in check-in order. Your phone rings when it is your turn.
          </Text>
        </View>
      </Body>

      <BottomBar meta={
        checkedIn ? (
          <>
            <Mono size={12} color={t.q.primary}>You {appt.queue_position ?? '—'}</Mono>
            <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
            <Mono size={12}>{withDoctor ? 'with the doctor' : `${ahead ?? '—'} ahead`}</Mono>
            {!!waitText && !withDoctor && (
              <>
                <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
                <Mono size={12}>{waitText.toLowerCase()}</Mono>
              </>
            )}
          </>
        ) : undefined
      }>
        {checkedIn && !withDoctor && (
          <Btn label="Move me later" variant="secondary" onPress={() => setShowLate(true)} />
        )}
        {/* The handoff's primary here is "I'm here", a self check-in. Check-in
            is a staff-only action today (web/src/app/api/appointments/[id],
            requireRole), so this opens the pass the front desk scans rather
            than claiming to have done something it cannot do. */}
        <Btn
          grow
          label={checkedIn ? 'Queue pass' : 'Show pass to check in'}
          icon="qr-code-outline"
          onPress={() => navigation.navigate('QueuePass', { appointmentId: appt.id })}
        />
      </BottomBar>

      {showLate && (
        <QueuePositionPicker
          appointmentId={appt.id}
          onClose={() => setShowLate(false)}
          onMoved={() => { setShowLate(false); load() }}
        />
      )}
    </Screen>
  )
}
