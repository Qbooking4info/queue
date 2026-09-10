import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { useAuth, REGISTERED_VIA_AMBULANCE_PROVIDER } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'

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
  const [showPass, setShowPass] = useState(false)

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
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>

          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" style={s.back}>
            <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
          </TouchableOpacity>

          <View style={s.content}>
            <Text style={[s.title, { color: t.textPrimary }]}>Create your account</Text>
            <Text style={[s.sub, { color: t.textMuted }]}>
              This will be the owner account for your ambulance service. Next you&apos;ll add
              your service&apos;s details and your first unit.
            </Text>

            {error ? (
              <View style={[s.errorBanner, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
                <Ionicons name="alert-circle-outline" size={14} color={t.danger} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <Field icon="person-outline" placeholder="Full name" value={fullName} onChange={setFullName} t={t} />
            <Field icon="mail-outline"   placeholder="Email" value={email} onChange={setEmail} t={t} keyboard="email-address" />
            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="lock-closed-outline" size={16} color={t.textMuted} />
              <TextInput
                value={password} onChangeText={setPassword}
                placeholder="Password (min 8 chars)" placeholderTextColor={t.textMuted}
                secureTextEntry={!showPass}
                style={[s.inputText, { color: t.textPrimary, flex: 1 }]}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} accessibilityLabel={showPass ? 'Hide password' : 'Show password'} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color={t.textMuted} />
              </TouchableOpacity>
            </View>

            <Button label="Continue" onPress={handleSubmit} loading={loading} style={{ marginTop: t.spacing.sm }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ icon, placeholder, value, onChange, t, keyboard }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; placeholder: string; value: string
  onChange: (v: string) => void; t: any; keyboard?: any
}) {
  return (
    <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
      <Ionicons name={icon} size={16} color={t.textMuted} />
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={t.textMuted} keyboardType={keyboard ?? 'default'}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'words'} autoCorrect={false}
        style={[s.inputText, { color: t.textPrimary }]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  back:        { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  content:     { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  title:       { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  sub:         { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  errorText:   { fontSize: 13, color: '#FF5C5C', flex: 1 },
  input:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  inputText:   { fontSize: 14, flex: 1 },
})
