import { useState, useEffect } from 'react'
import { View, KeyboardAvoidingView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { signInWithGoogle } from '@queue/shared/lib/googleAuth'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Row, SectionHead, Field, Chip, Notice, Btn,
  BottomBar, MONO,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { linkDependent } from '@queue/shared/lib/api'
import { DateOfBirthSelect } from '@queue/shared/components/ui/DateOfBirthSelect'
import { ProfileFields, EMPTY_PROFILE, profileProblem, type ProfileValues } from '@queue/shared/components/ui/ProfileFields'
import { PasswordInput, PasswordChecklist, TermsCheckbox, passwordProblem, cleanReferral } from '@queue/shared/components/ui/PasswordField'

interface Props { navigation: any }

// Matches DependentsScreen.tsx's RELATIONSHIPS order.
const RELATIONSHIPS: { label: string; value: string }[] = [
  { label: 'Spouse',  value: 'spouse'  },
  { label: 'Child',   value: 'child'   },
  { label: 'Parent',  value: 'parent'  },
  { label: 'Sibling', value: 'sibling' },
  { label: 'Other',   value: 'other'   },
]

// Matches web/src/lib/dashboard-utils.ts's calcAge exactly.
function calcAge(dob: string): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000)
}

// Below this age, linking a parent/guardian's account is recommended (not required)
// so they can help manage bookings. Same "recommend, never force" shape as the
// clinic age/gender restriction feature -- a patient without a caretaker isn't
// blocked, just nudged.
const CARETAKER_RECOMMENDED_BELOW_AGE = 16

