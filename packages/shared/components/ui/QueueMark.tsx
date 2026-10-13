import { Image, type ImageStyle, type StyleProp } from 'react-native'

// The Queue brand mark (packages/shared/assets/brand). `white` is for teal or dark
// grounds; the default full-colour mark is for light surfaces.
const COLOR = require('../../assets/brand/gen/queue-mark.png')
const WHITE = require('../../assets/brand/gen/queue-mark-white.png')

export const QUEUE_TAGLINE = 'Better Access. Healthier Tomorrow.'

export function QueueMark({ size = 56, white, style }: { size?: number; white?: boolean; style?: StyleProp<ImageStyle> }) {
  return (
    <Image source={white ? WHITE : COLOR} accessibilityRole="image" accessibilityLabel="Queue"
      style={[{ width: size, height: size }, style]} resizeMode="contain" />
  )
}
