'use client'
import { useState, useMemo, useEffect } from 'react'
import AgoraRTC, {
  AgoraRTCProvider,
  LocalVideoTrack,
  RemoteUser,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
} from 'agora-rtc-react'

type Phase = 'idle' | 'starting' | 'active' | 'ended'

interface CallData {
  token: string
  channelName: string
  uid: number
  appId: string
}

interface Props {
  appointmentId: string
  patientName: string
}

export function VideoCallPanel({ appointmentId, patientName }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [callData, setCallData] = useState<CallData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [endCallError, setEndCallError] = useState<string | null>(null)

  const client = useMemo(
    () => AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }),
    [],
  )

  async function startCall() {
    setPhase('starting')
    setError(null)
    try {
      const res = await fetch('/api/virtual/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start call')
        setPhase('idle')
        return
      }
      setCallData(data as CallData)
      setPhase('active')
    } catch {
      setError('Network error — check your connection')
      setPhase('idle')
    }
  }

  async function endCall() {
    try {
      const res = await fetch('/api/virtual/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEndCallError(data.error ?? 'Failed to end call — please try again')
        return
      }
    } catch {
      setEndCallError('Network error — check your connection')
      return
    }
    setPhase('ended')
    setCallData(null)
  }

  if (phase === 'ended') {
    return (
      <div className="bg-[#111915] border border-white/7 rounded-2xl p-6 text-center">
        <div className="text-3xl mb-2">✅</div>
        <div className="font-bold text-sm">Consultation ended</div>
        <div className="text-xs text-[#7A9089] mt-1">Appointment marked as completed</div>
        <button
          onClick={() => setPhase('idle')}
          className="mt-4 text-xs text-[#4A6058] hover:text-white transition-colors"
        >
          Start new call
        </button>
      </div>
    )
  }

  if (phase !== 'active' || !callData) {
    return (
      <div className="bg-[#0A1218] border border-blue-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl">
            💻
          </div>
          <div>
            <div className="font-bold text-sm">Virtual Consultation</div>
            <div className="text-xs text-[#7A9089]">with {patientName}</div>
          </div>
        </div>
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
            {error}
          </div>
        )}
        <button
          onClick={startCall}
          disabled={phase === 'starting'}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {phase === 'starting' ? (
            <><span className="animate-spin inline-block">⏳</span> Starting call…</>
          ) : (
            <>📹 Start Video Consultation</>
          )}
        </button>
      </div>
    )
  }

  return (
    <AgoraRTCProvider client={client}>
      <CallOverlay
        appId={callData.appId}
        token={callData.token}
        channelName={callData.channelName}
        uid={callData.uid}
        patientName={patientName}
        endCallError={endCallError}
        onEnd={endCall}
      />
    </AgoraRTCProvider>
  )
}

// ── Full-screen call overlay ─────────────────────────────────────────────────

interface OverlayProps {
  appId: string
  token: string
  channelName: string
  uid: number
  patientName: string
  endCallError: string | null
  onEnd: () => void
}

function CallOverlay({ appId, token, channelName, uid, patientName, endCallError, onEnd }: OverlayProps) {
  const [micEnabled, setMicEnabled]     = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [elapsed, setElapsed]           = useState(0)

  useJoin({ appid: appId, channel: channelName, token, uid })

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micEnabled) as { localMicrophoneTrack: IMicrophoneAudioTrack | null }
  const { localCameraTrack }     = useLocalCameraTrack(cameraEnabled) as { localCameraTrack: ICameraVideoTrack | null }
  usePublish([localMicrophoneTrack, localCameraTrack])

  const remoteUsers = useRemoteUsers()
  const connected = remoteUsers.length > 0

  // WH1: timer only starts when a remote patient has joined
  useEffect(() => {
    if (!connected) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
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
    localCameraTrack?.setEnabled(!cameraEnabled)
    setCameraEnabled(v => !v)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#050d09', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', background: 'rgba(0,0,0,0.5)',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            💻 {patientName}
          </div>
          <div style={{ fontSize: 12, marginTop: 3, color: connected ? '#4ade80' : '#7A9089' }}>
            {connected ? `🟢 Connected · ${fmt(elapsed)}` : '⏳ Waiting for patient to join…'}
          </div>
        </div>
      </div>

      {/* Remote video area */}
      <div style={{ flex: 1, position: 'relative', background: '#050d09', overflow: 'hidden' }}>
        {connected ? (
          <RemoteUser
            user={remoteUsers[0]}
            playVideo
            playAudio
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: 14, color: '#4A6058',
          }}>
            <span style={{ fontSize: 56 }}>👤</span>
            <span style={{ fontSize: 14 }}>Waiting for {patientName} to join…</span>
          </div>
        )}

        {/* Local video PiP */}
        <div style={{
          position: 'absolute', bottom: 16, right: 16,
          width: 120, height: 160, borderRadius: 12, overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.15)', background: '#111',
        }}>
          {cameraEnabled
            ? <LocalVideoTrack track={localCameraTrack} play style={{ width: '100%', height: '100%' }} />
            : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A6058', fontSize: 28 }}>
                📷
              </div>
            )
          }
        </div>
      </div>

      {/* Controls */}
      <div style={{
        padding: '20px 0 36px', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, background: 'rgba(0,0,0,0.5)',
      }}>
        {endCallError && (
          <div style={{ fontSize: 12, color: '#f07070', background: 'rgba(220,60,60,0.15)',
            border: '1px solid rgba(220,60,60,0.3)', borderRadius: 8, padding: '6px 14px',
            maxWidth: 320, textAlign: 'center' }}>
            {endCallError}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <button
          onClick={toggleMic}
          style={{
            width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: micEnabled ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.35)',
            fontSize: 22, transition: 'background 0.15s',
          }}
          title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micEnabled ? '🎤' : '🔇'}
        </button>
        <button
          onClick={onEnd}
          style={{
            width: 64, height: 64, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: '#dc2626', fontSize: 24, transition: 'background 0.15s',
          }}
          title="End call"
        >
          📵
        </button>
        <button
          onClick={toggleCamera}
          style={{
            width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: cameraEnabled ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.35)',
            fontSize: 22, transition: 'background 0.15s',
          }}
          title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {cameraEnabled ? '📹' : '📷'}
        </button>
      </div>
    </div>
    </div>
  )
}
