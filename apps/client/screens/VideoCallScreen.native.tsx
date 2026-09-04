import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, PermissionsAndroid, Linking } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  ConnectionStateType,
  IRtcEngine,
  RtcSurfaceView,
  VideoSourceType,
} from 'react-native-agora'
import { supabase } from '@queue/shared/lib/supabase'
import { applyAudioProfile, applyVideoProfile, signalFromQuality, SignalLevel } from '@queue/shared/lib/agoraCall'
import { CallErrorBoundary } from '@queue/shared/components/CallErrorBoundary'

const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? ''
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

/** "Adaeze Nwachukwu" -> "AN". Falls back to a single glyph for one-word names. */
function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

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

  const engine    = useRef<IRtcEngine | null>(null)
  // ML2: track mount state to avoid setting state after unmount
  const mountedRef = useRef(true)
  const [session,      setSession]      = useState<SessionRow | null>(null)
  const [joined,       setJoined]       = useState(false)
  const [remoteUid,    setRemoteUid]    = useState<number | null>(null)
  const [micEnabled,   setMicEnabled]   = useState(true)
  // Consultations open as a voice call: faster to connect and far more reliable on a
  // weak mobile link. Either side can raise video mid-call via the camera control.
  const [camEnabled,   setCamEnabled]   = useState(false)
  const [remoteVideoOn, setRemoteVideoOn] = useState(false)
  const [signal,       setSignal]       = useState<SignalLevel | null>(null)
  // Agora's video module is only initialised the first time video is switched on.
  const videoStarted = useRef(false)
  const [elapsed,      setElapsed]      = useState(0)
  const [error,        setError]        = useState<string | null>(null)

  // ML2: clear mountedRef on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── 1. Fetch session (guest_token) from Supabase ─────────────────────────
  useEffect(() => {
    let mounted = true

    async function fetchOrSubscribe() {
      // Try immediate read first
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

      // Doctor hasn't started yet — subscribe to Realtime for this session
      // ML2: guard against subscribing after unmount
      if (!mountedRef.current) return
      const channel = supabase
        .channel(`vs:${appointmentId}`)
        .on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table: 'virtual_sessions',
            filter: `appointment_id=eq.${appointmentId}`,
          },
          (payload: any) => {
            const row = payload.new as SessionRow
            if (row?.guest_token && row.status === 'active' && mounted) {
              setSession(row)
            }
          },
        )
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }

    const cleanup = fetchOrSubscribe()
    return () => {
      mounted = false
      cleanup.then(fn => fn?.())
    }
  }, [appointmentId])

  // ── 2. Init Agora and join channel when session is ready ─────────────────
  useEffect(() => {
    if (!session) return
    const resolvedSession = session
    let active = true
    let joinTimeout: ReturnType<typeof setTimeout> | undefined

    async function initAndJoin() {
      // Request Android permissions at runtime
      if (Platform.OS === 'android') {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ])
      }
      if (!active) return

      engine.current = createAgoraRtcEngine()
      engine.current.initialize({
        appId: AGORA_APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      })

      engine.current.addListener('onJoinChannelSuccess', () => {
        if (!active) return
        if (joinTimeout) clearTimeout(joinTimeout)
        setJoined(true)
      })
      engine.current.addListener('onUserJoined', (_conn: any, uid: number) => {
        if (active) setRemoteUid(uid)
      })
      engine.current.addListener('onUserOffline', (_conn: any, uid: number) => {
        if (active && uid === remoteUid) setRemoteUid(null)
      })
      engine.current.addListener('onRemoteVideoStateChanged', (_c: any, _uid: number, state: number) => {
        // 0 = stopped, 1 = starting, 2 = decoding, 3 = frozen. Only 2 means we have
        // a live remote picture worth switching the layout for.
        if (active) setRemoteVideoOn(state === 2)
      })
      engine.current.addListener('onNetworkQuality', (_c: any, uid: number, tx: number, rx: number) => {
        // uid 0 is the local user -- the only one whose uplink we can act on.
        if (active && uid === 0) setSignal(signalFromQuality(tx, rx))
      })
      engine.current.addListener('onError', (errCode: number) => {
        if (!active) return
        // MH4: Agora error codes 134/135 = camera/microphone permission denied on iOS
        const isPermissionError = errCode === 134 || errCode === 135 || errCode === 17
        if (isPermissionError) {
          setError('Camera or microphone access is required for video calls.')
          Alert.alert(
            'Permission required',
            'Camera and microphone access is required. Please enable it in Settings › Queue.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openURL('app-settings:') },
            ]
          )
        } else {
          setError(`Call error ${errCode}`)
        }
      })
      // A join can also fail purely at the network level with no onError at all --
      // Agora's SDK can silently retry a stalled connection for up to 20 minutes before
      // ever reporting ConnectionStateFailed (see ConnectionStateType docs). Don't wait
      // that long: this is a fast-path for when the SDK *does* report it promptly; the
      // joinTimeout below is the real safety net regardless.
      engine.current.addListener('onConnectionStateChanged', (_conn: any, state: number) => {
        if (!active) return
        if (state === ConnectionStateType.ConnectionStateFailed) {
          if (joinTimeout) clearTimeout(joinTimeout)
          setError('Could not connect. Check your internet connection and try again.')
        }
      })

      // Audio-only join. enableVideo()/startPreview() are deferred until the user
      // actually turns the camera on, so we neither light the camera LED nor spend
      // uplink on a video track nobody asked for.
      await engine.current.enableAudio()
      applyAudioProfile(engine.current)

      engine.current.joinChannel(
        resolvedSession.guest_token,
        resolvedSession.room_name,
        2, // patient uid
        {
          clientRoleType:         ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack:     false,
          autoSubscribeAudio:     true,
          // Still subscribe to remote video: if the doctor raises their camera we
          // want to show it immediately without a renegotiation round-trip.
          autoSubscribeVideo:     true,
        },
      )

      // Client-side safety net: if we never hear onJoinChannelSuccess (or an error)
      // within 20s, stop waiting silently and tell the patient something's wrong rather
      // than sitting on "Connecting you to the doctor..." forever with no feedback at
      // all -- this is exactly the symptom a stalled network connection produces.
      joinTimeout = setTimeout(() => {
        if (!active) return
        setError('Could not connect. Check your internet connection and try again.')
      }, 20000)
    }

    initAndJoin().catch(e => setError(e.message))

    return () => {
      active = false
      if (joinTimeout) clearTimeout(joinTimeout)
      engine.current?.leaveChannel()
      engine.current?.release()
      engine.current = null
    }
  }, [session])

  // ── 3. Elapsed timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!joined) return
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [joined])

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  function toggleMic() {
    if (micEnabled) {
      engine.current?.muteLocalAudioStream(true)
      setMicEnabled(false)
    } else {
      engine.current?.muteLocalAudioStream(false)
      setMicEnabled(true)
    }
  }

  async function toggleCamera() {
    const eng = engine.current
    if (!eng) return

    if (camEnabled) {
      eng.updateChannelMediaOptions({ publishCameraTrack: false })
      eng.stopPreview()
      setCamEnabled(false)
      return
    }

    // First time up: initialise the video module and apply the encoder profile
    // before publishing, so the very first frame the doctor sees is already at
    // full quality rather than negotiating up from Agora's low default.
    if (!videoStarted.current) {
      await eng.enableVideo()
      applyVideoProfile(eng)
      videoStarted.current = true
    }
    eng.startPreview()
    eng.updateChannelMediaOptions({ publishCameraTrack: true })
    setCamEnabled(true)
  }

  // Split out so the error boundary can call this directly without the
  // confirm dialog -- if the screen already crashed, "are you sure?" is just
  // friction, not a safeguard.
  async function doLeave() {
    // Real server call now, not just a local goBack -- previously a patient
    // ending the call here had no server-side effect at all, leaving the
    // appointment stuck in_progress for the doctor with no way back in.
    // Best-effort: if this fails, still leave locally -- the doctor's own
    // End (or the stuck-call rejoin path) covers it.
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

  function handleEndCall() {
    Alert.alert('Leave call?', 'End this video consultation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: doLeave },
    ])
  }

  return (
    <CallErrorBoundary onLeave={doLeave}>
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050d09" />

      {/* Remote video fills the screen only once the doctor actually raises their
          camera. Until then this is a voice call, and we show a calm audio layout
          rather than a black rectangle. */}
      {remoteUid != null && remoteVideoOn ? (
        <RtcSurfaceView
          canvas={{ uid: remoteUid }}
          style={StyleSheet.absoluteFill}
        />
      ) : remoteUid != null ? (
        <View style={st.audioStage}>
          <View style={st.avatarRing}>
            <View style={st.avatar}>
              <Text style={st.avatarInitials}>{initials(doctorName)}</Text>
            </View>
          </View>
          <Text style={st.audioName}>Dr. {doctorName}</Text>
          <Text style={st.audioHint}>Voice consultation · camera off</Text>
          {error && <Text style={st.errorText}>{error}</Text>}
        </View>
      ) : (
        <View style={st.waitingContainer}>
          <View style={st.pulseRing}>
            <Ionicons name="videocam-outline" size={34} color="#4ade80" />
          </View>
          <Text style={st.waitingText}>
            {session ? 'Connecting you to the doctor…' : 'Waiting for the doctor to start the consultation…'}
          </Text>
          {error && <Text style={st.errorText}>{error}</Text>}
        </View>
      )}

      {/* Local video — PiP top-right */}
      {joined && camEnabled && (
        <View style={st.localPip}>
          <RtcSurfaceView
            canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
            style={st.pipInner}
          />
        </View>
      )}

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerName}>Dr. {doctorName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
          {joined && remoteUid != null
            ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' }} />
            : <Ionicons name="hourglass-outline" size={11} color="#7A9089" />
          }
          <Text style={[st.headerStatus, { color: joined && remoteUid != null ? '#4ade80' : '#7A9089', marginTop: 0 }]}>
            {joined && remoteUid != null ? `Connected · ${fmt(elapsed)}` : 'Connecting…'}
          </Text>

          {joined && signal && (
            <View style={st.signalWrap}>
              <View style={st.bars}>
                {[1, 2, 3, 4].map(i => (
                  <View
                    key={i}
                    style={[
                      st.bar,
                      { height: 4 + i * 2 },
                      i <= signal.bars ? { backgroundColor: signal.color } : st.barOff,
                    ]}
                  />
                ))}
              </View>
              <Text style={[st.signalLabel, { color: signal.color }]}>{signal.label}</Text>
            </View>
          )}
        </View>

        {/* Only nudge about video when the link is genuinely struggling AND we are
            the one spending uplink on it. */}
        {signal?.degraded && camEnabled && (
          <Text style={st.degradedHint}>Weak connection — turning your camera off will help</Text>
        )}
      </View>

      {/* Controls */}
      <View style={st.controls}>
        <View style={st.ctrlItem}>
          <TouchableOpacity
            onPress={toggleMic}
            accessibilityLabel={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
            activeOpacity={0.8}
            style={[st.ctrlBtn, !micEnabled && st.ctrlBtnOff]}
          >
            <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={24} color={micEnabled ? '#E8F5EF' : '#050d09'} />
          </TouchableOpacity>
          <Text style={st.ctrlLabel}>{micEnabled ? 'Mute' : 'Unmute'}</Text>
        </View>

        <View style={st.ctrlItem}>
          <TouchableOpacity onPress={handleEndCall} accessibilityLabel="End call" activeOpacity={0.85} style={st.endBtn}>
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <Text style={[st.ctrlLabel, { color: '#FF7A7A' }]}>End</Text>
        </View>

        <View style={st.ctrlItem}>
          <TouchableOpacity
            onPress={toggleCamera}
            accessibilityLabel={camEnabled ? 'Turn off camera' : 'Turn on camera'}
            activeOpacity={0.8}
            style={[st.ctrlBtn, camEnabled && st.ctrlBtnActive]}
          >
            <Ionicons name={camEnabled ? 'videocam' : 'videocam-off'} size={24} color={camEnabled ? '#050d09' : '#E8F5EF'} />
          </TouchableOpacity>
          <Text style={st.ctrlLabel}>{camEnabled ? 'Stop video' : 'Start video'}</Text>
        </View>
      </View>
    </View>
    </CallErrorBoundary>
  )
}

