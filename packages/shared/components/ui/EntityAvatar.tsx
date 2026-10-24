import { useState } from 'react'
import { View, Image, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'

type IconName = React.ComponentProps<typeof Ionicons>['name']

/**
 * The circular avatar used wherever a hospital or a doctor is listed.
 *
 * An uploaded photo or logo wins. Without one it draws a meaningful icon
 * rather than initials: a person for a doctor, a building for a hospital,
 * varied by what the organisation actually is. Initials told the patient
 * nothing -- "DMH" is not information.
 *
 * Every value below maps to a real column. hospitals.type and
 * hospitals.ownership are both CHECK-constrained, so the sets are closed and
 * an unknown value simply falls back to the generic building.
 */

export type HospitalKind = {
  /** hospitals.type */
  type?: string | null
  /** hospitals.ownership */
  ownership?: string | null
  /** hospitals.clinic_model — 'multi' | 'single' */
  clinicModel?: string | null
}

// Shape says what kind of place it is.
const TYPE_ICON: Record<string, IconName> = {
  hospital:          'business',
  clinic:            'medkit',
  specialist_center: 'pulse',
  diagnostic:        'flask',
  teaching:          'school',
  maternity:         'heart-circle',
}

// Colour says who runs it. Kept distinct in hue, not just lightness, so they
// are still separable in dark mode and for a colour-blind viewer -- the icon
// shape carries the meaning regardless, colour only reinforces it.
const OWNERSHIP_COLOR: Record<string, string> = {
  private: '#0F766E', // teal — the default commercial case
  federal: '#1D4ED8', // blue
  state:   '#7C3AED', // violet
  mission: '#B45309', // amber
  ngo:     '#15803D', // green
}

function hospitalIcon(k: HospitalKind): IconName {
  // A multi-site group reads as more than one building, whatever its type.
  if (k.clinicModel === 'multi') return 'business'
  return TYPE_ICON[k.type ?? ''] ?? 'business'
}

function doctorIcon(gender?: string | null): IconName {
  const g = (gender ?? '').toLowerCase()
  if (g === 'female') return 'woman'
  if (g === 'male') return 'man'
  // Unknown stays neutral. Guessing from a name would be unreliable and is not
  // ours to infer.
  return 'person'
}

interface Props {
  size?: number
  /** Uploaded logo or photo. Wins over every fallback below. */
  uri?: string | null
  /** 'hospital' picks a building, 'doctor' a person. */
  kind: 'hospital' | 'doctor'
  hospital?: HospitalKind
  /** users.gender, for the doctor fallback only. */
  gender?: string | null
  /** Read out when there is no image; the caller knows the name. */
  label?: string
}

export function EntityAvatar({ size = 46, uri, kind, hospital, gender, label }: Props) {
  const { theme: t } = useTheme()
  // A stored URL can 404 after the file is removed or a bucket is switched
  // off; fall back rather than leaving a broken box in the row.
  const [failed, setFailed] = useState(false)
  const showImage = !!uri && !failed

  const tint = kind === 'hospital'
    ? (OWNERSHIP_COLOR[hospital?.ownership ?? ''] ?? t.accent)
    : t.accent

  const icon = kind === 'hospital' ? hospitalIcon(hospital ?? {}) : doctorIcon(gender)

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[st.wrap, {
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: showImage ? 'transparent' : `${tint}1F`,
        borderColor: showImage ? t.cardBorder : `${tint}4D`,
      }]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          onError={() => setFailed(true)}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={tint} />
      )}
    </View>
  )
}

const st = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
    overflow: 'hidden',
  },
})
