import { View, Text, StyleSheet } from 'react-native'
import MapView, { Marker, Callout } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import type { HospitalsMapProps } from './HospitalsMap.types'

export function HospitalsMap({
  markers, initialRegion, style, interactive = true, showsUserLocation, onMarkerPress,
}: HospitalsMapProps) {
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
})
