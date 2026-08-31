import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import AgoraRTC, {
  AgoraRTCProvider,
  LocalVideoTrack,
  RemoteUser,
  useConnectionState,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
} from 'agora-rtc-react'
import { supabase } from '@queue/shared/lib/supabase'

// Browser counterpart to DoctorVideoCallScreen.native.tsx -- same token fetch, same
// /api/virtual/end on hangup, same uid (1, host), just agora-rtc-react's Web SDK
// hooks in place of react-native-agora's native engine. Ports the exact flow already
// proven in web/src/components/video/VideoCallPanel.tsx (the hospital-dashboard
// version of this same screen) rather than inventing a new one.
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Props {
  navigation: any
  route: { params: { appointmentId: string; patientName: string } }
}

interface TokenResponse {
  token:       string
  channelName: string
  uid:         number
  appId:       string
}

export function DoctorVideoCallScreen({ navigation, route }: Props) {
  const { appointmentId, patientName } = route.params

  const [phase, setPhase]   = useState<'loading' | 'active' | 'error'>('loading')
  const [error, setError]   = useState<string | null>(null)
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null)

  useEffect(() => {
    let active = true

    async function startCall() {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) { setError('Not authenticated'); setPhase('error'); return }
      if (!API_URL) { setError('API URL not configured. Set EXPO_PUBLIC_API_URL in .env'); setPhase('error'); return }

      try {
        const res = await fetch(`${API_URL}/api/virtual/token`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); setPhase('error'); return }
        if (!active) return
        setTokenData(json as TokenResponse)
        setPhase('active')
      } catch (e: any) {
        if (active) { setError(e.message ?? 'Network error'); setPhase('error') }
      }
    }

    startCall()
    return () => { active = false }
  }, [appointmentId])

  async function handleEndSession() {
    Alert.alert('End session?', 'This will end the call for both you and the patient.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const jwt = session?.access_token
            if (jwt && API_URL) {
              await fetch(`${API_URL}/api/virtual/end`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointmentId }),
              })
            }
          } catch (err) {
            console.warn('[video] failed to end session on leave', err)
          }
          navigation.goBack()
        },
      },
    ])
  }

  if (phase === 'error') {
    return (
      <View style={st.container}>
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF9F27" style={{ marginBottom: 16 }} />
          <Text style={st.errorTitle}>Could not start call</Text>
          <Text style={st.errorSub}>{error}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backCallBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (phase === 'loading' || !tokenData) {
    return (
      <View style={st.container}>
        <View style={st.center}>
          <Text style={st.loadingText}>Generating secure call token…</Text>
        </View>
      </View>
    )
  }

  return (
    <AgoraRTCProvider client={useMemo(() => AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }), [])}>
      <CallBody
        appId={tokenData.appId}
        token={tokenData.token}
        channelName={tokenData.channelName}
        uid={tokenData.uid}
        patientName={patientName}
        onEnd={handleEndSession}
      />
    </AgoraRTCProvider>
  )
}

interface BodyProps {
  appId: string
  token: string
  channelName: string
  uid: number
  patientName: string
  onEnd: () => void
}

function CallBody({ appId, token, channelName, uid, patientName, onEnd }: BodyProps) {
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)
  const [elapsed, setElapsed]       = useState(0)

  useJoin({ appid: appId, channel: channelName, token, uid })

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micEnabled) as { localMicrophoneTrack: IMicrophoneAudioTrack | null }
  const { localCameraTrack }     = useLocalCameraTrack(camEnabled) as { localCameraTrack: ICameraVideoTrack | null }
  usePublish([localMicrophoneTrack, localCameraTrack])

  const remoteUsers = useRemoteUsers()
  const connected = remoteUsers.length > 0

  // Our OWN join to Agora can stall at the network level with no error at all --
  // useJoin never throws for that, it just leaves connectionState stuck at
  // 'CONNECTING'/'RECONNECTING' indefinitely. Without this, the screen would sit on
  // "Waiting for X to join..." forever with nothing to tell the user their own
  // connection never actually went through.
  const connectionState = useConnectionState()
  const [joinStalled, setJoinStalled] = useState(false)
  useEffect(() => {
    if (connectionState === 'CONNECTED') { setJoinStalled(false); return }
    const t = setTimeout(() => setJoinStalled(true), 20000)
    return () => clearTimeout(t)
  }, [connectionState])

  useEffect(() => {
    if (!connected) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [connected])

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  function toggleMic() {
    localMicrophoneTrack?.setEnabled(!micEnabled)
    setMicEnabled(v => !v)
  }

  function toggleCamera() {
    localCameraTrack?.setEnabled(!camEnabled)
    setCamEnabled(v => !v)
  }

  return (
    <View style={st.container}>
      {/* Remote video — full screen */}
      {connected ? (
        <RemoteUser user={remoteUsers[0]} playVideo playAudio style={StyleSheet.absoluteFill as any} />
      ) : joinStalled ? (
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF9F27" style={{ marginBottom: 8 }} />
          <Text style={st.errorTitle}>Could not connect</Text>
          <Text style={st.errorSub}>Check your internet connection and try again.</Text>
        </View>
      ) : (
        <View style={st.center}>
          <Ionicons name="person-circle-outline" size={52} color="#4A6058" />
          <Text style={st.waitingText}>Waiting for {patientName} to join…</Text>
        </View>
      )}

      {/* Local video PiP — top right */}
      <View style={st.localPip}>
        {camEnabled
          ? <LocalVideoTrack track={localCameraTrack} play style={st.pipInner as any} />
          : <View style={[st.pipInner, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="videocam-off-outline" size={22} color="#4A6058" />
            </View>}
      </View>

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerName}>{patientName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name={connected ? 'ellipse' : 'time-outline'} size={connected ? 8 : 12} color={connected ? '#4ade80' : '#7A9089'} />
          <Text style={[st.headerStatus, { color: connected ? '#4ade80' : '#7A9089' }]}>
            {connected ? `Connected · ${fmt(elapsed)}` : 'Waiting for patient…'}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={st.controls}>
        <TouchableOpacity onPress={toggleMic} style={[st.ctrlBtn, !micEnabled && st.ctrlBtnOff]}>
          <Ionicons name={micEnabled ? 'mic-outline' : 'mic-off-outline'} size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity onPress={onEnd} style={st.endBtn}>
          <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleCamera} style={[st.ctrlBtn, !camEnabled && st.ctrlBtnOff]}>
          <Ionicons name={camEnabled ? 'videocam-outline' : 'videocam-off-outline'} size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#050d09', minHeight: '100vh' as any },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  waitingText:  { fontSize: 14, color: '#4A6058', textAlign: 'center' },
  loadingText:  { fontSize: 13, color: '#4A6058', marginTop: 14, textAlign: 'center' },
  errorTitle:   { fontSize: 18, fontWeight: '700', color: '#FF5C5C', marginBottom: 8, textAlign: 'center' },
  errorSub:     { fontSize: 13, color: '#7A9089', textAlign: 'center', lineHeight: 20 },
  backCallBtn:  { marginTop: 20, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  localPip: {
    position: 'absolute', top: 68, right: 16,
    width: 90, height: 120, borderRadius: 10,
    overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#111',
  },
  pipInner:     { flex: 1, width: '100%', height: '100%' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerName:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerStatus: { fontSize: 12, marginTop: 3 },
  controls: {
    position: 'absolute', bottom: 32, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  ctrlBtn:    { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  ctrlBtnOff: { backgroundColor: 'rgba(239,68,68,0.35)' },
  endBtn:     { width: 64, height: 64, borderRadius: 32, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
})
