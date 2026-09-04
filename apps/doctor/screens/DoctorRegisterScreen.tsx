import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { REGISTERED_VIA_DOCTOR } from '@queue/shared/contexts/AuthContext'
import { haptics }  from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'

interface Props { navigation: any }

// Doctor self-registration. This creates the doctor's *identity* only -- a plain `users`
// row, the same shape as a patient sign-up. It deliberately creates no `doctors` row:
// that table's hospital_id is NOT NULL, so a row can only exist per hospital affiliation
// and is created later by POST /api/doctors/link when a hospital admin links this
// account's Doctor ID. Until then the account is a legitimate hospital-less doctor, and
// DoctorOnboardingScreen is where it lands.
export function DoctorRegisterScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { signUp, setPendingDoctorOnboarding } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [pass,     setPass]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  async function handleRegister() {
    if (!fullName.trim()) { setError('Enter your full name.');     return }
    if (!email.trim())    { setError('Enter your work email.');    return }
    if (!phone.trim())    { setError('Enter your phone number.');  return }
    if (pass.length < 8)  { setError('Password must be at least 8 characters.'); return }
    if (pass !== confirm) { setError('Passwords do not match.');   return }

    setBusy(true); setError('')
    // Set BEFORE signUp, not after -- signUp fires onAuthStateChange while we're still
    // awaiting it, which flips AppNavigator to the authenticated tree. Setting the flag
    // afterwards always loses that race and lands the new doctor on the "not a doctor"
    // screen instead of onboarding. (Same ordering bug, same fix, as hospital sign-up.)
    setPendingDoctorOnboarding(true)
    // No date of birth: it's a patient-care field, not part of a clinician's identity.
    const err = await signUp(
      email.trim().toLowerCase(), pass, fullName.trim(), phone.trim(), '', REGISTERED_VIA_DOCTOR,
    )
    setBusy(false)
    if (err) {
      setPendingDoctorOnboarding(false)
      haptics.error()
      setError(err)
      return
    }
    haptics.success()
    // No navigation here on success -- the new session swaps the whole navigator to the
    // authenticated tree, which reads pendingDoctorOnboarding and opens onboarding.
  }

  const fields = [
    { label: 'Full name',        value: fullName, onChange: setFullName, placeholder: 'Dr. Adaeze Okonkwo', keyboardType: 'default',       autoCapitalize: 'words', secure: false },
    { label: 'Work email',       value: email,    onChange: setEmail,    placeholder: 'you@hospital.com',   keyboardType: 'email-address', autoCapitalize: 'none',  secure: false },
    { label: 'Phone number',     value: phone,    onChange: setPhone,    placeholder: '+234 812 345 6789',  keyboardType: 'phone-pad',     autoCapitalize: 'none',  secure: false },
  ]

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {navigation?.canGoBack?.() && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={14} color={t.accent} />
              <Text style={[s.backText, { color: t.accent }]}>Back</Text>
            </TouchableOpacity>
          )}

          <Text style={[s.title, { color: t.textPrimary }]}>Create your doctor account</Text>
          <Text style={[s.sub,   { color: t.textMuted   }]}>
            One account, linkable to any number of hospitals afterwards.
          </Text>

          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>

            {fields.map(f => (
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
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>
            ))}

            <View style={s.fieldWrap}>
              <Text style={[s.label, { color: t.textMuted }]}>Password</Text>
              <View style={[s.passRow, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                <TextInput
                  value={pass} onChangeText={setPass}
                  placeholder="At least 8 characters" placeholderTextColor={t.textMuted}
                  secureTextEntry={!showPass} autoCapitalize="none" autoCorrect={false}
                  style={[s.passInput, { color: t.textPrimary }]}
                />
                <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={8}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color={t.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.fieldWrap}>
              <Text style={[s.label, { color: t.textMuted }]}>Confirm password</Text>
              <TextInput
                value={confirm} onChangeText={setConfirm}
                placeholder="••••••••" placeholderTextColor={t.textMuted}
                secureTextEntry autoCapitalize="none" autoCorrect={false}
                style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
              />
            </View>

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
  backBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 20 },
  backText:  { fontSize: 14, fontWeight: '600' },
  title:     { fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  sub:       { fontSize: 13, marginTop: 4, marginBottom: 24 },
  card:      { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14, marginBottom: 20 },
  fieldWrap: { gap: 6 },
  label:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  passRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  passInput: { flex: 1, paddingVertical: 11, fontSize: 14 },
  errBox:    { borderWidth: 1, borderRadius: 10, padding: 10 },
  errText:   { color: '#F87171', fontSize: 12 },
  footer:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  footerText:{ fontSize: 13 },
  footerLink:{ fontSize: 13, fontWeight: '700' },
  terms:     { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12 },
})
