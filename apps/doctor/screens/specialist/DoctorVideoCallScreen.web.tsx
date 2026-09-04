import React, { useCallback, useEffect, useMemo, useState } from 'react'
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

  // Must be called unconditionally, before either early return below -- it
  // previously lived inline in the final JSX (`<AgoraRTCProvider
  // client={useMemo(...)}>`), which only runs once phase === 'active'. The
  // 'loading'/'error' early returns skipped this useMemo entirely on those
  // renders; the moment the token arrived and phase flipped to 'active',
  // the next render called it for the first time, changing the hook count
  // between renders -- React throws "Rendered more hooks than during the
  // previous render" with no error boundary above this screen, i.e. the
  // call looks "in progress" (the token fetch succeeded) but the interface
  // never renders. Same bug, same fix as VideoCallScreen.web.tsx (patient side).
  const agoraClient = useMemo(() => AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }), [])

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
    <AgoraRTCProvider client={agoraClient}>
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

  useJoin({ appid: appId, channel: channelName, token, uid })

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micEnabled) as { localMicrophoneTrack: IMicrophoneAudioTrack | null }
  const { localCameraTrack }     = useLocalCameraTrack(camEnabled) as { localCameraTrack: ICameraVideoTrack | null }
  // usePublish's own effect re-runs whenever this array's REFERENCE changes
  // (its dependency array closes over the array itself, not its contents) --
  // memoized so it only actually changes when a track is really replaced,
  // not on every render this component happens to do for an unrelated reason
  // (e.g. the elapsed-timer tick, before that was isolated into CallTimer below).
  const tracksToPublish = useMemo(() => [localMicrophoneTrack, localCameraTrack], [localMicrophoneTrack, localCameraTrack])
  usePublish(tracksToPublish)

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

  const toggleMic = useCallback(() => {
    localMicrophoneTrack?.setEnabled(!micEnabled)
    setMicEnabled(v => !v)
  }, [localMicrophoneTrack, micEnabled])

  const toggleCamera = useCallback(() => {
    localCameraTrack?.setEnabled(!camEnabled)
    setCamEnabled(v => !v)
  }, [localCameraTrack, camEnabled])

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
          <CallTimer connected={connected} waitingLabel="Waiting for patient…" />
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

// Isolated so its once-a-second tick doesn't re-render CallBody itself --
// that component hosts the actual video (RemoteUser/LocalVideoTrack) and
// several reactive Agora hooks, so re-executing its whole function body
// every second was real, avoidable work on the same thread that also has to
// handle taps on the mic/camera/end buttons.
function CallTimer({ connected, waitingLabel }: { connected: boolean; waitingLabel: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!connected) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [connected])
  function fmt(s: number) {
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }
  return (
    <Text style={[st.headerStatus, { color: connected ? '#4ade80' : '#7A9089' }]}>
      {connected ? `Connected · ${fmt(elapsed)}` : waitingLabel}
    </Text>
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
