// Drop-in replacements for react-native's Text and TextInput that render in Plus
// Jakarta Sans (v3.1 type token). React Native has no global default font, and a
// custom font file carries a single weight, so each fontWeight maps to its own
// family. Anything that sets its own fontFamily (monospace codes, icons) is left alone.
import { forwardRef } from 'react'
import {
  Text as RNText, TextInput as RNTextInput, StyleSheet, Platform,
  type TextProps, type TextInputProps, type TextStyle,
} from 'react-native'
import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'

/** Pass to expo-font's useFonts() in each app's root. */
export const QUEUE_FONTS = {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
}

const FAMILY: Record<string, string> = {
  '100': 'PlusJakartaSans_400Regular', '200': 'PlusJakartaSans_400Regular', '300': 'PlusJakartaSans_400Regular',
  '400': 'PlusJakartaSans_400Regular', normal: 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold', bold: 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold', '900': 'PlusJakartaSans_800ExtraBold',
}

function fontFor(style: TextProps['style']): TextStyle | null {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  if (flat.fontFamily) return null
  const family = FAMILY[String(flat.fontWeight ?? '400')] ?? FAMILY['400']
  // On Android a weight on top of a single-weight family makes it fake-bold; the
  // family already is the weight. Web resolves weight against the family itself.
  return Platform.OS === 'web' ? { fontFamily: family } : { fontFamily: family, fontWeight: 'normal' }
}

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  const f = fontFor(props.style)
  return <RNText ref={ref} {...props} style={f ? [props.style, f] : props.style} />
})

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const f = fontFor(props.style)
  return <RNTextInput ref={ref} {...props} style={f ? [props.style, f] : props.style} />
})
