import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { haptics }  from '../lib/haptics'

interface Props { navigation: any }

// Account-creation step only — the actual hospital registration (basics,
// verification, location, clinics, specialties, features, hours, plan) is
// the 8-step HospitalOnboardingScreen this hands off to once signed up.
//
// Signing up flips `session` truthy, which makes AppNavigator swap the whole
// tree to the authenticated app before any navigation call made from here
// would take effect — so we can't navigate to HospitalOnboarding directly.
// Instead we set pendingHospitalOnboarding, which AppStack reads to open
// straight into HospitalOnboardingScreen once it mounts.
export function HospitalRegisterScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { setPendingHospitalOnboarding } = useAuth()

  // Account
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function validate() {
    if (!fullName.trim())  { setError('Enter your full name.'); return false }
    if (!email.trim())     { setError('Enter your work email.'); return false }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return false }
    return true
  }

  async function handleSubmit() {
    setError('')
    if (!validate()) return
    setLoading(true)
    // Set BEFORE signUp, not after. signUp fires onAuthStateChange while we are
    // still awaiting it, which flips AppNavigator to <AppStack /> — and a
    // navigator only reads initialRouteName on its first mount. Setting the flag
    // after the await always lost the race, so hospital sign-ups landed on the
    // patient home tabs and the 8-step onboarding was unreachable.
    setPendingHospitalOnboarding(true)
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (signUpErr) throw new Error(signUpErr.message)
      if (!signUpData.session) throw new Error('Account created — please check your email to confirm, then sign in.')

      haptics.success()
    } catch (e) {
      // Sign-up failed, so no app tree mounted — clear the flag or a later
      // successful sign-in would be diverted into hospital onboarding.
      setPendingHospitalOnboarding(false)
      haptics.error()
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView edges={['top','left','right','bottom']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>

          <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
            <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
          </TouchableOpacity>

          <View style={s.content}>
            <Text style={[s.title, { color: t.textPrimary }]}>Create your account</Text>
            <Text style={[s.sub, { color: t.textMuted }]}>
              This account will be the primary admin for your hospital. Next, you&apos;ll fill in your hospital&apos;s
              details, verification, location, clinics, specialties, features, hours, and plan.
            </Text>

            {error ? (
              <View style={[s.errorBanner, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.3)' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#FF5C5C" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <Field icon="person-outline" placeholder="Full name" value={fullName} onChange={setFullName} t={t} />
            <Field icon="mail-outline"   placeholder="Work email" value={email} onChange={setEmail} t={t} keyboard="email-address" />
            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="lock-closed-outline" size={16} color={t.textMuted} />
              <TextInput
                value={password} onChangeText={setPassword}
                placeholder="Password (min 8 chars)" placeholderTextColor={t.textMuted}
                secureTextEntry={!showPass}
                style={[s.inputText, { color: t.textPrimary, flex: 1 }]}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color={t.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleSubmit} disabled={loading}
              style={[s.btn, { backgroundColor: loading ? `${t.accent}80` : t.accent }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Continue</Text>}
            </TouchableOpacity>
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
  btn:         { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 8 },
  btnText:     { fontSize: 15, fontWeight: '800', color: '#fff' },
})
