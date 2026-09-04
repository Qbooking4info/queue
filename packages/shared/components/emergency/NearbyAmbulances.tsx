import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { fetchNearbyUnits } from '../../lib/ambulance-api'
import { HospitalsMap } from '../map/HospitalsMap'

/**
 * What someone sees before they book: are there ambulances near me, and how near.
 *
 * The question this answers is not logistical, it is "is this app going to
 * find me anything, or am I wasting the only minutes I have?" A map with
 * three rigs on it answers that in a glance; a spinner and a promise does not.
 * When there are none it says so plainly rather than showing an empty map —
 * knowing to start dialling immediately is worth more than a hopeful blank.
 *
 * Polled, not subscribed: the realtime feed on ambulance_current_location is
 * restricted by RLS to participants in an active job, which is correct — it is
 * the raw fleet position feed — so before a booking there is nothing to
 * subscribe to. `nearby_available_units` returns coarse, anonymous positions
 * for exactly this purpose.
 */

const POLL_MS = 10_000

/**
 * Same model as the server's estimateEtaSeconds — straight line × 1.4 winding
 * at 22 km/h. Rough on purpose and labelled as such: the accurate road-routed
 * number appears once a unit is assigned and there is one vehicle worth paying
 * a routing call for, rather than a dozen that are not coming.
 */
function roughMinutes(distanceM: number): number {
  return Math.max(1, Math.round(((distanceM * 1.4) / 1000 / 22) * 60))
}

interface Props {
  coords: { latitude: number; longitude: number } | null
  style?: object
}

export function NearbyAmbulances({ coords, style }: Props) {
  const { theme: t } = useTheme()
  const [units, setUnits] = useState<Array<{ lat: number; lng: number; tier: string; distanceM: number }> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!coords) return
    let cancelled = false

    const load = async () => {
      const rows = await fetchNearbyUnits(coords.latitude, coords.longitude)
      if (!cancelled) setUnits(rows)
    }

    load()
    timerRef.current = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [coords?.latitude, coords?.longitude])

  if (!coords) return null

  if (units === null) {
    return (
      <View style={[st.row, style]}>
        <ActivityIndicator color={t.textMuted} size="small" />
        <Text style={[st.muted, { color: t.textMuted }]}>Looking for ambulances near you…</Text>
      </View>
    )
  }

  if (units.length === 0) {
    return (
      <View style={[st.emptyBox, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }, style]}>
        <Ionicons name="alert-circle-outline" size={16} color={t.danger} />
        <Text style={[st.emptyText, { color: t.danger }]}>
          No ambulances are on duty near you right now. You can still request one, but start
          calling the numbers below at the same time.
        </Text>
      </View>
    )
  }

  const nearest = units[0]
  const markers = [
    { id: 'me', latitude: coords.latitude, longitude: coords.longitude, title: 'You' },
    ...units.map((u, i) => ({
      id: `unit-${i}`,
      latitude: u.lat,
      longitude: u.lng,
      title: 'Ambulance',
      subtitle: `${u.tier} · ${roughMinutes(u.distanceM)} min away`,
    })),
  ]

  return (
    <View style={style}>
      <View style={st.row}>
        <Ionicons name="pulse" size={15} color={t.accentDark} />
        <Text style={[st.headline, { color: t.textPrimary }]}>
          {units.length} ambulance{units.length === 1 ? '' : 's'} near you
        </Text>
        <Text style={[st.muted, { color: t.textMuted }]}>
          · nearest about {roughMinutes(nearest.distanceM)} min
        </Text>
      </View>

      <HospitalsMap
        style={st.map}
        markers={markers}
        initialRegion={{
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      />

      <Text style={[st.footnote, { color: t.textMuted }]}>
        Live positions, updated every few seconds. Times are estimates until a crew accepts.
      </Text>
    </View>
  )
}

const st = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  headline:  { fontSize: 13.5, fontWeight: '700' },
  muted:     { fontSize: 12.5 },
  map:       { height: 180, borderRadius: 14, marginTop: 10, overflow: 'hidden' },
  footnote:  { fontSize: 11, marginTop: 6, lineHeight: 15 },
  emptyBox:  { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 12 },
  emptyText: { fontSize: 12.5, lineHeight: 18, flex: 1 },
})