const st = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#050d09' },
  waitingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  waitingIcon:      { fontSize: 52 },
  waitingText:      { fontSize: 14, color: '#4A6058', textAlign: 'center', paddingHorizontal: 32 },
  errorText:        { fontSize: 12, color: '#FF5C5C', marginTop: 8, textAlign: 'center' },
  localPip: {
    position: 'absolute', top: 68, right: 16,
    width: 90, height: 120, borderRadius: 10,
    overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#111',
  },
  pipInner:         { flex: 1 },

  // ── audio-first stage ────────────────────────────────────────────────────
  audioStage:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarRing: {
    width: 132, height: 132, borderRadius: 66,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)',
    backgroundColor: 'rgba(74,222,128,0.05)',
  },
  avatar: {
    width: 104, height: 104, borderRadius: 52,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#12241B',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)',
  },
  avatarInitials: { color: '#4ade80', fontSize: 34, fontWeight: '700', letterSpacing: 1 },
  audioName:     { color: '#fff', fontSize: 19, fontWeight: '700', marginTop: 12 },
  audioHint:     { color: '#7A9089', fontSize: 13 },

  pulseRing: {
    width: 78, height: 78, borderRadius: 39,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)',
    backgroundColor: 'rgba(74,222,128,0.06)',
  },

  // ── signal indicator ─────────────────────────────────────────────────────
  signalWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginLeft: 10 },
  bars:         { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar:          { width: 3, borderRadius: 1.5 },
  barOff:       { backgroundColor: 'rgba(255,255,255,0.18)' },
  signalLabel:  { fontSize: 11, fontWeight: '600' },
  degradedHint: { color: '#fbbf24', fontSize: 11, marginTop: 8 },

  // ── controls ─────────────────────────────────────────────────────────────
  ctrlItem:     { alignItems: 'center', gap: 7 },
  ctrlLabel:    { color: '#93A9A0', fontSize: 11, fontWeight: '500' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerName:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerStatus:     { fontSize: 12, marginTop: 3 },
  controls: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 30,
  },
  ctrlBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Muted / camera-off reads as a filled light pill, matching how iOS and Meet
  // show an *active* suppression rather than dimming the control into invisibility.
  ctrlBtnOff:       { backgroundColor: '#E8F5EF', borderColor: '#E8F5EF' },
  ctrlBtnActive:    { backgroundColor: '#4ade80', borderColor: '#4ade80' },
  endBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#dc2626', shadowOpacity: 0.4, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  ctrlIcon:         { fontSize: 22 },
})
