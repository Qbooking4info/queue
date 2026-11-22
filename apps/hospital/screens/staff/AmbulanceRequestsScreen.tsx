import { useState, useCallback } from 'react'
import { View, ActivityIndicator, RefreshControl, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, DetailRow, Journey,
  Stat, StatStrip, Btn, Empty, IconBtn,
} from '@queue/shared/components/q'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface TransportRequest {
  id: string
  booking_ref: string
  status: string
  triage_level: number | null
  symptom_description: string | null
  eta_seconds: number | null
  pickup_address: string | null
  contact_phone: string
  caller_patient_name: string | null
  patient: { full_name: string } | null
  dependent: { full_name: string } | null
  unit: { plate_number: string; call_sign: string | null; vehicle_tier: string; provider: { name: string } | null } | null
  destination: { name: string } | null
  disposition: string | null
  is_inbound: boolean
  is_own_fleet: boolean
}

const DISPOSITION_LABEL: Record<string, string> = {
  transported: 'Transported', treated_not_transported: 'Treated on scene', patient_refused: 'Patient refused',
  no_patient_found: 'No patient found', deceased_on_scene: 'Closed on scene', cancelled: 'Cancelled',
}

interface Props { navigation: any }

// One theme token trio per status bucket -- mirrors web's AmbulancesList.tsx
// STATUS_KEY groups (amber/blue/accent/red/muted) but reuses the app's existing,
// already-AA-verified statusX tokens instead of the web's `${C.color}1a` hex-alpha
// trick, which only works with a plain 6-digit hex and these theme trios already
// carry their own tuned bg/border at the right opacity per palette.
function statusTrio(t: any, status: string) {
  const AMBER = ['requested', 'scheduled', 'searching']
  const BLUE  = ['matched', 'en_route_to_patient', 'on_scene']
  const GOOD  = ['transporting', 'arrived_at_destination']
  const RED   = ['cancelled_by_requester', 'cancelled_by_provider', 'no_unit_available']
  if (AMBER.includes(status)) return t.statusBusy
  if (BLUE.includes(status)) return t.statusVirtual
  if (GOOD.includes(status)) return t.statusOpen
  if (RED.includes(status)) return t.statusCancelled
  return t.statusNeutral // completed, anything unrecognized
}

const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested', scheduled: 'Scheduled', searching: 'Finding ambulance',
  matched: 'Crew assigned', en_route_to_patient: 'En route to patient', on_scene: 'Crew on scene',
  transporting: 'Transporting', arrived_at_destination: 'Arrived', completed: 'Completed',
  cancelled_by_requester: 'Cancelled by patient', cancelled_by_provider: 'Cancelled by provider',
  no_unit_available: 'No unit available',
}

const ACTIVE_STATUSES = ['requested', 'scheduled', 'searching', 'matched', 'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination']

function formatEta(seconds: number | null): string {
  if (seconds == null) return '—'
  const mins = Math.round(seconds / 60)
  return mins <= 1 ? 'Arriving now' : `~${mins} min`
}

function safeName(name: string | null | undefined): string {
  return name && name.trim() ? name : 'Unregistered caller'
}

