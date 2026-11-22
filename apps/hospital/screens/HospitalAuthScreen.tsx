import { useState } from 'react'
import { View, KeyboardAvoidingView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { QueueMark } from '@queue/shared/components/ui/QueueMark'
import { PasswordInput } from '@queue/shared/components/ui/PasswordField'
import { requestPasswordReset } from '@queue/shared/lib/password-reset'
import { Alert } from '@queue/shared/contexts/AlertContext'
import {
  Screen, AppBar, Body, Card, Row, Field, Notice, Btn, BottomBar,
} from '@queue/shared/components/q'

interface Props { navigation: any }

export function HospitalAuthScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    setError('')
    if (!email.trim() || !password) { setError('Your work email and password are both needed.'); return }
    setLoading(true)
    const err = await signIn(email.trim().toLowerCase(), password, 'hospital')
    setLoading(false)
    if (err) {
      haptics.error()
      setError(err)
    } else {
      haptics.success()
      // AuthContext detects the staff role and routes from there.
    }
  }

  async function handleForgot() {
    if (!email.trim()) {
      Alert.alert('Email first', 'Enter your work email, then tap Forgot password.')
      return
    }
    const r = await requestPasswordReset(email)
    if (!r.ok) { Alert.alert('Could not send the reset email', r.error); return }
    Alert.alert('Check your email', 'If an account exists for that address, a reset link is on its way.')
  }

  return (
    <Screen>
      <AppBar onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Body contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', paddingBottom: 28 }}>
            <QueueMark size={64} style={{ marginBottom: 12 }} />
            <Text accessibilityRole="header"
              style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.8, color: t.q.ink }}>
              Queue Hospital
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 4, textAlign: 'center', maxWidth: 300 }}>
              Sign in to your hospital or clinic account.
            </Text>
          </View>

          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <Field
              label="Work email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@hospital.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>Password</Text>
              <PasswordInput value={password} onChangeText={setPassword} onSubmitEditing={handleLogin} />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Btn label="Forgot password?" variant="ghost" small onPress={handleForgot} />
            </View>
          </View>

          {!!error && <Notice tone="red">{error}</Notice>}

          {/* Crew are not signed in here -- they have their own app, and this
              surface turns them away with a pointer to it. */}
          <View style={{ paddingTop: 20 }}>
            <Card>
              <Row
                icon="add-circle-outline"
                title="New hospital?"
                sub="Register it in about five minutes"
                chevron
                onPress={() => navigation.navigate('HospitalRegister')}
              />
            </Card>
          </View>
        </Body>

        <BottomBar>
          <Btn grow label="Sign in" loading={loading} onPress={handleLogin} />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
