import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { HospitalsMap } from '../map/HospitalsMap'
import { fetchJobPatientLocation, subscribeToPatientLocation, formatEta } from '../../lib/ambulance-api'

/**
 * The crew's side of the live picture: where the patient is now, and how long
 * until we reach them.
 *
 * Until this existed the crew had a pickup address and a static lat/lng
 * captured at booking. That is fine for the drive across town and wrong for
 * the last hundred metres, which is where the minutes actually go — the caller
 * has come down to the street, or moved to a landmark, or was never where the
 * pin said. The patient's app shares position for the life of the job; this
 * shows it.
 *
 * Falls back to the booked pickup point when the patient is not sharing (older
 * app version, permission denied, phone dead). The map still works, it just
 * shows the pin instead of the person, and says which it is showing — a crew
 * that thinks a stale pin is live is worse off than one that knows it is a pin.
 */

interface Props {
  requestId: string
  /** The pickup point captured at booking — the fallback, and the map's anchor. */
  pickup: { lat: number; lng: number } | null
  /** Server-computed road ETA for this job, refreshed as the unit moves. */
  etaSeconds: number | null
  /** Where the crew's own unit is, when known. */
  unitPos?: { lat: number; lng: number } | null
  label?: string
}

export function JobPatientMap({ requestId, pickup, etaSeconds, unitPos, label = 'Patient' }: Props) {
  const { theme: t } = useTheme()
  const [live, setLive] = useState<{ lat: number; lng: number; recordedAt: string } | null>(null)
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchJobPatientLocation(requestId).then(pos => { if (!cancelled) setLive(pos) })

    channelRef.current?.unsubscribe()
    channelRef.current = subscribeToPatientLocation(requestId, setLive)

    return () => {
      cancelled = true
      channelRef.current?.unsubscribe()
      channelRef.current = null
    }
  }, [requestId])

  const target = live ?? pickup
  if (!target) return null

  const markers = [
    { id: 'patient', latitude: target.lat, longitude: target.lng, title: label,
      subtitle: live ? 'Live position' : 'Booked pickup point' },
    ...(unitPos ? [{ id: 'unit', latitude: unitPos.lat, longitude: unitPos.lng, title: 'Your unit' }] : []),
  ]

  // Hand off to whatever the crew already navigates with. Turn-by-turn inside
  // this app would be a worse version of a solved problem, and a driver
  // mid-emergency should be using the maps app they know.
  function openDirections() {
    const dest = `${target!.lat},${target!.lng}`
    const url = Platform.select({
      ios: `maps://?daddr=${dest}&dirflg=d`,
      android: `google.navigation:q=${dest}&mode=d`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    })!
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`).catch(() => {}),
    )
  }

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <Ionicons name={live ? 'navigate' : 'pin'} size={14} color={live ? '#00C265' : t.textMuted} />
        <Text style={[st.headText, { color: t.textSecondary }]}>
          {live ? 'Live patient position' : 'Booked pickup point'}
        </Text>
        {etaSeconds != null && (
          <Text style={[st.eta, { color: t.textPrimary }]}>ETA {formatEta(etaSeconds)}</Text>
        )}
      </View>

      <HospitalsMap
        style={st.map}
        markers={markers}
        initialRegion={{
          latitude: target.lat,
          longitude: target.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      />

      <TouchableOpacity onPress={openDirections} style={[st.navBtn, { borderColor: t.cardBorder }]}>
        <Ionicons name="navigate-outline" size={16} color={t.textPrimary} />
        <Text style={[st.navBtnText, { color: t.textPrimary }]}>Navigate</Text>
      </TouchableOpacity>
    </View>
  )
}

const st = StyleSheet.create({
  wrap:       { marginTop: 14 },
  headRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText:   { fontSize: 12, fontWeight: '600', flex: 1 },
  eta:        { fontSize: 12.5, fontWeight: '800' },
  map:        { height: 170, borderRadius: 14, marginTop: 8, overflow: 'hidden' },
  navBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderWidth: 1, borderRadius: 12, paddingVertical: 11, marginTop: 10 },
  navBtnText: { fontSize: 14, fontWeight: '700' },
})
