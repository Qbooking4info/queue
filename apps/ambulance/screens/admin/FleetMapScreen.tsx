import { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import { subscribeToUnitLocation, getUnitLocation } from '@queue/shared/lib/ambulance-api'
import { HospitalsMap } from '@queue/shared/components/map/HospitalsMap'
import type { MyUnit } from '@queue/shared/lib/crew-api'

const POLL_INTERVAL_MS = 20_000
// Lagos, as a sane default center when the fleet is empty -- same fallback
// city every other map screen in this app defaults to.
const FALLBACK_REGION = { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.3, longitudeDelta: 0.3 }

interface UnitPos { lat: number; lng: number; recordedAt: string }

/**
 * "the admin manages his fleets and can see their activities and locations"
 * -- nothing in the existing system shows a fleet operator their whole
 * fleet's live position at once. This is that screen.
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
      <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={[s.title, { color: t.textPrimary }]}>Fleet Map</Text>
        <Text style={[s.sub, { color: t.textMuted }]}>
          {units.length === 0
            ? 'No units yet — add one from the Fleet tab'
            : `${liveCount} of ${units.length} unit${units.length !== 1 ? 's' : ''} reporting a live position`}
        </Text>
      </View>

      <View style={{ flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: t.cardBorder }}>
        <HospitalsMap markers={markers} initialRegion={initialRegion} style={{ flex: 1 }} interactive />
      </View>

      {units.length > 0 && (
        <ScrollView style={s.legend} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
          {withPos.map(({ unit, isLive }) => (
            <View key={unit.ambulance_id} style={[s.legendRow, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
              <Ionicons
                name={isLive ? (unit.visible_to_dispatch ? 'radio-outline' : 'warning-outline') : unit.on_duty ? 'time-outline' : 'moon-outline'}
                size={13}
                color={isLive ? (unit.visible_to_dispatch ? t.accentDark : '#FFB547') : t.textMuted}
              />
              <Text style={{ color: t.textPrimary, fontSize: 12, fontWeight: '600', flex: 1 }}>{unit.call_sign ?? unit.plate_number}</Text>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>
                {isLive ? (unit.visible_to_dispatch ? 'Live' : 'Stale') : unit.on_duty ? 'On duty · home base' : 'Home base'}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  title:  { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sub:    { fontSize: 12.5, marginTop: 2 },
  legend: { paddingHorizontal: 16, maxHeight: 150 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
})
