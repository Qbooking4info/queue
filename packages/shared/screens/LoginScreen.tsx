import { signInWithGoogle } from '../lib/googleAuth'
import { haptics } from '../lib/haptics'
import { useState, useEffect } from 'react'
import { QueueMark, QUEUE_TAGLINE } from '../components/ui/QueueMark'
import { View, KeyboardAvoidingView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '../contexts/AlertContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import type { AuthSurface } from '../contexts/AuthContext'
import { requestPasswordReset } from '../lib/password-reset'
import {
  Screen, AppBar, Body, Field, Notice, Btn, BottomBar,
} from '../components/q'
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
    const result = await requestPasswordReset(email)
    if (!result.ok) { Alert.alert('Could not send reset email', result.error); return }
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
    <Screen>
      <AppBar onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Body contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', paddingBottom: 28 }}>
            <QueueMark size={64} style={{ marginBottom: 12 }} />
            <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.8, color: t.q.ink }}>
              Queue
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 4, textAlign: 'center', maxWidth: 300 }}>
              {p.tagline ?? QUEUE_TAGLINE}
            </Text>
          </View>

          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <Field
              label="Phone or email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>Password</Text>
              <PasswordInput value={pass} onChangeText={setPass} onSubmitEditing={handleLogin} />
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Btn label="Forgot password?" variant="ghost" small onPress={handleForgotPassword} />
            </View>
          </View>

          {!!error && <Notice tone="red">{error}</Notice>}

          {/* Google is for patients only -- staff, doctor and crew accounts come
              from invites, so offering it there is an invitation to create an
              account that cannot sign in anywhere. */}
          {surface === 'patient' && (
            <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: t.q.line }} />
                <Text style={{ fontSize: 12, color: t.q.ink60 }}>or</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: t.q.line }} />
              </View>
              <Btn
                label={googleBusy ? 'Opening Google…' : 'Continue with Google'}
                variant="secondary"
                icon="logo-google"
                loading={googleBusy}
                onPress={handleGoogle}
              />
            </View>
          )}

          {!!registerRoute && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 18 }}>
              <Text style={{ fontSize: 13, color: t.q.ink60 }}>{p.registerPrompt ?? 'New to Queue? '}</Text>
              <Btn
                label={p.registerCta ?? 'Create an account'}
                variant="ghost"
                small
                onPress={() => navigation.navigate(registerRoute)}
              />
            </View>
          )}
        </Body>

        <BottomBar>
          <Btn grow label="Sign in" loading={busy} onPress={handleLogin} />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
