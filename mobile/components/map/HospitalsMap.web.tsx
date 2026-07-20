import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { HospitalsMapProps } from './HospitalsMap.types'

// react-native-maps is a native-only module (it imports RN internals like
// codegenNativeCommands that don't exist on web) — bundling it for web crashes
// Metro entirely. This is Metro's platform-file convention: HospitalsMap.web.tsx
// is picked automatically instead of HospitalsMap.native.tsx when building for web.
export function HospitalsMap({ markers, style, onMarkerPress }: HospitalsMapProps) {
  return (
    <View style={[s.wrap, style]}>
      <Text style={s.notice}>🗺️ Map view isn't available in the browser — showing a list instead.</Text>
      {markers.map(m => (
        <TouchableOpacity
          key={m.id}
          style={s.row}
          disabled={!onMarkerPress}
          onPress={() => onMarkerPress?.(m.id)}
        >
          <Text style={s.name}>{m.title}</Text>
          {m.subtitle && <Text style={s.sub}>{m.subtitle}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap:    { flex: 1, borderRadius: 16, padding: 16, backgroundColor: '#F2F2F2' },
  notice:  { fontSize: 12, color: '#666', marginBottom: 12, textAlign: 'center' },
  row:     { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  name:    { fontSize: 13, fontWeight: '700', color: '#111' },
  sub:     { fontSize: 11, color: '#666', marginTop: 2 },
})
