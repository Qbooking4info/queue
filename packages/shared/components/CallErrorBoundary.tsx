import { Component, type ReactNode } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Every call screen (patient/doctor, web/native) wraps its actual call UI in
// this. Found live: agora-rtc-sdk-ng bundles its own HTTP client for internal
// requests (config-distribute, gateway selection, ...) with a hardcoded
// timeout -- under real network/CPU strain that request can time out and
// throw an UNCAUGHT exception with no try/catch anywhere in the Agora React
// wrapper hooks. With no error boundary above it, that crash took the whole
// screen down to a blank white page with literally nothing on it -- no end
// button, no way back, matching "the call is ongoing but nothing is
// clickable" exactly. This can't prevent that specific error (it's inside a
// third-party SDK), but it guarantees a crash of ANY kind here always still
// leaves a working "Leave call" button, never a dead screen.
interface Props {
  onLeave: () => void | Promise<void>
  children: ReactNode
}
interface State { hasError: boolean }

export class CallErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[video] call screen crashed, falling back to leave-only UI', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <View style={st.container}>
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF9F27" style={{ marginBottom: 16 }} />
          <Text style={st.title}>Something went wrong with this call</Text>
          <Text style={st.sub}>You can leave and try rejoining from the appointment.</Text>
          <TouchableOpacity
            onPress={() => { this.props.onLeave() }}
            style={st.leaveBtn}
          >
            <Text style={st.leaveBtnText}>Leave call</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050d09' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  title: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  sub: { fontSize: 13, color: '#7A9089', textAlign: 'center', lineHeight: 19 },
  leaveBtn: { marginTop: 16, backgroundColor: '#dc2626', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  leaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
