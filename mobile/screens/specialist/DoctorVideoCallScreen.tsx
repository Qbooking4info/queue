import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Platform, PermissionsAndroid, Alert, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  IRtcEngine,
  RtcSurfaceView,
  VideoSourceType,
} from 'react-native-agora'
import { supabase } from '../../lib/supabase'

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

  const engine   = useRef<IRtcEngine | null>(null)
  const [phase,        setPhase]        = useState<'loading' | 'joining' | 'active' | 'error'>('loading')
  const [remoteUid,    setRemoteUid]    = useState<number | null>(null)
  const [micEnabled,   setMicEnabled]   = useState(true)
  const [camEnabled,   setCamEnabled]   = useState(true)
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
      engine.current.addListener('onError', (errCode: number) => {
        if (active) setError(`Agora error ${errCode}`)
      })

      await engine.current.enableVideo()
      engine.current.startPreview()

      engine.current.joinChannel(
        tokenData.token,
        tokenData.channelName,
        tokenData.uid, // 1 (host)
        {
          clientRoleType:         ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack:  true,
          publishCameraTrack:      true,
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

  function toggleCamera() {
    const next = !camEnabled
    engine.current?.muteLocalVideoStream(!next)
    setCamEnabled(next)
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
          } catch (_) {}
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
      {remoteUid != null ? (
        <RtcSurfaceView canvas={{ uid: remoteUid }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={st.center}>
          <Text style={{ fontSize: 52 }}>🧑‍💼</Text>
          <Text style={st.waitingText}>Waiting for {patientName} to join…</Text>
        </View>
      )}

      {/* Local video PiP — top right */}
      <View style={st.localPip}>
        <RtcSurfaceView
          canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
          style={st.pipInner}
        />
      </View>

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerName}>{patientName}</Text>
        <Text style={[st.headerStatus, { color: remoteUid != null ? '#4ade80' : '#7A9089' }]}>
          {remoteUid != null ? `🟢 Connected · ${fmt(elapsed)}` : '⏳ Waiting for patient…'}
        </Text>
      </View>

      {/* Controls */}
      <View style={st.controls}>
        <TouchableOpacity onPress={toggleMic} style={[st.ctrlBtn, !micEnabled && st.ctrlBtnOff]}>
          <Text style={st.ctrlIcon}>{micEnabled ? '🎤' : '🔇'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleEndSession} style={st.endBtn}>
          <Text style={st.ctrlIcon}>📵</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleCamera} style={[st.ctrlBtn, !camEnabled && st.ctrlBtnOff]}>
          <Text style={st.ctrlIcon}>{camEnabled ? '📹' : '📷'}</Text>
        </TouchableOpacity>
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
