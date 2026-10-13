import { signInWithGoogle } from '../lib/googleAuth'
import { haptics } from '../lib/haptics'
import { useState, useEffect } from 'react'
import { QueueMark, QUEUE_TAGLINE } from '../components/ui/QueueMark'
import { View, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Alert } from '../contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import type { AuthSurface } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { PasswordInput } from '../components/ui/PasswordField'

// Every app mounts this same screen, so the bits that differ per app are read off
// route params (set with `initialParams` where the screen is registered) rather than
// hardcoded to the patient app's values:
//
//   surface       -- which door signIn() should treat this as; wrong-app accounts are
//                    rejected against it. Defaults to 'patient'.
//   registerRoute -- route name the "Create account" link pushes. Pass null in apps
//                    with no self-registration (ambulance crew are provisioned by
//                    their fleet) to hide the link entirely -- it used to point at
//                    'Register', a route only the patient app defines, so in every
//                    other app the tap silently did nothing.
export interface LoginScreenParams {
  surface?:        AuthSurface
  registerRoute?:  string | null
  tagline?:        string
  title?:          string
  subtitle?:       string
  registerPrompt?: string
  registerCta?:    string
}

interface Props { navigation: any; route?: { params?: LoginScreenParams } }

export function LoginScreen({ navigation, route }: Props) {
  const p = route?.params ?? {}
  const surface: AuthSurface = p.surface ?? 'patient'
  const [googleBusy, setGoogleBusy] = useState(false)
  async function handleGoogle() {
    haptics.tap(); setGoogleBusy(true); setError('')
    const err = await signInWithGoogle()
    setGoogleBusy(false)
    if (err) setError(err)
  }
  // `undefined` means "not specified" -> patient default; explicit null means "no
  // registration in this app". Both are falsy, so they can't be collapsed with ??.
  const registerRoute = p.registerRoute === undefined ? 'Register' : p.registerRoute

  const { theme: t }        = useTheme()
  const { signIn }          = useAuth()
  const [email, setEmail]   = useState('')
  const [pass,  setPass]    = useState('')
  const [error, setError]   = useState('')
  useEffect(() => { if (error) haptics.error() }, [error])
  const [busy,  setBusy]    = useState(false)

  async function handleForgotPassword() {
    if (!email.trim()) { Alert.alert('Enter your email address first, then tap Forgot password.'); return }
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase())
    Alert.alert('Check your email', 'If an account exists for that address, a password reset link has been sent.')
  }

  async function handleLogin() {
    if (!email.trim() || !pass) { setError('Enter your email and password.'); return }
    setBusy(true); setError('')
    const err = await signIn(email.trim().toLowerCase(), pass, surface)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Back to role select */}
          {navigation?.canGoBack?.() && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={20} color={t.textMuted} />
            </TouchableOpacity>
          )}

          {/* Logo */}
          <View style={s.logoWrap}>
            <QueueMark size={64} style={{ marginBottom: 10 }} />
            <Text style={[s.appName, { color: t.textPrimary }]}>Queue</Text>
            <Text style={[s.tagline, { color: t.textMuted }]}>{p.tagline ?? QUEUE_TAGLINE}</Text>
          </View>

          {/* Card */}
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[s.cardTitle, { color: t.textPrimary }]}>{p.title ?? 'Welcome back'}</Text>
            <Text style={[s.cardSub,   { color: t.textMuted  }]}>{p.subtitle ?? 'Sign in to your account'}</Text>

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
                <PasswordInput value={pass} onChangeText={setPass} onSubmitEditing={handleLogin} />
              </View>
            </View>

            {!!error && (
              <View accessibilityRole="alert" style={[s.errBox, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
                <Text style={[s.errText, { color: t.danger }]}>{error}</Text>
              </View>
            )}

            <Button label="Sign in" onPress={handleLogin} loading={busy} size="lg" style={{ marginTop: t.spacing.xl }} />

            {/* Google is for patients only -- staff, doctor and crew accounts come from invites. */}
            {surface === 'patient' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: t.cardBorder }} />
                  <Text style={{ fontSize: 12, color: t.textMuted }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: t.cardBorder }} />
                </View>
                <TouchableOpacity onPress={handleGoogle} disabled={googleBusy} accessibilityRole="button" accessibilityLabel="Continue with Google"
                  style={{ marginTop: 14, minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <Ionicons name="logo-google" size={18} color="#EA4335" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{googleBusy ? 'Opening Google…' : 'Continue with Google'}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={handleForgotPassword} style={s.forgotRow}>
              <Text style={[s.forgotText, { color: t.accent }]}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {/* Register link -- only in apps that actually have a registration route */}
          {!!registerRoute && (
            <View style={s.footer}>
              <Text style={[s.footerText, { color: t.textMuted }]}>{p.registerPrompt ?? "Don't have an account? "}</Text>
              <TouchableOpacity onPress={() => navigation.navigate(registerRoute)}>
                <Text style={[s.footerLink, { color: t.accent }]}>{p.registerCta ?? 'Create account'}</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  scroll:     { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  backBtn:    { position: 'absolute', top: 16, left: 16, zIndex: 10, padding: 4 },
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
  forgotRow:  { alignItems: 'center', marginTop: 14 },
  forgotText: { fontSize: 13, fontWeight: '500' },
  footer:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontSize: 13 },
  footerLink: { fontSize: 13, fontWeight: '700' },
})
