import { View, Text, StyleSheet, Platform } from 'react-native'
import MapView, { Marker, Callout } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import type { HospitalsMapProps, HospitalsMapMarker } from './HospitalsMap.types'

/**
 * With no `provider` prop, react-native-maps uses Apple Maps on iOS — no key,
 * always works — and Google Maps on Android, which renders a blank grey grid
 * unless a Maps SDK key is present in AndroidManifest. app.config.js injects
 * one from GOOGLE_MAPS_ANDROID_KEY; when that is unset the grid is what you get.
 *
 * A grey rectangle is the worst possible failure here, because it looks like a
 * map that is loading, or a map with nothing on it. On the emergency screens
 * that reads as "there are no ambulances near me" — the opposite of the truth.
 * So when the key is missing we say so, and fall back to listing what would
 * have been pinned. Less useful than a map, far more useful than a lie.
 */
function androidMapsKeyMissing(): boolean {
  if (Platform.OS !== 'android') return false
  // Reads the flag app.config.js publishes through `extra`, NOT
  // android.config.googleMaps.apiKey — Expo strips android.config out of the
  // runtime manifest, so checking it there reported "missing" on every build
  // and hid maps that worked perfectly well.
  const configured = (Constants.expoConfig?.extra as { androidMapsKeyConfigured?: boolean } | undefined)
    ?.androidMapsKeyConfigured
  return configured !== true
}

function MapUnavailable({ markers, style }: { markers: HospitalsMapMarker[]; style?: object }) {
  return (
    <View style={[s.fallback, style]}>
      <View style={s.fallbackHead}>
        <Ionicons name="map-outline" size={16} color="#8A8A8A" />
        <Text style={s.fallbackTitle}>Map unavailable on this build</Text>
      </View>
      {markers.slice(0, 4).map(m => (
        <View key={m.id} style={s.fallbackRow}>
          <Ionicons name="location" size={12} color="#00A651" />
          <Text style={s.fallbackText} numberOfLines={1}>
            {m.title}{m.subtitle ? ` — ${m.subtitle}` : ''}
          </Text>
        </View>
      ))}
      {markers.length > 4 && (
        <Text style={s.fallbackMore}>+{markers.length - 4} more</Text>
      )}
    </View>
  )
}

export function HospitalsMap({
  markers, initialRegion, style, interactive = true, showsUserLocation, onMarkerPress,
}: HospitalsMapProps) {
  if (androidMapsKeyMissing()) {
    return <MapUnavailable markers={markers} style={style} />
  }

  return (
    <MapView
      style={style}
      initialRegion={initialRegion}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={showsUserLocation}
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
  )
}

const s = StyleSheet.create({
  callout:     { padding: 6, minWidth: 140 },
  calloutName: { fontSize: 13, fontWeight: '700', color: '#111' },
  calloutSub:  { fontSize: 11, color: '#666', marginTop: 2 },
  calloutLink: { fontSize: 11, color: '#00A651', marginTop: 4, fontWeight: '600' },

  fallback:      { borderWidth: 1, borderColor: 'rgba(128,128,128,0.3)', borderRadius: 14,
                   padding: 12, justifyContent: 'center', gap: 6 },
  fallbackHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  fallbackTitle: { fontSize: 12, fontWeight: '700', color: '#8A8A8A' },
  fallbackRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fallbackText:  { fontSize: 12, color: '#8A8A8A', flex: 1 },
  fallbackMore:  { fontSize: 11, color: '#8A8A8A', marginLeft: 18 },
})
