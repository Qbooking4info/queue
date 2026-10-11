import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { CONSENT_STATEMENT } from '@queue/shared/lib/privacy'
import {
  requestVerificationCode, confirmVerificationCode, registerVerified,
  type VerifyChannel,
} from '@queue/shared/lib/api'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { linkDependent } from '@queue/shared/lib/api'
import { DateOfBirthSelect } from '@queue/shared/components/ui/DateOfBirthSelect'

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
  const { signIn }                = useAuth()
  const [fullName, setFullName]   = useState('')
  const [dob,      setDob]        = useState('')
  const [phone,    setPhone]      = useState('')
  const [email,    setEmail]      = useState('')
  const [pass,     setPass]       = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [error,    setError]      = useState('')
  const [busy,     setBusy]       = useState(false)
  const [consented, setConsented] = useState(false)

  // Verification step. The screen stays one scroll; `stage` decides whether the
  // details form or the code entry is showing, rather than pushing a second route
  // that would lose the half-filled form on a back gesture.
  const [stage,    setStage]    = useState<'details' | 'code'>('details')
  const [channel,  setChannel]  = useState<VerifyChannel>('email')
  const [sentTo,   setSentTo]   = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [resending, setResending] = useState(false)

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
    if (!dob)              { setError('Enter your date of birth.'); return }
    if (!phone.trim())    { setError('Enter your phone number.'); return }
    if (!email.trim())    { setError('Enter your email address.'); return }
    if (pass.length < 6)  { setError('Password must be at least 6 characters.'); return }
    if (pass !== confirm) { setError('Passwords do not match.'); return }
    if (caretakerCode.trim() && !caretakerRel) { setError('Select your relationship to your caretaker.'); return }
    // Consent has to be an act, not an inference from pressing a button labelled
    // something else. Blocking here is the point: NDPR consent must be freely given
    // and specific, and a pre-ticked or implied box is neither.
    if (!consented) { setError('Please agree to the Privacy Policy and Terms to continue.'); return }

    // Send the code and move to the code step. The account is NOT created here --
    // it is created server-side only once a code has been confirmed, so closing the
    // app at this point leaves nothing behind.
    setBusy(true); setError('')
    const dest = channel === 'email' ? email.trim().toLowerCase() : phone.trim()
    const req = await requestVerificationCode(dest, channel)
    setBusy(false)
    if (!req.ok) {
      setError(req.notConfigured && channel === 'sms'
        ? 'SMS codes are not switched on yet. Please verify with your email instead.'
        : req.error)
      // Steer them to the channel that does work rather than leaving them stuck.
      if (req.notConfigured && channel === 'sms') setChannel('email')
      return
    }
    setSentTo(req.destination)
    setCodeInput('')
    setStage('code')
  }

  async function handleResend() {
    setResending(true); setError('')
    const dest = channel === 'email' ? email.trim().toLowerCase() : phone.trim()
    const req = await requestVerificationCode(dest, channel)
    setResending(false)
    if (!req.ok) { setError(req.error); return }
    setSentTo(req.destination)
    Alert.alert('Code sent', `A new code is on its way to ${req.destination}.`)
  }

  async function handleConfirmCode() {
    if (!/^\d{6}$/.test(codeInput.trim())) { setError('Enter the 6-digit code.'); return }
    setBusy(true); setError('')

    const dest = channel === 'email' ? email.trim().toLowerCase() : phone.trim()
    const confirmed = await confirmVerificationCode(dest, channel, codeInput.trim())
    if (!confirmed.ok) { setBusy(false); setError(confirmed.error); return }

    const regErr = await registerVerified({
      claimToken:  confirmed.claimToken,
      email:       email.trim().toLowerCase(),
      password:    pass,
      fullName:    fullName.trim(),
      phone:       phone.trim(),
      dateOfBirth: dob,
    })
    if (regErr) { setBusy(false); setError(regErr); return }

    // The route deliberately returns no session, so sign in with the password just
    // set. That keeps session minting entirely with Supabase rather than having an
    // API route hand out credentials.
    const signInErr = await signIn(email.trim().toLowerCase(), pass, 'patient')
    if (signInErr) {
      setBusy(false)
      setError(`Your account was created, but sign-in failed: ${signInErr}. Please sign in from the login screen.`)
      return
    }

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
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Back */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
            <Ionicons name="arrow-back" size={14} color={t.accent} />
            <Text style={[s.backText, { color: t.accent }]}>Back</Text>
          </TouchableOpacity>

          <Text style={[s.title,  { color: t.textPrimary }]}>Create account</Text>

          {/* Code step. Shown instead of the form so the screen never presents two
              submit actions at once. The details stay in state, so Back returns to
              a fully populated form rather than an empty one. */}
          {stage === 'code' && (
            <View style={{ marginTop: 18 }}>
              <Text style={{ fontSize: 15, color: t.textSecondary, lineHeight: 21, marginBottom: 4 }}>
                We sent a 6-digit code to
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary, marginBottom: 16 }}>
                {sentTo}
              </Text>

              <Text style={[s.label, { color: t.textMuted }]}>Verification code</Text>
              <TextInput
                value={codeInput}
                onChangeText={v => setCodeInput(v.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                placeholder="000000"
                placeholderTextColor={t.textFaint}
                style={[s.input, {
                  backgroundColor: t.cardBg, borderColor: t.inputBorder, color: t.textPrimary,
                  fontSize: 26, letterSpacing: 10, textAlign: 'center', fontWeight: '700',
                }]}
              />

              {!!error && (
                <View style={[s.errBox, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
                  <Text style={[s.errText, { color: t.danger }]}>{error}</Text>
                </View>
              )}

              <Button
                label="Verify and create account"
                onPress={handleConfirmCode}
                loading={busy}
                size="lg"
                style={{ marginTop: t.spacing.md }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
                <TouchableOpacity onPress={() => { setStage('details'); setError('') }} disabled={busy}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.textSecondary }}>Change details</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResend} disabled={busy || resending}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>
                    {resending ? 'Sending…' : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {stage === 'details' && (
          <Text style={[s.sub,    { color: t.textMuted   }]}>Join Queue to book appointments easily</Text>
          )}

          {stage === 'details' && (
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>

            {[
              { label: 'Full name',        value: fullName, onChange: setFullName, placeholder: 'Adaeze Okonkwo',     keyboardType: 'default',       autoCapitalize: 'words',  secure: false },
            ].map(f => (
              <View key={f.label} style={s.fieldWrap}>
                <Text style={[s.label, { color: t.textMuted }]}>{f.label}</Text>
                <TextInput
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor={t.textMuted}
                  keyboardType={f.keyboardType as any}
                  autoCapitalize={f.autoCapitalize as any}
                  autoCorrect={false}
                  secureTextEntry={f.secure}
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>
            ))}

            <View style={s.fieldWrap}>
              <Text style={[s.label, { color: t.textMuted }]}>Date of birth</Text>
              <DateOfBirthSelect value={dob} onChange={setDob} maxYear={new Date().getFullYear()} />
            </View>

            {[
              { label: 'Phone number',     value: phone,    onChange: setPhone,    placeholder: '+234 812 345 6789',  keyboardType: 'phone-pad',     autoCapitalize: 'none',   secure: false },
              { label: 'Email address',    value: email,    onChange: setEmail,    placeholder: 'you@email.com',      keyboardType: 'email-address', autoCapitalize: 'none',   secure: false },
              { label: 'Password',         value: pass,     onChange: setPass,     placeholder: '••••••••',           keyboardType: 'default',       autoCapitalize: 'none',   secure: true  },
              { label: 'Confirm password', value: confirm,  onChange: setConfirm,  placeholder: '••••••••',           keyboardType: 'default',       autoCapitalize: 'none',   secure: true  },
            ].map(f => (
              <View key={f.label} style={s.fieldWrap}>
                <Text style={[s.label, { color: t.textMuted }]}>{f.label}</Text>
                <TextInput
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor={t.textMuted}
                  keyboardType={f.keyboardType as any}
                  autoCapitalize={f.autoCapitalize as any}
                  autoCorrect={false}
                  secureTextEntry={f.secure}
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>
            ))}

            {isMinor && (
              <View style={[s.recommendBanner, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.recommendText, { color: t.accent }]}>
                  Since you're under {CARETAKER_RECOMMENDED_BELOW_AGE}, we recommend linking a parent or guardian's account so they can help manage your bookings.
                </Text>
              </View>
            )}

            {!showCaretaker ? (
              <TouchableOpacity onPress={() => setShowCaretaker(true)} style={s.caretakerToggle}>
                <Text style={[s.caretakerToggleText, { color: t.accent }]}>
                  {isMinor ? '+ Add a parent/guardian (recommended)' : '+ Add a caretaker (optional)'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.caretakerCard, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                <View style={s.caretakerHeader}>
                  <Text style={[s.caretakerTitle, { color: t.textPrimary }]}>Caretaker (optional)</Text>
                  <TouchableOpacity onPress={() => { setShowCaretaker(false); setCaretakerCode(''); setCaretakerRel('') }}>
                    <Text style={[s.caretakerRemove, { color: t.textMuted }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[s.helpText, { color: t.textMuted }]}>
                  Ask them for their 6-character Patient ID and enter it here. They'll be able to book and manage appointments on your behalf.
                </Text>
                <Text style={[s.label, { color: t.textMuted }]}>Caretaker's Patient ID</Text>
                <TextInput
                  value={caretakerCode} onChangeText={v => setCaretakerCode(v.toUpperCase())}
                  placeholder="e.g. K7M3QX" placeholderTextColor={t.textMuted}
                  autoCapitalize="characters" maxLength={6}
                  style={[s.input, { backgroundColor: t.cardBg, borderColor: t.inputBorder, color: t.textPrimary,
                    fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, textAlign: 'center' }]}
                />
                <Text style={[s.label, { color: t.textMuted, marginTop: 12 }]}>Your relationship to them</Text>
                <View style={s.pillRow}>
                  {RELATIONSHIPS.map(r => (
                    <TouchableOpacity key={r.value} onPress={() => setCaretakerRel(r.value)}
                      style={[s.pill, { borderColor: caretakerRel === r.value ? t.accent : t.cardBorder, backgroundColor: caretakerRel === r.value ? t.accentBg : t.cardBg }]}>
                      <Text style={[s.pillText, { color: caretakerRel === r.value ? t.accent : t.textMuted, fontWeight: caretakerRel === r.value ? '700' : '400' }]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!!error && (
              <View style={[s.errBox, { backgroundColor: '#3B1111', borderColor: '#7B2020' }]}>
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            {/* Channel choice. SMS is offered but may be unconfigured; the request
                handler says so plainly and moves them to email rather than
                pretending a text was sent. */}
            <Text style={[s.label, { color: t.textMuted, marginTop: 14 }]}>Send my verification code by</Text>
            <View style={s.pillRow}>
              {([
                { key: 'email' as VerifyChannel, label: 'Email', icon: 'mail-outline' as const },
                { key: 'sms'   as VerifyChannel, label: 'SMS',   icon: 'chatbubble-outline' as const },
              ]).map(c => (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setChannel(c.key)}
                  style={[s.pill, {
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderColor: channel === c.key ? t.accent : t.cardBorder,
                    backgroundColor: channel === c.key ? t.accentBg : t.cardBg,
                  }]}
                >
                  <Ionicons name={c.icon} size={14} color={channel === c.key ? t.accent : t.textMuted} />
                  <Text style={[s.pillText, {
                    color: channel === c.key ? t.accent : t.textMuted,
                    fontWeight: channel === c.key ? '700' : '400',
                  }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button label="Send verification code" onPress={handleRegister} loading={busy} size="lg" style={{ marginTop: t.spacing.sm }} />

          </View>
          )}

          <View style={s.footer}>
            <Text style={[s.footerText, { color: t.textMuted }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={[s.footerLink, { color: t.accent }]}>Sign in</Text>
            </TouchableOpacity>
          </View>

          {/* An explicit, unticked control replacing the passive "by creating an
              account you agree" line. That line recorded nothing and asked nothing;
              this one gates submission and is written to user_consents with the
              policy version the user actually saw. */}
          <TouchableOpacity
            onPress={() => setConsented(v => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consented }}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: t.spacing.md }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 6, marginTop: 1,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: consented ? t.accent : t.inputBorder,
              backgroundColor: consented ? t.accent : 'transparent',
            }}>
              {consented && <Ionicons name="checkmark" size={15} color={t.onAccent ?? '#FFFFFF'} />}
            </View>
            <Text style={[s.terms, { color: t.textSecondary, textAlign: 'left', flex: 1, paddingHorizontal: 0 }]}>
              {CONSENT_STATEMENT}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:      { flex: 1 },
  scroll:    { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24 },
  backBtn:   { marginBottom: 20 },
  backText:  { fontSize: 16, fontWeight: '600' },
  title:     { fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  sub:       { fontSize: 15, marginTop: 4, marginBottom: 24 },
  card:      { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14, marginBottom: 20 },
  fieldWrap: { gap: 6 },
  label:     { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  errBox:    { borderWidth: 1, borderRadius: 10, padding: 10 },
  errText:   { color: '#F87171', fontSize: 14 },
  footer:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  footerText:{ fontSize: 15 },
  footerLink:{ fontSize: 15, fontWeight: '700' },
  terms:     { fontSize: 13, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12 },
  recommendBanner:   { borderRadius: 12, borderWidth: 1, padding: 12 },
  recommendText:     { fontSize: 14, lineHeight: 17 },
  caretakerToggle:   { paddingVertical: 4 },
  caretakerToggleText: { fontSize: 15, fontWeight: '700' },
  caretakerCard:     { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  caretakerHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caretakerTitle:    { fontSize: 15, fontWeight: '800' },
  caretakerRemove:   { fontSize: 14, fontWeight: '600' },
  helpText:          { fontSize: 13, lineHeight: 16 },
  pillRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill:              { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  pillText:          { fontSize: 14 },
})
