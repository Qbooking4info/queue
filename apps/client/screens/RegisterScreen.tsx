import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { linkDependent } from '@queue/shared/lib/api'
import { DateOfBirthSelect } from '@queue/shared/components/ui/DateOfBirthSelect'

interface Props { navigation: any }

// Matches DependentsScreen.tsx's RELATIONSHIPS order.
const RELATIONSHIPS: { label: string; value: string }[] = [
  { label: 'Spouse',  value: 'spouse'  },
  { label: 'Child',   value: 'child'   },
  { label: 'Parent',  value: 'parent'  },
  { label: 'Sibling', value: 'sibling' },
  { label: 'Other',   value: 'other'   },
]

// Matches web/src/lib/dashboard-utils.ts's calcAge exactly.
function calcAge(dob: string): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000)
}

// Below this age, linking a parent/guardian's account is recommended (not required)
// so they can help manage bookings. Same "recommend, never force" shape as the
// clinic age/gender restriction feature -- a patient without a caretaker isn't
// blocked, just nudged.
const CARETAKER_RECOMMENDED_BELOW_AGE = 16

export function RegisterScreen({ navigation }: Props) {
  const { theme: t }              = useTheme()
  const { signUp }                = useAuth()
  const [fullName, setFullName]   = useState('')
  const [dob,      setDob]        = useState('')
  const [phone,    setPhone]      = useState('')
  const [email,    setEmail]      = useState('')
  const [pass,     setPass]       = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [error,    setError]      = useState('')
  const [busy,     setBusy]       = useState(false)

  const [showCaretaker, setShowCaretaker]   = useState(false)
  const [caretakerCode, setCaretakerCode]   = useState('')
  const [caretakerRel,  setCaretakerRel]    = useState('')

  const age = calcAge(dob)
  const isMinor = age !== null && age < CARETAKER_RECOMMENDED_BELOW_AGE

  // Auto-reveal the caretaker section once DOB shows they're under the
  // recommended age -- still fully optional, they can collapse it again.
  useEffect(() => {
    if (isMinor) setShowCaretaker(true)
  }, [isMinor])

  async function handleRegister() {
    if (!fullName.trim()) { setError('Enter your full name.'); return }
    if (!dob)              { setError('Enter your date of birth.'); return }
    if (!phone.trim())    { setError('Enter your phone number.'); return }
    if (!email.trim())    { setError('Enter your email address.'); return }
    if (pass.length < 6)  { setError('Password must be at least 6 characters.'); return }
    if (pass !== confirm) { setError('Passwords do not match.'); return }
    if (caretakerCode.trim() && !caretakerRel) { setError('Select your relationship to your caretaker.'); return }
    setBusy(true); setError('')
    const err = await signUp(email.trim().toLowerCase(), pass, fullName.trim(), phone.trim(), dob)
    if (err) { setBusy(false); setError(err); return }

    // Best-effort: the account is already created either way -- a bad caretaker
    // code shouldn't block registration, just get reported after the fact. This
    // screen may already be unmounting (successful sign-in swaps the navigator
    // to the authenticated tree), so feedback goes through the app-root Alert
    // rather than local state, which a bad code would otherwise have no way to show.
    if (caretakerCode.trim()) {
      const result = await linkDependent(caretakerCode.trim(), caretakerRel, 'dependent')
      if (!result.ok) {
        Alert.alert('Account created', `We couldn't link your caretaker (${result.error}). You can try again anytime from Dependents in Settings.`)
      }
    }
    setBusy(false)
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Back */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
            <Ionicons name="arrow-back" size={14} color={t.accent} />
            <Text style={[s.backText, { color: t.accent }]}>Back</Text>
          </TouchableOpacity>

          <Text style={[s.title,  { color: t.textPrimary }]}>Create account</Text>
          <Text style={[s.sub,    { color: t.textMuted   }]}>Join Queue to book appointments easily</Text>

          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>

            {[
              { label: 'Full name',        value: fullName, onChange: setFullName, placeholder: 'Adaeze Okonkwo',     keyboardType: 'default',       autoCapitalize: 'words',  secure: false },
            ].map(f => (
              <View key={f.label} style={s.fieldWrap}>
                <Text style={[s.label, { color: t.textMuted }]}>{f.label}</Text>
                <TextInput
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor={t.textMuted}
                  keyboardType={f.keyboardType as any}
                  autoCapitalize={f.autoCapitalize as any}
                  autoCorrect={false}
                  secureTextEntry={f.secure}
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>
            ))}

            <View style={s.fieldWrap}>
              <Text style={[s.label, { color: t.textMuted }]}>Date of birth</Text>
              <DateOfBirthSelect value={dob} onChange={setDob} maxYear={new Date().getFullYear()} />
            </View>

            {[
              { label: 'Phone number',     value: phone,    onChange: setPhone,    placeholder: '+234 812 345 6789',  keyboardType: 'phone-pad',     autoCapitalize: 'none',   secure: false },
              { label: 'Email address',    value: email,    onChange: setEmail,    placeholder: 'you@email.com',      keyboardType: 'email-address', autoCapitalize: 'none',   secure: false },
              { label: 'Password',         value: pass,     onChange: setPass,     placeholder: '••••••••',           keyboardType: 'default',       autoCapitalize: 'none',   secure: true  },
              { label: 'Confirm password', value: confirm,  onChange: setConfirm,  placeholder: '••••••••',           keyboardType: 'default',       autoCapitalize: 'none',   secure: true  },
            ].map(f => (
              <View key={f.label} style={s.fieldWrap}>
                <Text style={[s.label, { color: t.textMuted }]}>{f.label}</Text>
                <TextInput
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor={t.textMuted}
                  keyboardType={f.keyboardType as any}
                  autoCapitalize={f.autoCapitalize as any}
                  autoCorrect={false}
                  secureTextEntry={f.secure}
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>
            ))}

            {isMinor && (
              <View style={[s.recommendBanner, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.recommendText, { color: t.accent }]}>
                  Since you're under {CARETAKER_RECOMMENDED_BELOW_AGE}, we recommend linking a parent or guardian's account so they can help manage your bookings.
                </Text>
              </View>
            )}

            {!showCaretaker ? (
              <TouchableOpacity onPress={() => setShowCaretaker(true)} style={s.caretakerToggle}>
                <Text style={[s.caretakerToggleText, { color: t.accent }]}>
                  {isMinor ? '+ Add a parent/guardian (recommended)' : '+ Add a caretaker (optional)'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.caretakerCard, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                <View style={s.caretakerHeader}>
                  <Text style={[s.caretakerTitle, { color: t.textPrimary }]}>Caretaker (optional)</Text>
                  <TouchableOpacity onPress={() => { setShowCaretaker(false); setCaretakerCode(''); setCaretakerRel('') }}>
                    <Text style={[s.caretakerRemove, { color: t.textMuted }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[s.helpText, { color: t.textMuted }]}>
                  Ask them for their 6-character Patient ID and enter it here. They'll be able to book and manage appointments on your behalf.
                </Text>
                <Text style={[s.label, { color: t.textMuted }]}>Caretaker's Patient ID</Text>
                <TextInput
                  value={caretakerCode} onChangeText={v => setCaretakerCode(v.toUpperCase())}
                  placeholder="e.g. K7M3QX" placeholderTextColor={t.textMuted}
                  autoCapitalize="characters" maxLength={6}
                  style={[s.input, { backgroundColor: t.cardBg, borderColor: t.inputBorder, color: t.textPrimary,
                    fontFamily: 'monospace', fontSize: 16, letterSpacing: 2, textAlign: 'center' }]}
                />
                <Text style={[s.label, { color: t.textMuted, marginTop: 12 }]}>Your relationship to them</Text>
                <View style={s.pillRow}>
                  {RELATIONSHIPS.map(r => (
                    <TouchableOpacity key={r.value} onPress={() => setCaretakerRel(r.value)}
                      style={[s.pill, { borderColor: caretakerRel === r.value ? t.accent : t.cardBorder, backgroundColor: caretakerRel === r.value ? t.accentBg : t.cardBg }]}>
                      <Text style={[s.pillText, { color: caretakerRel === r.value ? t.accent : t.textMuted, fontWeight: caretakerRel === r.value ? '700' : '400' }]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!!error && (
              <View style={[s.errBox, { backgroundColor: '#3B1111', borderColor: '#7B2020' }]}>
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            <Button label="Create account" onPress={handleRegister} loading={busy} size="lg" style={{ marginTop: t.spacing.sm }} />

          </View>

          <View style={s.footer}>
            <Text style={[s.footerText, { color: t.textMuted }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={[s.footerLink, { color: t.accent }]}>Sign in</Text>
            </TouchableOpacity>
          </View>

          <Text style={[s.terms, { color: t.textMuted }]}>
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:      { flex: 1 },
  scroll:    { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24 },
  backBtn:   { marginBottom: 20 },
  backText:  { fontSize: 14, fontWeight: '600' },
  title:     { fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  sub:       { fontSize: 13, marginTop: 4, marginBottom: 24 },
  card:      { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14, marginBottom: 20 },
  fieldWrap: { gap: 6 },
  label:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  errBox:    { borderWidth: 1, borderRadius: 10, padding: 10 },
  errText:   { color: '#F87171', fontSize: 12 },
  footer:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  footerText:{ fontSize: 13 },
  footerLink:{ fontSize: 13, fontWeight: '700' },
  terms:     { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12 },
  recommendBanner:   { borderRadius: 12, borderWidth: 1, padding: 12 },
  recommendText:     { fontSize: 12, lineHeight: 17 },
  caretakerToggle:   { paddingVertical: 4 },
  caretakerToggleText: { fontSize: 13, fontWeight: '700' },
  caretakerCard:     { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  caretakerHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caretakerTitle:    { fontSize: 13, fontWeight: '800' },
  caretakerRemove:   { fontSize: 12, fontWeight: '600' },
  helpText:          { fontSize: 11, lineHeight: 16 },
  pillRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill:              { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  pillText:          { fontSize: 12 },
})
