// Password entry shared by every Queue sign-in / sign-up screen: a show/hide toggle,
// the strong-password rule (checklist + validator), and the required terms tick.
import { useState } from 'react'
import { View, TouchableOpacity, Linking, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text, TextInput } from './Typography'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://queue-web-omega.vercel.app').replace(/\/$/, '')
export const TERMS_URL = `${WEB_URL}/terms`
export const PRIVACY_URL = `${WEB_URL}/privacy`

// ── Strong password rule ──────────────────────────────────────────────────────

export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters',  test: p => p.length >= 8 },
  { label: 'An uppercase letter',    test: p => /[A-Z]/.test(p) },
  { label: 'A lowercase letter',     test: p => /[a-z]/.test(p) },
  { label: 'A number',               test: p => /\d/.test(p) },
  { label: 'A symbol (e.g. ! @ # ?)', test: p => /[^A-Za-z0-9]/.test(p) },
]

/** First unmet rule as a sentence, or null when the password is strong. */
export function passwordProblem(p: string): string | null {
  const miss = PASSWORD_RULES.find(r => !r.test(p))
  return miss ? `Password needs ${miss.label.charAt(0).toLowerCase() + miss.label.slice(1)}.` : null
}

export function PasswordChecklist({ password }: { password: string }) {
  const { theme: t } = useTheme()
  if (!password) return null
  return (
    <View style={{ gap: 4, marginTop: 8 }} accessibilityLabel="Password requirements">
      {PASSWORD_RULES.map(r => {
        const ok = r.test(password)
        return (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={ok ? t.statusSuccess.text : t.textMuted} />
            <Text style={{ fontSize: 12, color: ok ? t.statusSuccess.text : t.textMuted }}>{r.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ── Password input with show / hide ───────────────────────────────────────────

export function PasswordInput({ value, onChangeText, placeholder = '••••••••', style, inputStyle, accessibilityLabel = 'Password', onSubmitEditing, newPassword }: {
  value: string; onChangeText: (v: string) => void; placeholder?: string
  style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle>; accessibilityLabel?: string
  onSubmitEditing?: () => void; newPassword?: boolean
}) {
  const { theme: t } = useTheme()
  const [show, setShow] = useState(false)
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, borderColor: t.inputBorder, backgroundColor: t.inputBg }, style]}>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.textMuted}
        secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} accessibilityLabel={accessibilityLabel}
        textContentType={newPassword ? 'newPassword' : 'password'} autoComplete={newPassword ? 'password-new' : 'password'}
        onSubmitEditing={onSubmitEditing}
        style={[{ flex: 1, minHeight: 48, paddingHorizontal: 14, fontSize: 15, color: t.textPrimary }, inputStyle]}
      />
      <TouchableOpacity onPress={() => { haptics.tap(); setShow(s => !s) }} accessibilityRole="button"
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.textMuted} />
      </TouchableOpacity>
    </View>
  )
}

// ── Terms of Service / Privacy Policy tick ────────────────────────────────────

export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { theme: t } = useTheme()
  const open = (url: string) => { Linking.openURL(url).catch(() => {}) }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 }}>
      <TouchableOpacity onPress={() => { haptics.tap(); onChange(!checked) }} accessibilityRole="checkbox"
        accessibilityState={{ checked }} accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: checked ? t.accent : t.inputBorder,
          backgroundColor: checked ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked && <Ionicons name="checkmark" size={16} color={t.id === 'forest' ? '#081416' : '#FFFFFF'} />}
      </TouchableOpacity>
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: t.textSecondary }}>
        I agree to Queue's{' '}
        <Text onPress={() => open(TERMS_URL)} style={{ color: t.accent, fontWeight: '700' }} accessibilityRole="link">Terms of Service</Text>
        {' '}and{' '}
        <Text onPress={() => open(PRIVACY_URL)} style={{ color: t.accent, fontWeight: '700' }} accessibilityRole="link">Privacy Policy</Text>.
      </Text>
    </View>
  )
}

/** Normalise a referral code the way it is stored: trimmed, upper-case, no spaces. */
export const cleanReferral = (v: string) => v.replace(/\s+/g, '').toUpperCase().slice(0, 20)
