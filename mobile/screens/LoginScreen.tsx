import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface Props { navigation: any }

export function LoginScreen({ navigation }: Props) {
  const { theme: t }        = useTheme()
  const { signIn }          = useAuth()
  const [email, setEmail]   = useState('')
  const [pass,  setPass]    = useState('')
  const [error, setError]   = useState('')
  const [busy,  setBusy]    = useState(false)

  async function handleForgotPassword() {
    if (!email.trim()) { Alert.alert('Enter your email address first, then tap Forgot password.'); return }
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase())
    Alert.alert('Check your email', 'If an account exists for that address, a password reset link has been sent.')
  }

  async function handleLogin() {
    if (!email.trim() || !pass) { setError('Enter your email and password.'); return }
    setBusy(true); setError('')
    const err = await signIn(email.trim().toLowerCase(), pass)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={s.logoWrap}>
            <View style={[s.logoBox, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
              <Text style={[s.logoText, { color: t.accent }]}>Q</Text>
            </View>
            <Text style={[s.appName, { color: t.textPrimary }]}>Queue</Text>
            <Text style={[s.tagline, { color: t.textMuted }]}>Your health, on your schedule</Text>
          </View>

          {/* Card */}
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[s.cardTitle, { color: t.textPrimary }]}>Welcome back</Text>
            <Text style={[s.cardSub,   { color: t.textMuted  }]}>Sign in to your account</Text>

            <View style={s.fields}>
              <View style={s.fieldWrap}>
                <Text style={[s.label, { color: t.textMuted }]}>Email address</Text>
                <TextInput
                  value={email} onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={t.textMuted}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>

              <View style={s.fieldWrap}>
                <Text style={[s.label, { color: t.textMuted }]}>Password</Text>
                <TextInput
                  value={pass} onChangeText={setPass}
                  placeholder="••••••••"
                  placeholderTextColor={t.textMuted}
                  secureTextEntry
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>
            </View>

            {!!error && (
              <View style={[s.errBox, { backgroundColor: '#3B1111', borderColor: '#7B2020' }]}>
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.btn, { backgroundColor: t.accent }, busy && { opacity: 0.6 }]}
              onPress={handleLogin} disabled={busy}>
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Sign in</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleForgotPassword} style={s.forgotRow}>
              <Text style={[s.forgotText, { color: t.accent }]}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {/* Register link */}
          <View style={s.footer}>
            <Text style={[s.footerText, { color: t.textMuted }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={[s.footerLink, { color: t.accent }]}>Create account</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  scroll:     { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  logoWrap:   { alignItems: 'center', marginBottom: 32 },
  logoBox:    { width: 64, height: 64, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  logoText:   { fontSize: 28, fontWeight: '900' },
  appName:    { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  tagline:    { fontSize: 13, marginTop: 4 },
  card:       { borderRadius: 20, borderWidth: 1, padding: 24, marginBottom: 20 },
  cardTitle:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  cardSub:    { fontSize: 13, marginTop: 4, marginBottom: 20 },
  fields:     { gap: 14 },
  fieldWrap:  { gap: 6 },
  label:      { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  errBox:     { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 14 },
  errText:    { color: '#F87171', fontSize: 12 },
  btn:        { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  btnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  forgotRow:  { alignItems: 'center', marginTop: 14 },
  forgotText: { fontSize: 13, fontWeight: '500' },
  footer:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontSize: 13 },
  footerLink: { fontSize: 13, fontWeight: '700' },
})