export function AmbulanceRequestsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [requests, setRequests] = useState<TransportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const isAdmin = staffProfile?.role === 'hospital_admin'
  const hospitalId = staffProfile?.hospitalId

  // Routed through GET /api/ambulances rather than a direct
  // supabase.from('transport_requests') query. RLS does have a working policy for
  // this table ("Hospital staff can read inbound transports"), so the direct query
  // isn't actually broken -- but every other screen in this feature (alerts,
  // coverage) has to go through the API because their tables have RLS enabled with
  // zero policies, and the API route was already built for this one too. Splitting
  // "read this one directly, everything else through the API" is the kind of
  // inconsistency that silently breaks the day someone tightens RLS on this table
  // without knowing a mobile screen was relying on it staying permissive.
  const load = useCallback(async () => {
    if (!hospitalId) { setLoading(false); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) return
      const res = await fetch(`${API_URL}/api/ambulances`, { headers: { Authorization: `Bearer ${jwt}` } })
      const body = await res.json()
      if (res.ok) setRequests(body.requests ?? [])
    } catch {
      /* silent -- a failed background load leaves the last-known state on screen */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [hospitalId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useFocusEffect(useCallback(() => {
    if (!hospitalId) return
    const channel = supabase
      .channel(`hospital-ambulances:${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `destination_hospital_id=eq.${hospitalId}` },
        () => load())
      .subscribe()
    const fallback = setInterval(load, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(fallback) }
  }, [hospitalId, load]))

  const [receiving, setReceiving] = useState<string | null>(null)

  // Completes the trip as transported and frees the ambulance.
  function confirmReceived(r: TransportRequest) {
    Alert.alert('Patient received?', `Confirm ${r.booking_ref} has been handed over to your team.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        setReceiving(r.id)
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const res = await fetch(`${API_URL}/api/ambulances/receive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
            body: JSON.stringify({ requestId: r.id }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) Alert.alert('Could not confirm', body.error ?? 'Please try again.')
          await load()
        } catch {
          Alert.alert('Could not confirm', 'Check your connection and try again.')
        } finally {
          setReceiving(null)
        }
      } },
    ])
  }

  const active = requests.filter(r => ACTIVE_STATUSES.includes(r.status))
  const history = requests.filter(r => !ACTIVE_STATUSES.includes(r.status))

  // The ambulance journey, in the same rail language the patient and hospital
  // screens share. Terminal states are not placed on it: a cancelled job never
  // reached "arrived", and a rail that says it did is a lie at the worst moment.
  const STOPS = ['Accepted', 'En route', 'On scene', 'Transport', 'Arrived']
  const stopIndex = (status: string) =>
    status === 'matched' ? 0
    : status === 'en_route_to_patient' ? 1
    : status === 'on_scene' ? 2
    : status === 'transporting' ? 3
    : status === 'arrived_at_destination' || status === 'completed' ? 4
    : -1

  // The one being brought here soonest leads, because that is the arrival the
  // desk has to be ready for.
  const lead = active.find(r => r.is_inbound) ?? active[0] ?? null
  const rest = active.filter(r => r !== lead)
  const inboundCount = active.filter(r => r.is_inbound).length
  const soonest = active
    .map(r => r.eta_seconds)
    .filter((n): n is number => typeof n === 'number')
    .reduce<number | null>((min, n) => (min == null || n < min ? n : min), null)

  return (
    <Screen>
      <AppBar
        title="Ambulance desk"
        sub="Patients being brought here"
        onBack={() => navigation.goBack()}
        right={<IconBtn name="notifications-outline" label="Dispatcher alerts"
          onPress={() => navigation.navigate('AmbulanceAlerts')} />}
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          <StatStrip>
            <Stat label="Coming here" value={inboundCount}
              tone={inboundCount > 0 ? 'red' : undefined}
              note={inboundCount ? 'inbound now' : 'none inbound'} />
            <Stat label="Active jobs" value={active.length} note="including outbound" />
            <Stat label="Soonest"
              value={soonest != null ? Math.round(soonest / 60) : '—'}
              unit={soonest != null ? 'min' : undefined}
              note={soonest != null ? 'until arrival' : 'no ETA yet'} last />
          </StatStrip>

          {!active.length ? (
            <Card style={{ marginTop: 12 }}>
              <Empty
                icon="medical-outline"
                title="No active ambulance jobs"
                body="Patients being brought here, and transfers you have requested, appear here."
              />
            </Card>
          ) : (
            <>
              {!!lead && (
                <>
                  <SectionHead title={lead.is_inbound ? 'Arriving here' : 'Live job'} />
                  {stopIndex(lead.status) >= 0 && (
                    <Journey steps={STOPS} activeIndex={stopIndex(lead.status)} />
                  )}
                  <Card>
                    <Row
                      icon="medical" iconTone={(lead.triage_level ?? 5) <= 2 ? 'red' : 'amber'}
                      tint={(lead.triage_level ?? 5) <= 2}
                      title={safeName(lead.patient?.full_name ?? lead.dependent?.full_name ?? lead.caller_patient_name)}
                      sub={lead.symptom_description ?? 'No condition details given'}
                      pill={lead.triage_level != null ? `P${lead.triage_level}` : STATUS_LABEL[lead.status] ?? lead.status}
                      pillTone={(lead.triage_level ?? 5) <= 2 ? 'red' : 'amber'}
                      pillSolid={(lead.triage_level ?? 5) <= 2}
                    />
                    <Hair />
                    <DetailRow label="Status" value={STATUS_LABEL[lead.status] ?? lead.status} />
                    <DetailRow label="Arrives in" value={formatEta(lead.eta_seconds)} mono />
                    <DetailRow label="Unit" value={lead.unit
                      ? [lead.unit.call_sign ?? lead.unit.plate_number, lead.unit.vehicle_tier, lead.unit.provider?.name].filter(Boolean).join(' · ')
                      : 'Not assigned yet'} />
                    <DetailRow label="Pickup" value={lead.pickup_address ?? 'Not given'} />
                    <DetailRow label="Taking to" value={lead.destination?.name ?? 'Not chosen yet'} />
                    <DetailRow label="Reference" value={lead.booking_ref} mono last />

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 }}>
                      {!!lead.contact_phone && (
                        <Btn label="Call the caller" variant="secondary" small icon="call-outline"
                          onPress={() => Linking.openURL(`tel:${lead.contact_phone}`).catch(() => {})} />
                      )}
                      {lead.is_inbound && ['transporting', 'arrived_at_destination'].includes(lead.status) && (
                        <Btn
                          label="Patient received" small icon="checkmark-done"
                          loading={receiving === lead.id}
                          onPress={() => confirmReceived(lead)}
                        />
                      )}
                    </View>
                  </Card>

                  {/* The handoff puts "Assign a doctor" on this card. A transport
                      request is not an appointment, and nothing links a crew's
                      patient to a doctor until they are checked in, so the
                      button would have nothing to write. Assign from the queue
                      once the patient is through the door. */}
                </>
              )}

              {rest.length > 0 && (
                <>
                  <SectionHead title={`Other active jobs · ${rest.length}`} />
                  <Card>
                    {rest.map((r, i) => {
                      const critical = (r.triage_level ?? 5) <= 2
                      return (
                        <View key={r.id}>
                          {i > 0 && <Hair />}
                          <Row
                            icon="medical-outline"
                            iconTone={critical ? 'red' : 'neutral'}
                            title={safeName(r.patient?.full_name ?? r.dependent?.full_name ?? r.caller_patient_name)}
                            sub={[
                              r.symptom_description,
                              r.unit ? (r.unit.call_sign ?? r.unit.plate_number) : 'no unit yet',
                              `ETA ${formatEta(r.eta_seconds)}`,
                            ].filter(Boolean).join(' · ')}
                            pill={r.is_inbound ? 'Inbound' : STATUS_LABEL[r.status] ?? r.status}
                            pillTone={critical ? 'red' : r.is_inbound ? 'teal' : 'neutral'}
                            pillSolid={critical}
                          />
                          {r.is_inbound && ['transporting', 'arrived_at_destination'].includes(r.status) && (
                            <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                              <Btn label="Patient received" small icon="checkmark-done"
                                loading={receiving === r.id} onPress={() => confirmReceived(r)} />
                            </View>
                          )}
                        </View>
                      )
                    })}
                  </Card>
                </>
              )}
            </>
          )}

          {!!history.length && (
            <>
              <SectionHead title="Recent history" />
              <Card>
                {history.map((r, i) => (
                  <View key={r.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon="time-outline" iconTone="neutral"
                      dim
                      title={r.symptom_description ?? r.booking_ref}
                      sub={[r.booking_ref, r.disposition ? DISPOSITION_LABEL[r.disposition] ?? r.disposition : null]
                        .filter(Boolean).join(' · ')}
                      pill={STATUS_LABEL[r.status] ?? r.status}
                      pillTone="neutral"
                    />
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* Fleet and coverage management used to hang off this screen.
              Managing ambulances -- units, crew, shifts, coverage -- happens in
              Queue Ambulance's operator console now, including for a hospital
              that owns its own fleet. This desk keeps what is genuinely
              hospital work: inbound patients, and alerts for requests that
              found no unit. */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Btn label="Dispatcher alerts" variant="secondary" icon="notifications-outline"
              onPress={() => navigation.navigate('AmbulanceAlerts')} />
          </View>
        </Body>
      )}
    </Screen>
  )
}
