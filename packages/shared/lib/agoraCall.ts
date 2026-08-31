import {
  AudioProfileType,
  AudioScenarioType,
  DegradationPreference,
  IRtcEngine,
  OrientationMode,
  QualityType,
} from 'react-native-agora'

/**
 * Shared call-quality configuration for the two consultation screens
 * (VideoCallScreen.native.tsx and specialist/DoctorVideoCallScreen.native.tsx).
 *
 * Before this existed, neither screen called setVideoEncoderConfiguration or
 * setAudioProfile at all, so both ran on Agora's defaults -- which for the
 * communication profile negotiate down to roughly 640x360, and look soft on a
 * modern phone screen. That is the "video not clear" complaint.
 */

/**
 * 720p portrait at 24fps. Deliberately not 1080p: this app is used on Nigerian
 * mobile networks, and a resolution the link cannot sustain degrades into
 * something worse-looking than a resolution it can.
 *
 * degradationPreference is MaintainQuality because in a medical consultation a
 * sharp, occasionally stuttering image of a patient is more useful than a smooth
 * blurry one -- the doctor is looking at a rash or an eye, not at motion.
 */
export const VIDEO_ENCODER_CONFIG = {
  dimensions: { width: 720, height: 1280 },
  frameRate: 24,
  bitrate: 0, // 0 = let Agora pick the standard bitrate for these dimensions
  orientationMode: OrientationMode.OrientationModeAdaptive,
  degradationPreference: DegradationPreference.MaintainQuality,
} as const

/**
 * Audio settings. SpeechStandard is voice-optimised (mono, ~32kHz) rather than
 * music-grade: it costs far less bandwidth, which matters because these calls now
 * start audio-only and the audio leg has to stay intelligible on a weak link even
 * when video cannot. Chatroom scenario keeps the mic path tuned for continuous
 * two-way speech.
 */
export function applyAudioProfile(engine: IRtcEngine) {
  engine.setAudioProfile(
    AudioProfileType.AudioProfileSpeechStandard,
    AudioScenarioType.AudioScenarioChatroom,
  )
}

/** Applied when video is switched on -- not at join, since calls start audio-only. */
export function applyVideoProfile(engine: IRtcEngine) {
  engine.setVideoEncoderConfiguration(VIDEO_ENCODER_CONFIG)
}

export type SignalLevel = {
  /** 0-4, for drawing bars. 0 means "no usable reading yet". */
  bars: number
  label: string
  color: string
  /** True when the link is bad enough that we suggest dropping video. */
  degraded: boolean
}

/**
 * Agora reports uplink and downlink quality separately in onNetworkQuality.
 * We surface the worse of the two, because that is what the user experiences:
 * a perfect downlink does not help if your own uplink is dropping frames.
 *
 * QualityType: 0 unknown, 1 excellent, 2 good, 3 poor, 4 bad, 5 very bad, 6 down.
 * Note 0 is "no reading", NOT "best" -- treating it as good is why a call can look
 * healthy on screen while actually being dead.
 */
export function signalFromQuality(tx: number, rx: number): SignalLevel {
  const readings = [tx, rx].filter((q) => q !== QualityType.QualityUnknown)
  if (readings.length === 0) {
    return { bars: 0, label: 'Checking…', color: '#7A9089', degraded: false }
  }
  const worst = Math.max(...readings)

  switch (worst) {
    case QualityType.QualityExcellent:
      return { bars: 4, label: 'Excellent', color: '#4ade80', degraded: false }
    case QualityType.QualityGood:
      return { bars: 3, label: 'Good', color: '#4ade80', degraded: false }
    case QualityType.QualityPoor:
      return { bars: 2, label: 'Weak signal', color: '#fbbf24', degraded: false }
    case QualityType.QualityBad:
      return { bars: 1, label: 'Poor connection', color: '#fb923c', degraded: true }
    default:
      // 5 (very bad) and 6 (down) both mean the call is effectively failing.
      return { bars: 0, label: 'Reconnecting…', color: '#FF5C5C', degraded: true }
  }
}