export function RegisterScreen({ navigation }: Props) {
  const { theme: t }              = useTheme()
  const { signUp }                = useAuth()
  const [fullName, setFullName]   = useState('')
  const [profile,  setProfile]    = useState<ProfileValues>(EMPTY_PROFILE)
  const dob = profile.dob
  const [phone,    setPhone]      = useState('')
  const [email,    setEmail]      = useState('')
  const [pass,     setPass]       = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [error,    setError]      = useState('')
  useEffect(() => { if (error) haptics.error() }, [error])
  const [busy,     setBusy]       = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [referral, setReferral]   = useState('')
  const [agreed,   setAgreed]     = useState(false)

  const [showCaretaker, setShowCaretaker]   = useState(false)
  const [caretakerCode, setCaretakerCode]   = useState('')
  const [caretakerRel,  setCaretakerRel]    = useState('')

  const age = calcAge(dob)
  const isMinor = age !== null && age < CARETAKER_RECOMMENDED_BELOW_AGE

  // Auto-reveal the caretaker section once DOB shows they're under the
  // recommended age -- still fully optional, they can collapse it again.
  useEffect(() => {
    if (isMinor) setShowCaretaker(true)
  }, [isMinor])

  async function handleRegister() {
    if (!fullName.trim()) { setError('Enter your full name.'); return }
    const missing = profileProblem(profile)
    if (missing)           { setError(missing); return }
    if (!phone.trim())    { setError('Enter your phone number.'); return }
    if (!email.trim())    { setError('Enter your email address.'); return }
    const weak = passwordProblem(pass)
    if (weak)             { setError(weak); return }
    if (pass !== confirm) { setError('Passwords do not match.'); return }
    if (!agreed)          { setError('Please agree to the Terms of Service and Privacy Policy.'); return }
    if (caretakerCode.trim() && !caretakerRel) { setError('Select your relationship to your caretaker.'); return }
    setBusy(true); setError('')
    const err = await signUp(email.trim().toLowerCase(), pass, fullName.trim(), phone.trim(), dob, undefined,
      { referralCode: referral ? cleanReferral(referral) : undefined, acceptedTermsAt: new Date().toISOString(),
        title: profile.title, gender: profile.gender, country: profile.country, state: profile.state.trim() })
    if (err) { setBusy(false); setError(err); return }

    // Best-effort: the account is already created either way -- a bad caretaker
    // code shouldn't block registration, just get reported after the fact. This
    // screen may already be unmounting (successful sign-in swaps the navigator
    // to the authenticated tree), so feedback goes through the app-root Alert
    // rather than local state, which a bad code would otherwise have no way to show.
    if (caretakerCode.trim()) {
      const result = await linkDependent(caretakerCode.trim(), caretakerRel, 'dependent')
      if (!result.ok) {
        Alert.alert('Account created', `We couldn't link your caretaker (${result.error}). You can try again anytime from Dependents in Settings.`)
      }
    }
    setBusy(false)
  }

  return (
    <Screen>
      <AppBar title="Create account" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Body keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: t.q.ink }}>
              Create account
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 4 }}>
              Book, pay and hold your place before you arrive.
            </Text>
          </View>

          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <Field
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Adaeze Okonkwo"
              autoCapitalize="words"
              autoCorrect={false}
            />

            <ProfileFields value={profile} onChange={setProfile} />

            <Field
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              placeholder="+234 812 345 6789"
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>Password</Text>
              <PasswordInput value={pass} onChangeText={setPass} newPassword />
              <PasswordChecklist password={pass} />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>Confirm password</Text>
              <PasswordInput
                value={confirm}
                onChangeText={setConfirm}
                accessibilityLabel="Confirm password"
                newPassword
              />
              {!!confirm && confirm !== pass && (
                <Text style={{ fontSize: 12, color: t.q.red }}>Passwords don&apos;t match yet</Text>
              )}
            </View>

            <Field
              label="Referral code (optional)"
              value={referral}
              onChangeText={v => setReferral(cleanReferral(v))}
              placeholder="A friend's Patient ID, or a promo code"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          {isMinor && (
            <Notice tone="teal" icon="people-outline">
              You are under {CARETAKER_RECOMMENDED_BELOW_AGE}. We recommend linking a parent or guardian so
              they can help manage your bookings.
            </Notice>
          )}

          <SectionHead title={isMinor ? 'Parent or guardian' : 'Caretaker (optional)'} />
          {!showCaretaker ? (
            <Card>
              <Row
                icon="person-add-outline"
                title={isMinor ? 'Add a parent or guardian' : 'Someone manages my care'}
                sub="They will be able to book and manage visits for you"
                chevron
                onPress={() => setShowCaretaker(true)}
              />
            </Card>
          ) : (
            <Card pad style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: t.q.ink60 }}>
                  Ask them for the six-character Patient ID on their profile.
                </Text>
                <Btn
                  label="Remove" variant="ghost" small
                  onPress={() => { setShowCaretaker(false); setCaretakerCode(''); setCaretakerRel('') }}
                />
              </View>
              <Field
                label="Their Patient ID"
                value={caretakerCode}
                onChangeText={v => setCaretakerCode(v.toUpperCase())}
                placeholder="K7M3QX"
                autoCapitalize="characters"
                maxLength={6}
                style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 3, textAlign: 'center' }}
              />
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>Your relationship to them</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {RELATIONSHIPS.map(r => (
                    <Chip
                      key={r.value}
                      label={r.label}
                      on={caretakerRel === r.value}
                      onPress={() => setCaretakerRel(r.value)}
                    />
                  ))}
                </View>
              </View>
            </Card>
          )}

          {!!error && <Notice tone="red">{error}</Notice>}

          <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 14 }}>
            <TermsCheckbox checked={agreed} onChange={setAgreed} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.q.line }} />
              <Text style={{ fontSize: 12, color: t.q.ink60 }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: t.q.line }} />
            </View>

            <Btn
              label={googleBusy ? 'Opening Google…' : 'Sign up with Google'}
              variant="secondary"
              icon="logo-google"
              loading={googleBusy}
              onPress={async () => {
                if (!agreed) { setError('Please agree to the Terms of Service and Privacy Policy first.'); return }
                haptics.tap(); setGoogleBusy(true); setError('')
                const e = await signInWithGoogle()
                setGoogleBusy(false)
                if (e) setError(e)
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 4 }}>
              <Text style={{ fontSize: 13, color: t.q.ink60 }}>Already have an account? </Text>
              <Btn label="Sign in" variant="ghost" small onPress={() => navigation.navigate('Login')} />
            </View>
          </View>
        </Body>

        <BottomBar>
          <Btn grow label="Create account" loading={busy} disabled={!agreed} onPress={handleRegister} />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
