import { useState } from 'react'
import { View, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth, REGISTERED_VIA_AMBULANCE_PROVIDER } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { PasswordInput } from '@queue/shared/components/ui/PasswordField'
import {
  Screen, AppBar, Body, Card, CardLabel, Field, Btn, BottomBar, Notice,
} from '@queue/shared/components/q'

interface Props { navigation: any }

// Account-creation step only -- the operator's actual details (name,
// private/government, contact, base) are collected by
// AmbulanceProviderOnboardingScreen once signed up, exactly the same
// two-step split HospitalRegisterScreen/HospitalOnboardingScreen already use
// and for the same reason: signing up flips `session` truthy and swaps the
// whole app tree before any navigation call made from here would take
// effect, so pendingAmbulanceProviderOnboarding is what actually gets them
// there.
export function AmbulanceProviderRegisterScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { setPendingAmbulanceProviderOnboarding } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function validate() {
    if (!fullName.trim())    { setError('Enter your full name.'); return false }
    if (!email.trim())       { setError('Enter a work email.'); return false }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return false }
    return true
  }

  async function handleSubmit() {
    setError('')
    if (!validate()) return
    setLoading(true)
    // Set BEFORE signUp -- signUp fires onAuthStateChange while we are still
    // awaiting it, which flips AppNavigator over. Setting the flag after the
    // await always loses that race.
    setPendingAmbulanceProviderOnboarding(true)
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName.trim(), registered_via: REGISTERED_VIA_AMBULANCE_PROVIDER } },
      })
      if (signUpErr) throw new Error(signUpErr.message)
      if (!signUpData.session) throw new Error('Account created — please check your email to confirm, then sign in.')

      haptics.success()
    } catch (e) {
      setPendingAmbulanceProviderOnboarding(false)
      haptics.error()
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Create account"
          onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

        <Body keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: t.q.ink }}>
              Create your account
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 6 }}>
              You become the fleet admin. Next you add your service's details and your first unit.
              Crew accounts are created from Fleet, not here.
            </Text>
          </View>

          {!!error && <Notice tone="red" icon="alert-circle">{error}</Notice>}

          <Card style={{ marginTop: 12 }}>
            <View style={{ padding: 14, gap: 14 }}>
              <Field label="Full name" value={fullName} onChangeText={setFullName}
                placeholder="e.g. Funmi Adebayo" autoCapitalize="words" autoCorrect={false} />
              <Field label="Work email" value={email} onChangeText={setEmail}
                placeholder="you@service.com" keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} />
              <View style={{ gap: 6 }}>
                <CardLabel>Password</CardLabel>
                <PasswordInput value={password} onChangeText={setPassword} newPassword />
                <Text style={{ fontSize: 12, color: t.q.ink60 }}>At least 8 characters.</Text>
              </View>
            </View>
          </Card>
        </Body>

        <BottomBar>
          <Btn grow label="Continue" loading={loading} onPress={handleSubmit} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
