import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import MapView, { Marker, Callout } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import type { HospitalsMapProps, HospitalsMapMarker } from './HospitalsMap.types'

/**
 * With no `provider` prop, react-native-maps uses Apple Maps on iOS — no key,
 * always works — and Google Maps on Android, which draws a blank grey grid if
 * it cannot authenticate: no key in the manifest, a key the project won't
 * honour, billing switched off, or no Play Services on the device.
 *
 * A grey rectangle is the worst failure available here. It reads as a map
 * still loading, or a map with nothing on it — and on the emergency screens
 * that means "no ambulances near me", the opposite of the truth. So we detect
 * the failure and say so, listing what would have been pinned.
 *
 * HOW WE DETECT IT, AND WHY NOT THE OBVIOUS WAY. Three earlier versions tried
 * to predict the failure by looking for the API key in config, and all three
 * were wrong in the same direction — they hid maps that worked:
 *
 *   1. Constants.expoConfig.android.config.googleMaps.apiKey — Expo strips
 *      android.config out of the runtime manifest.
 *   2. Constants.expoConfig.extra.<flag> — a release build reads expoConfig
 *      from the expo-updates manifest, which carries no `extra` at all.
 *   3. process.env.EXPO_PUBLIC_… — never reaches the JS bundle on EAS here,
 *      at any visibility, though the same variable does reach app.config.js
 *      (verified by unzipping three builds: key present in AndroidManifest,
 *      zero occurrences of even "AIzaSy" in index.android.bundle).
 *
 * So this no longer guesses from configuration. `onMapReady` fires when Google
 * Maps has actually initialised; if it hasn't fired after a grace period, the
 * map is genuinely broken whatever the reason. That cannot hide a working map,
 * and it catches failures config inspection never could — an expired key, a
 * disabled billing account, a device without Play Services.
 */

/** How long to let the map initialise before calling it broken. */
const READY_GRACE_MS = 6000

function MapUnavailable({ markers }: { markers: HospitalsMapMarker[] }) {
  return (
    <View style={s.fallback}>
      <View style={s.fallbackHead}>
        <Ionicons name="map-outline" size={16} color="#8A8A8A" />
        <Text style={s.fallbackTitle}>Map unavailable</Text>
      </View>
      {markers.slice(0, 4).map(m => (
        <View key={m.id} style={s.fallbackRow}>
          <Ionicons name="location" size={12} color="#00A651" />
          <Text style={s.fallbackText} numberOfLines={1}>
            {m.title}{m.subtitle ? ` — ${m.subtitle}` : ''}
          </Text>
        </View>
      ))}
      {markers.length > 4 && <Text style={s.fallbackMore}>+{markers.length - 4} more</Text>}
    </View>
  )
}

export function HospitalsMap({
  markers, initialRegion, style, interactive = true, showsUserLocation, onMarkerPress,
}: HospitalsMapProps) {
  const [ready, setReady] = useState(false)
  const [graceOver, setGraceOver] = useState(false)

  useEffect(() => {
    // iOS uses Apple Maps and needs no key, so never second-guess it there.
    if (Platform.OS !== 'android') return
    const t = setTimeout(() => setGraceOver(true), READY_GRACE_MS)
    return () => clearTimeout(t)
  }, [])

  const failed = Platform.OS === 'android' && graceOver && !ready

  return (
    <View style={style}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={showsUserLocation}
        onMapReady={() => setReady(true)}
      >
        {markers.map(m => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            title={m.title}
            pinColor="#00CC66"
          >
            {onMarkerPress && (
              <Callout onPress={() => onMarkerPress(m.id)}>
                <View style={s.callout}>
                  <Text style={s.calloutName}>{m.title}</Text>
                  {m.subtitle && <Text style={s.calloutSub}>{m.subtitle}</Text>}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
                    <Text style={[s.calloutLink, { marginTop: 0 }]}>Tap to view</Text>
                    <Ionicons name="arrow-forward" size={11} color="#00A651" />
                  </View>
                </View>
              </Callout>
            )}
          </Marker>
        ))}
      </MapView>

      {/* Covers the grey grid only once the map has demonstrably failed to
          initialise. If onMapReady arrives late, this disappears. */}
      {failed && (
        <View style={StyleSheet.absoluteFill}>
          <MapUnavailable markers={markers} />
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  callout:     { padding: 6, minWidth: 140 },
  calloutName: { fontSize: 13, fontWeight: '700', color: '#111' },
  calloutSub:  { fontSize: 11, color: '#666', marginTop: 2 },
  calloutLink: { fontSize: 11, color: '#00A651', marginTop: 4, fontWeight: '600' },

  fallback:      { flex: 1, borderWidth: 1, borderColor: 'rgba(128,128,128,0.3)', borderRadius: 14,
                   backgroundColor: '#0E0E0E', padding: 12, justifyContent: 'center', gap: 6 },
  fallbackHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  fallbackTitle: { fontSize: 12, fontWeight: '700', color: '#8A8A8A' },
  fallbackRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fallbackText:  { fontSize: 12, color: '#8A8A8A', flex: 1 },
  fallbackMore:  { fontSize: 11, color: '#8A8A8A', marginLeft: 18 },
})
