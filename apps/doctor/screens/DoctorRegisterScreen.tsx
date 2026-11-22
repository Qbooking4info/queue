import { useState } from 'react'
import { View, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { REGISTERED_VIA_DOCTOR } from '@queue/shared/contexts/AuthContext'
import { haptics }  from '@queue/shared/lib/haptics'
import { ProfileFields, EMPTY_PROFILE, profileProblem, type ProfileValues } from '@queue/shared/components/ui/ProfileFields'
import { PasswordInput, PasswordChecklist, TermsCheckbox, passwordProblem, cleanReferral } from '@queue/shared/components/ui/PasswordField'
import {
  Screen, AppBar, Body, Field, Notice, Btn, BottomBar, SectionHead, Card, CardLabel,
} from '@queue/shared/components/q'

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
  const [referral, setReferral] = useState('')
  const [profile,  setProfile]  = useState<ProfileValues>({ ...EMPTY_PROFILE, title: 'Dr' })
  const [agreed,   setAgreed]   = useState(false)
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  async function handleRegister() {
    if (!fullName.trim()) { setError('Enter your full name.');     return }
    if (!email.trim())    { setError('Enter your work email.');    return }
    if (!phone.trim())    { setError('Enter your phone number.');  return }
    const missing = profileProblem(profile)
    if (missing)          { setError(missing); return }
    const weak = passwordProblem(pass)
    if (weak)             { setError(weak); return }
    if (pass !== confirm) { setError('Passwords do not match.');   return }
    if (!agreed)          { setError('Please agree to the Terms of Service and Privacy Policy.'); return }

    setBusy(true); setError('')
    // Set BEFORE signUp, not after -- signUp fires onAuthStateChange while we're still
    // awaiting it, which flips AppNavigator to the authenticated tree. Setting the flag
    // afterwards always loses that race and lands the new doctor on the "not a doctor"
    // screen instead of onboarding. (Same ordering bug, same fix, as hospital sign-up.)
    setPendingDoctorOnboarding(true)
    const err = await signUp(
      email.trim().toLowerCase(), pass, fullName.trim(), phone.trim(), profile.dob, REGISTERED_VIA_DOCTOR,
      { referralCode: referral ? cleanReferral(referral) : undefined, acceptedTermsAt: new Date().toISOString(),
        title: profile.title, gender: profile.gender, country: profile.country, state: profile.state.trim() },
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Create account"
          onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

        <Body keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
            <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: t.q.ink }}>
              Create your doctor account
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 6 }}>
              One account, linkable to any number of hospitals afterwards.
            </Text>
          </View>

          <SectionHead title="You" />
          <Card>
            <View style={{ padding: 14, gap: 14 }}>
              <Field label="Full name" value={fullName} onChangeText={setFullName}
                placeholder="Dr. Adaeze Okonkwo" autoCapitalize="words" autoCorrect={false} />
              <Field label="Work email" value={email} onChangeText={setEmail}
                placeholder="you@hospital.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              <Field label="Phone number" value={phone} onChangeText={setPhone}
                placeholder="+234 812 345 6789" keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false} />
              <ProfileFields value={profile} onChange={setProfile} />
            </View>
          </Card>

          <SectionHead title="Password" />
          <Card>
            <View style={{ padding: 14, gap: 14 }}>
              <View style={{ gap: 6 }}>
                <CardLabel>Password</CardLabel>
                <PasswordInput value={pass} onChangeText={setPass} newPassword />
                <PasswordChecklist password={pass} />
              </View>
              <View style={{ gap: 6 }}>
                <CardLabel>Confirm password</CardLabel>
                <PasswordInput value={confirm} onChangeText={setConfirm} accessibilityLabel="Confirm password" newPassword />
                {!!confirm && confirm !== pass && (
                  <Text style={{ fontSize: 12, color: t.q.red }}>Passwords do not match yet</Text>
                )}
              </View>
              <Field label="Referral code (optional)" value={referral}
                onChangeText={v => setReferral(cleanReferral(v))}
                placeholder="Who referred you to Queue?" autoCapitalize="characters" autoCorrect={false} />
            </View>
          </Card>

          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <TermsCheckbox checked={agreed} onChange={setAgreed} />
          </View>

          {!!error && <Notice tone="red" icon="alert-circle">{error}</Notice>}

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 18 }}>
            <Text style={{ fontSize: 13, color: t.q.ink60 }}>Already have an account? </Text>
            <Btn label="Sign in" variant="ghost" small onPress={() => navigation.navigate('Login')} />
          </View>
        </Body>

        <BottomBar>
          <Btn grow label="Create account" loading={busy} disabled={!agreed} onPress={handleRegister} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
