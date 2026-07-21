import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Platform, PermissionsAndroid, Alert, Linking,
} from 'react-native'
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  IRtcEngine,
  RtcSurfaceView,
  VideoSourceType,
} from 'react-native-agora'
import { supabase } from '../lib/supabase'

const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? ''

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
  const [camEnabled,   setCamEnabled]   = useState(true)
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
      const { data } = await (supabase as any)
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
    let active = true

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
        if (active) setJoined(true)
      })
      engine.current.addListener('onUserJoined', (_conn: any, uid: number) => {
        if (active) setRemoteUid(uid)
      })
      engine.current.addListener('onUserOffline', (_conn: any, uid: number) => {
        if (active && uid === remoteUid) setRemoteUid(null)
      })
      engine.current.addListener('onError', (errCode: number) => {
        if (!active) return
        // MH4: Agora error codes 134/135 = camera/microphone permission denied on iOS
        const isPermissionError = errCode === 134 || errCode === 135 || errCode === 17
        if (isPermissionError) {
          setError('Camera or microphone access is required for video calls.')
          Alert.alert(
            'Permission required',
            'Camera and microphone access is required. Please enable it in Settings → Queue.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openURL('app-settings:') },
            ]
          )
        } else {
          setError(`Call error ${errCode}`)
        }
      })

      await engine.current.enableVideo()
      engine.current.startPreview()

      engine.current.joinChannel(
        session.guest_token,
        session.room_name,
        2, // patient uid
        {
          clientRoleType:       ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack:     true,
          autoSubscribeAudio:     true,
          autoSubscribeVideo:     true,
        },
      )
    }

    initAndJoin().catch(e => setError(e.message))

    return () => {
      active = false
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

  function toggleCamera() {
    if (camEnabled) {
      engine.current?.muteLocalVideoStream(true)
      setCamEnabled(false)
    } else {
      engine.current?.muteLocalVideoStream(false)
      setCamEnabled(true)
    }
  }

  function handleEndCall() {
    Alert.alert('Leave call?', 'End this video consultation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
    ])
  }

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050d09" />

      {/* Remote video — full screen background */}
      {remoteUid != null ? (
        <RtcSurfaceView
          canvas={{ uid: remoteUid }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={st.waitingContainer}>
          <Text style={st.waitingIcon}>👨‍⚕️</Text>
          <Text style={st.waitingText}>
            {session ? 'Waiting for doctor…' : 'Waiting for doctor to start the call…'}
          </Text>
          {error && <Text style={st.errorText}>{error}</Text>}
        </View>
      )}

      {/* Local video — PiP top-right */}
      {joined && (
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
        <Text style={[st.headerStatus, { color: joined && remoteUid != null ? '#4ade80' : '#7A9089' }]}>
          {joined && remoteUid != null ? `🟢 Connected · ${fmt(elapsed)}` : '⏳ Connecting…'}
        </Text>
      </View>

      {/* Controls */}
      <View style={st.controls}>
        <TouchableOpacity
          onPress={toggleMic}
          style={[st.ctrlBtn, !micEnabled && st.ctrlBtnOff]}
        >
          <Text style={st.ctrlIcon}>{micEnabled ? '🎤' : '🔇'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleEndCall} style={st.endBtn}>
          <Text style={st.ctrlIcon}>📵</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleCamera}
          style={[st.ctrlBtn, !camEnabled && st.ctrlBtnOff]}
        >
          <Text style={st.ctrlIcon}>{camEnabled ? '📹' : '📷'}</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerName:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerStatus:     { fontSize: 12, marginTop: 3 },
  controls: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
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
  ctrlIcon:         { fontSize: 22 },
})
