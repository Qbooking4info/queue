import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface Props {
  navigation: any
  route: { params: { appointmentId: string; patientName: string } }
}

// Agora's RN SDK relies on native modules that don't exist in a browser — video calls
// only work in the native app. This keeps the web bundle from crashing on load, same
// pattern used for the maps screens (see components/map/HospitalsMap.web.tsx).
export function DoctorVideoCallScreen({ navigation, route }: Props) {
  const { patientName } = route.params

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050d09" />
      <View style={st.center}>
        <Ionicons name="videocam-off-outline" size={48} color="rgba(255,255,255,0.3)" />
        <Text style={st.title}>Video calls aren't available in the browser</Text>
        <Text style={st.sub}>
          Open the Queue app on your phone to start the video consultation with {patientName}.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={st.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#050d09' },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  title:      { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },
  sub:        { fontSize: 13, color: '#7A9089', textAlign: 'center', lineHeight: 20 },
  backBtn:    { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  backBtnText:{ color: '#fff', fontWeight: '700' },
})
