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
import { CallErrorBoundary } from '@queue/shared/components/CallErrorBoundary'

// Browser counterpart to VideoCallScreen.native.tsx (patient side). The patient never
// calls /api/virtual/token -- same as native, this reads guest_token straight off
// virtual_sessions (RLS already permits it: "Patients can read own virtual sessions"),
// falling back to a Realtime subscription while waiting for the doctor to start the
// session. Ending IS a real server call though (/api/virtual/end, now open to either
// party) -- a patient tapping "Leave" here used to only navigate away locally, leaving
// the appointment stuck in_progress for the doctor with no way back in.
const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? ''
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Props {
  navigation: any
  route: { params: { appointmentId: string; doctorName: string } }
}

interface SessionRow {
  guest_token: string
  room_name: string
  status: string
}

export function VideoCallScreen({ navigation, route }: Props) {
  const { appointmentId, doctorName } = route.params
  const [session, setSession] = useState<SessionRow | null>(null)
  const [error, setError]     = useState<string | null>(null)

  // Must be called unconditionally, before either early return below --
  // it previously lived inline in the final JSX (`<AgoraRTCProvider
  // client={useMemo(...)}>`), which only runs once session is set. The
  // first render (session still null) skipped this useMemo entirely via
  // the `if (!session) return` branch below; the moment a real session
  // arrived, the next render called it for the first time, changing the
  // hook count between renders -- React throws "Rendered more hooks than
  // during the previous render" with no error boundary above this screen,
  // which is exactly the blank white page reported when a call actually
  // starts (as opposed to the merely-slow-loading blank screen fixed in
  // App.tsx's Suspense fallback -- that one only covered the wait before
  // this component ever mounted at all).
  const agoraClient = useMemo(() => AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }), [])

  // ── Fetch session (guest_token) from Supabase, same as native ─────────────
  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function fetchOrSubscribe() {
      const { data } = await supabase
        .from('virtual_sessions')
        .select('guest_token, room_name, status')
        .eq('appointment_id', appointmentId)
        .eq('status', 'active')
        .maybeSingle()

      if (data?.guest_token && mounted) {
        setSession(data as SessionRow)
        return
      }

      if (!mounted) return
      channel = supabase
        .channel(`vs:${appointmentId}`)
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'virtual_sessions', filter: `appointment_id=eq.${appointmentId}` },
          (payload: any) => {
            const row = payload.new as SessionRow
            if (row?.guest_token && row.status === 'active' && mounted) setSession(row)
          },
        )
        .subscribe()
    }

    fetchOrSubscribe()
    return () => { mounted = false; if (channel) supabase.removeChannel(channel) }
  }, [appointmentId])

  if (!AGORA_APP_ID) {
    return (
      <View style={st.container}>
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF9F27" style={{ marginBottom: 16 }} />
          <Text style={st.errorTitle}>Video calling isn't configured</Text>
          <Text style={st.errorSub}>{error ?? 'EXPO_PUBLIC_AGORA_APP_ID is not set.'}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backCallBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (!session) {
    return (
      <View style={st.container}>
        <View style={st.center}>
          <Ionicons name="medical-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={st.waitingText}>Waiting for doctor to start the call…</Text>
        </View>
      </View>
    )
  }

  return (
    <CallErrorBoundary onLeave={handleLeave}>
      <AgoraRTCProvider client={agoraClient}>
        <CallBody
          appId={AGORA_APP_ID}
          token={session.guest_token}
          channelName={session.room_name}
          doctorName={doctorName}
          onLeave={handleLeave}
        />
      </AgoraRTCProvider>
    </CallErrorBoundary>
  )

  async function handleLeave() {
    // Best-effort -- if this fails (network blip, already-ended session) the
    // patient can still always leave locally; the doctor's own End (or the
    // stuck-call fallback in DoctorAppointmentsScreen) covers it.
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const jwt = authSession?.access_token
      if (jwt && API_URL) {
        await fetch(`${API_URL}/api/virtual/end`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
        })
      }
    } catch (e) {
      console.warn('[video] failed to end session on leave', e)
    }
    navigation.goBack()
  }
}

interface BodyProps {
  appId: string
  token: string
  channelName: string
  doctorName: string
  onLeave: () => void | Promise<void>
}

function CallBody({ appId, token, channelName, doctorName, onLeave }: BodyProps) {
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)

  useJoin({ appid: appId, channel: channelName, token, uid: 2 /* patient, matches native */ })

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
  // "Waiting for doctor..." forever with nothing to tell the patient their own
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

  const handleEndCall = useCallback(() => {
    Alert.alert('Leave call?', 'End this video consultation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: onLeave },
    ])
  }, [onLeave])

  return (
    <View style={st.container}>
      {/* Remote video — full screen background */}
      {connected ? (
        <RemoteUser user={remoteUsers[0]} playVideo playAudio style={StyleSheet.absoluteFill as any} />
      ) : joinStalled ? (
        <View style={st.waitingContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF9F27" />
          <Text style={st.errorTitle}>Could not connect</Text>
          <Text style={st.errorSub}>Check your internet connection and try again.</Text>
        </View>
      ) : (
        <View style={st.waitingContainer}>
          <Ionicons name="medical-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={st.waitingText}>Waiting for doctor…</Text>
        </View>
      )}

      {/* Local video — PiP top-right */}
      <View style={st.localPip}>
        {camEnabled
          ? <LocalVideoTrack track={localCameraTrack} play style={st.pipInner as any} />
          : <View style={[st.pipInner, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="videocam-off-outline" size={22} color="#4A6058" />
            </View>}
      </View>

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerName}>Dr. {doctorName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
          {connected
            ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' }} />
            : <Ionicons name="hourglass-outline" size={11} color="#7A9089" />}
          <CallTimer connected={connected} />
        </View>
      </View>

      {/* Controls */}
      <View style={st.controls}>
        <TouchableOpacity onPress={toggleMic} style={[st.ctrlBtn, !micEnabled && st.ctrlBtnOff]}>
          <Ionicons name={micEnabled ? 'mic-outline' : 'mic-off-outline'} size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleEndCall} style={st.endBtn}>
          <Ionicons name="call" size={26} color="#fff" />
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
function CallTimer({ connected }: { connected: boolean }) {
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
    <Text style={[st.headerStatus, { color: connected ? '#4ade80' : '#7A9089', marginTop: 0 }]}>
      {connected ? `Connected · ${fmt(elapsed)}` : 'Connecting…'}
    </Text>
  )
}

const st = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#050d09', minHeight: '100vh' as any },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  waitingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  waitingText:      { fontSize: 14, color: '#4A6058', textAlign: 'center', paddingHorizontal: 32 },
  errorTitle:       { fontSize: 18, fontWeight: '700', color: '#FF5C5C', marginBottom: 8, textAlign: 'center' },
  errorSub:         { fontSize: 13, color: '#7A9089', textAlign: 'center', lineHeight: 20 },
  backCallBtn:      { marginTop: 20, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  localPip: {
    position: 'absolute', top: 68, right: 16,
    width: 90, height: 120, borderRadius: 10,
    overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#111',
  },
  pipInner:         { flex: 1, width: '100%', height: '100%' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerName:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerStatus:     { fontSize: 12, marginTop: 3 },
  controls: {
    position: 'absolute', bottom: 32, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  ctrlBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctrlBtnOff:       { backgroundColor: 'rgba(239,68,68,0.35)' },
  endBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
  },
})
