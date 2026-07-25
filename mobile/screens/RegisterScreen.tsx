import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'

interface Props { navigation: any }

export function RegisterScreen({ navigation }: Props) {
  const { theme: t }              = useTheme()
  const { signUp }                = useAuth()
  const [fullName, setFullName]   = useState('')
  const [phone,    setPhone]      = useState('')
  const [email,    setEmail]      = useState('')
  const [pass,     setPass]       = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [error,    setError]      = useState('')
  const [busy,     setBusy]       = useState(false)

  async function handleRegister() {
    if (!fullName.trim()) { setError('Enter your full name.'); return }
    if (!phone.trim())    { setError('Enter your phone number.'); return }
    if (!email.trim())    { setError('Enter your email address.'); return }
    if (pass.length < 6)  { setError('Password must be at least 6 characters.'); return }
    if (pass !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true); setError('')
    const err = await signUp(email.trim().toLowerCase(), pass, fullName.trim(), phone.trim())
    setBusy(false)
    if (err) setError(err)
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

            {!!error && (
              <View style={[s.errBox, { backgroundColor: '#3B1111', borderColor: '#7B2020' }]}>
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.btn, { backgroundColor: t.accent }, busy && { opacity: 0.6 }]}
              onPress={handleRegister} disabled={busy}>
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Create account</Text>}
            </TouchableOpacity>

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
  btn:       { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  btnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  footer:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  footerText:{ fontSize: 13 },
  footerLink:{ fontSize: 13, fontWeight: '700' },
  terms:     { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12 },
})
