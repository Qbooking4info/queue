import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, PermissionsAndroid, ActivityIndicator } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  IRtcEngine,
  RtcSurfaceView,
  VideoSourceType,
} from 'react-native-agora'
import { supabase } from '@queue/shared/lib/supabase'
import { applyAudioProfile, applyVideoProfile, signalFromQuality, SignalLevel } from '@queue/shared/lib/agoraCall'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

/** "Ikenna Ugwu" -> "IU". Falls back to a single glyph for one-word names. */
function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

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

  const engine   = useRef<IRtcEngine | null>(null)
  const [phase,        setPhase]        = useState<'loading' | 'joining' | 'active' | 'error'>('loading')
  const [remoteUid,    setRemoteUid]    = useState<number | null>(null)
  const [micEnabled,   setMicEnabled]   = useState(true)
  // Consultations open as a voice call -- see VideoCallScreen.native.tsx. The doctor
  // raises video when they actually need to look at something.
  const [camEnabled,   setCamEnabled]   = useState(false)
  const [remoteVideoOn, setRemoteVideoOn] = useState(false)
  const [signal,       setSignal]       = useState<SignalLevel | null>(null)
  const videoStarted = useRef(false)
  const [elapsed,      setElapsed]      = useState(0)
  const [error,        setError]        = useState<string | null>(null)
  const sessionRef = useRef<TokenResponse | null>(null)

  // ── 1. Obtain host token from Next.js API ─────────────────────────────────
  useEffect(() => {
    let active = true

    async function startCall() {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) { setError('Not authenticated'); setPhase('error'); return }
      if (!API_URL) { setError('API URL not configured. Set EXPO_PUBLIC_API_URL in .env'); setPhase('error'); return }

      let tokenData: TokenResponse
      try {
        const res = await fetch(`${API_URL}/api/virtual/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ appointmentId }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); setPhase('error'); return }
        tokenData = json as TokenResponse
      } catch (e: any) {
        setError(e.message ?? 'Network error')
        setPhase('error')
        return
      }

      if (!active) return
      sessionRef.current = tokenData
      setPhase('joining')

      // ── 2. Init Agora engine ────────────────────────────────────────────
      if (Platform.OS === 'android') {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ])
      }
      if (!active) return

      engine.current = createAgoraRtcEngine()
      engine.current.initialize({
        appId: tokenData.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      })

      engine.current.addListener('onJoinChannelSuccess', () => {
        if (active) setPhase('active')
      })
      engine.current.addListener('onUserJoined', (_conn: any, uid: number) => {
        if (active) setRemoteUid(uid)
      })
      engine.current.addListener('onUserOffline', (_conn: any, uid: number) => {
        if (active && uid === remoteUid) setRemoteUid(null)
      })
      engine.current.addListener('onRemoteVideoStateChanged', (_c: any, _uid: number, state: number) => {
        if (active) setRemoteVideoOn(state === 2)
      })
      engine.current.addListener('onNetworkQuality', (_c: any, uid: number, tx: number, rx: number) => {
        if (active && uid === 0) setSignal(signalFromQuality(tx, rx))
      })
      engine.current.addListener('onError', (errCode: number) => {
        if (active) setError(`Agora error ${errCode}`)
      })

      await engine.current.enableAudio()
      applyAudioProfile(engine.current)

      engine.current.joinChannel(
        tokenData.token,
        tokenData.channelName,
        tokenData.uid, // 1 (host)
        {
          clientRoleType:         ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack:  true,
          publishCameraTrack:      false,
          autoSubscribeAudio:      true,
          autoSubscribeVideo:      true,
        },
      )
    }

    startCall().catch(e => { setError(e.message); setPhase('error') })

    return () => {
      active = false
      engine.current?.leaveChannel()
      engine.current?.release()
      engine.current = null
    }
  }, [appointmentId])

  // ── 3. Elapsed timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  function toggleMic() {
    const next = !micEnabled
    engine.current?.muteLocalAudioStream(!next)
    setMicEnabled(next)
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

    if (!videoStarted.current) {
      await eng.enableVideo()
      applyVideoProfile(eng)
      videoStarted.current = true
    }
    eng.startPreview()
    eng.updateChannelMediaOptions({ publishCameraTrack: true })
    setCamEnabled(true)
  }

  async function handleEndSession() {
    Alert.alert('End session?', 'This will end the call for both you and the patient.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: async () => {
          // Best-effort: call end endpoint then navigate back regardless
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
            // Teardown is best-effort — the user is leaving either way — but a
            // silent catch meant a failed session-end was undiagnosable.
            console.warn('[video] failed to end session on leave', err)
          }
          navigation.goBack()
        },
      },
    ])
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <View style={st.container}>
        <StatusBar barStyle="light-content" backgroundColor="#050d09" />
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF9F27" style={{ marginBottom: 16 }} />
          <Text style={[st.errorTitle]}>Could not start call</Text>
          <Text style={[st.errorSub]}>{error}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backCallBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Loading / joining state ──────────────────────────────────────────────
  if (phase === 'loading' || phase === 'joining') {
    return (
      <View style={st.container}>
        <StatusBar barStyle="light-content" backgroundColor="#050d09" />
        <View style={st.center}>
          <ActivityIndicator color="#00E87A" size="large" />
          <Text style={st.loadingText}>
            {phase === 'loading' ? 'Generating secure call token…' : 'Joining room…'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050d09" />

      {/* Remote video — full screen */}
      {remoteUid != null && remoteVideoOn ? (
        <RtcSurfaceView canvas={{ uid: remoteUid }} style={StyleSheet.absoluteFill} />
      ) : remoteUid != null ? (
        <View style={st.center}>
          <View style={st.avatarRing}>
            <View style={st.avatar}>
              <Text style={st.avatarInitials}>{initials(patientName)}</Text>
            </View>
          </View>
          <Text style={st.audioName}>{patientName}</Text>
          <Text style={st.audioHint}>Voice consultation · camera off</Text>
        </View>
      ) : (
        <View style={st.center}>
          <View style={st.pulseRing}>
            <Ionicons name="person-outline" size={32} color="#4ade80" />
          </View>
          <Text style={st.waitingText}>Waiting for {patientName} to join…</Text>
        </View>
      )}

      {/* Local video PiP — only while our own camera is publishing */}
      {camEnabled && (
        <View style={st.localPip}>
          <RtcSurfaceView
            canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
            style={st.pipInner}
          />
        </View>
      )}

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerName}>{patientName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name={remoteUid != null ? 'ellipse' : 'time-outline'} size={remoteUid != null ? 8 : 12} color={remoteUid != null ? '#4ade80' : '#7A9089'} />
          <Text style={[st.headerStatus, { color: remoteUid != null ? '#4ade80' : '#7A9089' }]}>
            {remoteUid != null ? `Connected · ${fmt(elapsed)}` : 'Waiting for patient…'}
          </Text>

          {signal && (
            <View style={st.signalWrap}>
              <View style={st.bars}>
                {[1, 2, 3, 4].map(i => (
                  <View key={i} style={[st.bar, { height: 4 + i * 2 }, i <= signal.bars ? { backgroundColor: signal.color } : st.barOff]} />
                ))}
              </View>
              <Text style={[st.signalLabel, { color: signal.color }]}>{signal.label}</Text>
            </View>
          )}
        </View>

        {signal?.degraded && camEnabled && (
          <Text style={st.degradedHint}>Weak connection — turning your camera off will help</Text>
        )}
      </View>

      {/* Controls */}
      <View style={st.controls}>
        <View style={st.ctrlItem}>
          <TouchableOpacity onPress={toggleMic} activeOpacity={0.8} style={[st.ctrlBtn, !micEnabled && st.ctrlBtnOff]}>
            <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={24} color={micEnabled ? '#E8F5EF' : '#050d09'} />
          </TouchableOpacity>
          <Text style={st.ctrlLabel}>{micEnabled ? 'Mute' : 'Unmute'}</Text>
        </View>

        <View style={st.ctrlItem}>
          <TouchableOpacity onPress={handleEndSession} activeOpacity={0.85} style={st.endBtn}>
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <Text style={[st.ctrlLabel, { color: '#FF7A7A' }]}>End</Text>
        </View>

        <View style={st.ctrlItem}>
          <TouchableOpacity onPress={toggleCamera} activeOpacity={0.8} style={[st.ctrlBtn, camEnabled && st.ctrlBtnActive]}>
            <Ionicons name={camEnabled ? 'videocam' : 'videocam-off'} size={24} color={camEnabled ? '#050d09' : '#E8F5EF'} />
          </TouchableOpacity>
          <Text style={st.ctrlLabel}>{camEnabled ? 'Stop video' : 'Start video'}</Text>
        </View>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#050d09' },
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
  audioName:      { color: '#fff', fontSize: 19, fontWeight: '700', marginTop: 12 },
  audioHint:      { color: '#7A9089', fontSize: 13 },
  pulseRing: {
    width: 78, height: 78, borderRadius: 39,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)',
    backgroundColor: 'rgba(74,222,128,0.06)',
  },
  signalWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginLeft: 10 },
  bars:         { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar:          { width: 3, borderRadius: 1.5 },
  barOff:       { backgroundColor: 'rgba(255,255,255,0.18)' },
  signalLabel:  { fontSize: 11, fontWeight: '600' },
  degradedHint: { color: '#fbbf24', fontSize: 11, marginTop: 8 },
  ctrlItem:     { alignItems: 'center', gap: 7 },
  ctrlLabel:    { color: '#93A9A0', fontSize: 11, fontWeight: '500' },
  ctrlBtnActive:{ backgroundColor: '#4ade80', borderColor: '#4ade80' },
  pipInner:     { flex: 1 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerName:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerStatus: { fontSize: 12, marginTop: 3 },
  controls: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  ctrlBtn:    { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  ctrlBtnOff: { backgroundColor: 'rgba(239,68,68,0.35)' },
  endBtn:     { width: 64, height: 64, borderRadius: 32, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  ctrlIcon:   { fontSize: 22 },
})
