import { useCallback, useEffect, useState } from 'react'
import { View, ActivityIndicator, RefreshControl, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import {
  getFleet, getFleetRequests,
  type FleetUnit, type FleetRequestRow,
} from '@queue/shared/lib/ambulance-admin-api'
import { TRANSPORT_STATUS_LABEL, type TransportStatus } from '@queue/shared/lib/ambulance-api'
import {
  Screen, AppBar, Body, Card, Row, Hair, Seg, Stat, StatStrip,
  Journey, Empty, Mono, Notice, type PillTone,
} from '@queue/shared/components/q'

const ACTIVE_STATUSES: TransportStatus[] = [
  'requested', 'scheduled', 'searching', 'matched',
  'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination',
]

const POLL_INTERVAL_MS = 15_000

// The five crew-driven steps, same vocabulary as the crew app's own run bar.
const RUN_STEPS = ['Accepted', 'En route', 'On scene', 'Transport', 'Arrived']
const STEP_OF: Record<string, number> = {
  matched: 0,
  en_route_to_patient: 1,
  on_scene: 2,
  transporting: 3,
  arrived_at_destination: 4,
}

function embeddedName(x: { full_name: string } | { full_name: string }[] | null): string | null {
  return (Array.isArray(x) ? x[0]?.full_name : x?.full_name) ?? null
}

function embeddedUnit(u: FleetRequestRow['unit']): { plate_number: string; call_sign: string | null; vehicle_tier: string } | null {
  return Array.isArray(u) ? u[0] ?? null : u
}

function embeddedDest(d: FleetRequestRow['destination']): { name: string } | null {
  return (Array.isArray(d) ? d[0] : d) ?? null
}

/** "Ikoyi -> LUTH", or just the pickup while the crew has not chosen yet. */
function route(pickup: string | null, destName: string | null): string | null {
  const from = pickup?.split(',')[0]?.trim() || null
  if (from && destName) return `${from} → ${destName}`
  return destName ? `→ ${destName}` : from
}

function isToday(iso: string): boolean {
  const d = new Date(iso), now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function triageTone(level: number | null): PillTone {
  if (level == null) return 'neutral'
  if (level <= 2) return 'red'
  if (level === 3) return 'amber'
  return 'neutral'
}

export function AdminHomeScreen() {
  const { theme: t } = useTheme()
  const { providerAdminProfile } = useAuth()
  const [units, setUnits] = useState<FleetUnit[]>([])
  const [requests, setRequests] = useState<FleetRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'active' | 'history'>('active')

  const providerName = providerAdminProfile?.providerName

  const load = useCallback(async () => {
    try {
      const [fleet, reqs] = await Promise.all([getFleet(), getFleetRequests()])
      setUnits(fleet.ambulances)
      setRequests(reqs.requests)
    } catch (err) {
      console.warn('[admin] load failed', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(poll)
  }, [load])

  const active = requests.filter(r => ACTIVE_STATUSES.includes(r.status))
  const history = requests.filter(r => !ACTIVE_STATUSES.includes(r.status))
  const todayRequests = requests.filter(r => isToday(r.created_at))
  const respondedToday = todayRequests.filter(r => r.matched_at)
  const avgResponseMin = respondedToday.length
    ? Math.round(respondedToday.reduce((sum, r) => sum + (new Date(r.matched_at!).getTime() - new Date(r.created_at).getTime()) / 60000, 0) / respondedToday.length)
    : null
  const unitsAvailable = units.filter(u => u.visible_to_dispatch).length

  // A rig that is on duty but has stopped reporting is the one thing an operator
  // has to be told without going looking: dispatch drops it after 120s and the
  // fleet silently shrinks.
  const silent = units.filter(u => u.on_duty && !u.visible_to_dispatch)

  if (loading) {
    return (
      <Screen>
        <AppBar large title={providerName ?? 'Fleet'} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  const list = tab === 'active' ? active : history

  return (
    <Screen>
      <AppBar
        large
        title={providerName ?? 'Fleet'}
        sub={providerAdminProfile?.providerType === 'hospital_fleet' ? 'Hospital fleet' : 'Independent operator'}
        right={<Mono size={12} color={t.q.ink60}>
          {new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </Mono>} />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
          onRefresh={() => { setRefreshing(true); load() }} />
      }>
        <Card>
          <StatStrip>
            <Stat label="Active calls" value={active.length}
              tone={active.length > 0 ? 'red' : undefined}
              note={active.length ? 'open right now' : 'nothing running'} />
            <Stat label="Units ready" value={unitsAvailable}
              tone={unitsAvailable === 0 && units.length > 0 ? 'amber' : undefined}
              note={`of ${units.length} in the fleet`} />
            <Stat label="Avg response" value={avgResponseMin ?? '—'}
              unit={avgResponseMin != null ? 'min' : undefined}
              note="dispatched today" last />
          </StatStrip>
          <Hair inset={0} />
          <StatStrip>
            <Stat label="Calls today" value={todayRequests.length} note="midnight to now" />
            <Stat label="Completed" value={history.length} note="all time" last />
          </StatStrip>
        </Card>

        {silent.length > 0 && (
          <Notice tone="amber" icon="warning-outline">
            {silent.length === 1
              ? `${silent[0].call_sign ?? silent[0].plate_number} is on duty but has stopped reporting${silent[0].seconds_since_ping != null ? ` (${Math.round(silent[0].seconds_since_ping / 60)} min ago)` : ''}. Dispatch cannot send it a job.`
              : `${silent.length} units are on duty but have stopped reporting. Dispatch cannot send them jobs.`}
          </Notice>
        )}

        <Seg<'active' | 'history'>
          value={tab} onChange={setTab}
          options={[
            { key: 'active', label: `Active · ${active.length}` },
            { key: 'history', label: `History · ${history.length}` },
          ]} />

        {list.length === 0 ? (
          <Card>
            <Empty
              icon={tab === 'active' ? 'checkmark-done-outline' : 'time-outline'}
              title={tab === 'active' ? 'No active calls' : 'No finished calls yet'}
              body={tab === 'active'
                ? 'Jobs offered to your units show up here as soon as a crew accepts one.'
                : 'Completed and cancelled calls stay here.'} />
          </Card>
        ) : list.map(r => {
          const unit = embeddedUnit(r.unit)
          const dest = embeddedDest(r.destination)
          const name = embeddedName(r.patient) ?? embeddedName(r.dependent) ?? r.caller_patient_name ?? 'Unregistered caller'
          const step = STEP_OF[r.status]
          return (
            <Card key={r.id} style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12 }}>
                <Mono size={12} weight="700" style={{ flex: 1 }}>{r.booking_ref}</Mono>
                <Mono size={11} color={t.q.ink60}>
                  {new Date(r.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </Mono>
              </View>
              <Row
                icon={r.triage_level != null && r.triage_level <= 2 ? 'alert-circle' : r.request_type === 'scheduled' ? 'calendar-outline' : 'person-outline'}
                iconTone={triageTone(r.triage_level)}
                title={name}
                sub={[
                  TRANSPORT_STATUS_LABEL[r.status] ?? r.status,
                  unit ? (unit.call_sign ?? unit.plate_number) : 'no unit yet',
                  route(r.pickup_address, dest?.name ?? null),
                ].filter(Boolean).join(' · ')}
                pill={r.triage_level != null ? `P${r.triage_level}` : r.request_type === 'scheduled' ? 'Scheduled' : 'Untriaged'}
                pillTone={triageTone(r.triage_level)}
                pillSolid={r.triage_level != null && r.triage_level <= 2} />
              {!!r.symptom_description && (
                <>
                  <Hair />
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink70 }}>{r.symptom_description}</Text>
                  </View>
                </>
              )}
              {step != null && (
                <>
                  <Hair />
                  <Journey flat label="This run" steps={RUN_STEPS} activeIndex={step} />
                </>
              )}
              {!!r.contact_phone && (
                <>
                  <Hair />
                  <Row compact icon="call-outline" iconTone="teal" title={r.contact_phone} sub="Caller"
                    onPress={() => Linking.openURL(`tel:${r.contact_phone}`).catch(() => {})} />
                </>
              )}
            </Card>
          )
        })}

      </Body>
    </Screen>
  )
}
