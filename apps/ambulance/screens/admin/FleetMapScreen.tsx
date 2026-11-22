import { useEffect, useRef, useState, useCallback } from 'react'
import { View, ActivityIndicator, ScrollView } from 'react-native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import { subscribeToUnitLocation, getUnitLocation } from '@queue/shared/lib/ambulance-api'
import { HospitalsMap } from '@queue/shared/components/map/HospitalsMap'
import type { MyUnit } from '@queue/shared/lib/crew-api'
import {
  Screen, AppBar, Card, Row, Hair, Empty, Mono,
} from '@queue/shared/components/q'

const POLL_INTERVAL_MS = 20_000
// Lagos, as a sane default center when the fleet is empty -- same fallback
// city every other map screen in this app defaults to.
const FALLBACK_REGION = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.3, longitudeDelta: 0.3 }

interface UnitPos { lat: number; lng: number; recordedAt: string }

/**
 * The fleet's live position, all units at once.
 *
 * Doubles as the "mock map" for testing: a freshly registered unit has a
 * home base (geocoded from the address given when it was added) but no live
 * GPS ping yet, so every unit always has *some* real position to show,
 * clearly labelled as a home base rather than a live fix until an actual
 * on-duty crew starts reporting -- the same honest live-vs-fallback pattern
 * JobPatientMap uses for a patient's booked pickup point.
 */
export function FleetMapScreen() {
  const { theme: t } = useTheme()
  const [units, setUnits] = useState<MyUnit[]>([])
  const [positions, setPositions] = useState<Record<string, UnitPos>>({})
  const [loading, setLoading] = useState(true)
  const channelsRef = useRef<{ unsubscribe: () => void }[]>([])

  const loadUnits = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_units')
    if (!error) setUnits((data ?? []) as MyUnit[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadUnits()
    const poll = setInterval(loadUnits, POLL_INTERVAL_MS)
    return () => clearInterval(poll)
  }, [loadUnits])

  // Re-subscribe whenever the on-duty unit set changes -- an off-duty unit's
  // last-known live fix could be stale/wrong, so it isn't worth following;
  // it still shows on the map at its home base instead (see markers below).
  useEffect(() => {
    channelsRef.current.forEach(c => c.unsubscribe())
    channelsRef.current = []

    const onDuty = units.filter(u => u.on_duty)
    onDuty.forEach(u => {
      getUnitLocation(u.ambulance_id).then(pos => {
        if (pos) setPositions(prev => ({ ...prev, [u.ambulance_id]: pos }))
      })
      const ch = subscribeToUnitLocation(u.ambulance_id, pos => {
        setPositions(prev => ({ ...prev, [u.ambulance_id]: pos }))
      })
      channelsRef.current.push(ch)
    })

    return () => { channelsRef.current.forEach(c => c.unsubscribe()); channelsRef.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.map(u => `${u.ambulance_id}:${u.on_duty}`).join(',')])

  const withPos = units.map(u => {
    const live = u.on_duty ? positions[u.ambulance_id] : undefined
    return {
      unit: u,
      lat: live?.lat ?? u.home_lat,
      lng: live?.lng ?? u.home_lng,
      isLive: !!live,
    }
  })

  const markers = withPos.map(({ unit, lat, lng, isLive }) => ({
    id: unit.ambulance_id,
    latitude: lat,
    longitude: lng,
    title: unit.call_sign ?? unit.plate_number,
    subtitle: isLive
      ? (unit.visible_to_dispatch ? 'Live · dispatchable' : 'Live · stale position')
      : (unit.on_duty ? 'On duty · no signal yet (home base)' : 'Home base'),
  }))

  const liveCount = withPos.filter(w => w.isLive).length
  const initialRegion = markers.length
    ? { latitude: markers[0].latitude, longitude: markers[0].longitude, latitudeDelta: 0.15, longitudeDelta: 0.15 }
    : FALLBACK_REGION

  if (loading) {
    return (
      <Screen>
        <AppBar large title="Fleet map" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <AppBar
        large
        title="Fleet map"
        sub={units.length === 0
          ? 'No units yet — add one from Fleet'
          : `${units.length} unit${units.length === 1 ? '' : 's'} · ${liveCount} reporting live`}
        right={<Mono size={12} color={t.q.ink60}>
          {new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </Mono>} />

      {units.length === 0 ? (
        <Card style={{ marginTop: 12 }}>
          <Empty icon="map-outline" title="Nothing to plot yet"
            body="Add an ambulance from the Fleet tab and it appears here at its home base straight away." />
        </Card>
      ) : (
        <>
          <View style={{
            flex: 1, marginHorizontal: 16, marginBottom: 12, borderRadius: 16,
            overflow: 'hidden', borderWidth: 1, borderColor: t.q.line,
          }}>
            <HospitalsMap markers={markers} initialRegion={initialRegion} style={{ flex: 1 }} interactive />
          </View>

          <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ paddingBottom: 8 }}>
            <Card>
              {withPos.map(({ unit, isLive }, i) => (
                <View key={unit.ambulance_id}>
                  {i > 0 && <Hair />}
                  <Row
                    compact
                    icon={isLive
                      ? (unit.visible_to_dispatch ? 'radio-outline' : 'warning-outline')
                      : unit.on_duty ? 'time-outline' : 'moon-outline'}
                    iconTone={isLive ? (unit.visible_to_dispatch ? 'green' : 'amber') : 'neutral'}
                    title={unit.call_sign ?? unit.plate_number}
                    sub={unit.seconds_since_ping != null ? `last fix ${unit.seconds_since_ping}s ago` : 'never reported'}
                    pill={isLive
                      ? (unit.visible_to_dispatch ? 'Moving' : 'Stale')
                      : unit.on_duty ? 'No signal' : 'Home base'}
                    pillTone={isLive ? (unit.visible_to_dispatch ? 'green' : 'amber') : 'neutral'} />
                </View>
              ))}
            </Card>
          </ScrollView>
        </>
      )}
    </Screen>
  )
}
