import { useState } from 'react'
import { View, KeyboardAvoidingView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Field, Notice, Btn, BottomBar,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { ProfileFields, EMPTY_PROFILE, profileProblem, type ProfileValues } from '@queue/shared/components/ui/ProfileFields'
import { PasswordInput, PasswordChecklist, TermsCheckbox, passwordProblem, cleanReferral } from '@queue/shared/components/ui/PasswordField'

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
  const [referral,  setReferral]  = useState('')
  const [profile,   setProfile]   = useState<ProfileValues>(EMPTY_PROFILE)
  const [agreed,    setAgreed]    = useState(false)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function validate() {
    if (!fullName.trim())  { setError('Enter your full name.'); return false }
    if (!email.trim())     { setError('Enter your work email.'); return false }
    const missing = profileProblem(profile)
    if (missing) { setError(missing); return false }
    const weak = passwordProblem(password)
    if (weak) { setError(weak); return false }
    if (!agreed) { setError('Please agree to the Terms of Service and Privacy Policy.'); return false }
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
        options: { data: {
          full_name: fullName.trim(), registered_via: 'hospital_onboarding', accepted_terms_at: new Date().toISOString(),
          title: profile.title, gender: profile.gender, date_of_birth: profile.dob, country: profile.country, state: profile.state.trim(),
          ...(referral ? { referral_code: cleanReferral(referral) } : {}),
        } },
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
    <Screen>
      <AppBar title="Create account" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Body keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: t.q.ink }}>
              Create your account
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 4 }}>
              You become the hospital admin. Next you will fill in the hospital itself — details,
              verification, location, clinics, hours and plan. Invite your team after that.
            </Text>
          </View>

          {!!error && <Notice tone="red">{error}</Notice>}

          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <Field
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <Field
              label="Work email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@hospital.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <ProfileFields value={profile} onChange={setProfile} />

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>Password</Text>
              <PasswordInput value={password} onChangeText={setPassword} newPassword />
              <PasswordChecklist password={password} />
            </View>

            <Field
              label="Referral code (optional)"
              value={referral}
              onChangeText={v => setReferral(cleanReferral(v))}
              placeholder="If someone referred you"
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TermsCheckbox checked={agreed} onChange={setAgreed} />
          </View>
        </Body>

        <BottomBar>
          <Btn grow label="Continue to hospital setup" loading={loading} disabled={!agreed}
            onPress={handleSubmit} />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
