import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { haptics }  from '../lib/haptics'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

const HOSPITAL_TYPES = ['General', 'Specialist', 'Teaching', 'Private', 'Federal', 'State', 'Clinic', 'Maternity']

interface Props { navigation: any }

export function HospitalRegisterScreen({ navigation }: Props) {
  const { theme: t }        = useTheme()
  const { refreshProfile }  = useAuth()

  const [step, setStep] = useState(0)

  // Account
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)

  // Hospital
  const [hosName,   setHosName]   = useState('')
  const [hosType,   setHosType]   = useState('General')
  const [address,   setAddress]   = useState('')
  const [city,      setCity]      = useState('')
  const [state,     setState]     = useState('')
  const [hosPhone,  setHosPhone]  = useState('')

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function validateStep0() {
    if (!fullName.trim())  { setError('Enter your full name.'); return false }
    if (!email.trim())     { setError('Enter your work email.'); return false }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return false }
    return true
  }

  function validateStep1() {
    if (!hosName.trim()) { setError('Enter the hospital name.'); return false }
    if (!city.trim())    { setError('Enter the city.'); return false }
    if (!state.trim())   { setError('Enter the state.'); return false }
    return true
  }

  function goNext() {
    setError('')
    if (step === 0) {
      if (!validateStep0()) return
      setStep(1)
    } else {
      handleSubmit()
    }
  }

  async function handleSubmit() {
    setError('')
    if (!validateStep1()) return
    setLoading(true)
    try {
      // 1. Create Supabase account
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (signUpErr) throw new Error(signUpErr.message)
      if (!signUpData.session) throw new Error('Account created — please check your email to confirm, then sign in.')

      // 2. Register hospital via onboarding API
      const jwt = signUpData.session.access_token
      const res = await fetch(`${API_URL}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          name:        hosName.trim(),
          type:        hosType,
          phone:       hosPhone.trim() || undefined,
          address:     address.trim() || undefined,
          city:        city.trim(),
          state:       state.trim(),
          clinics:     [{ name: 'OPD', is_opd: true }],
          specialties: [],
          hours:       [],
          features:    { accepts_virtual: false, emergency_services: false, is_24_hours: false, approval_required: false },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Hospital registration failed')
      }

      // 3. Refresh profile — should now find hospital_admin role
      await refreshProfile()
      haptics.success()
    } catch (e) {
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

          <TouchableOpacity onPress={() => step > 0 ? setStep(0) : navigation.goBack()} style={s.back}>
            <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
          </TouchableOpacity>

          <View style={s.content}>
            {/* Progress */}
            <View style={s.progress}>
              {[0, 1].map(i => (
                <View key={i} style={[s.dot, { backgroundColor: i <= step ? t.accent : t.cardBorder, flex: 1 }]} />
              ))}
            </View>
            <Text style={[s.stepLabel, { color: t.textMuted }]}>{step === 0 ? 'Step 1 of 2 · Your account' : 'Step 2 of 2 · Your hospital'}</Text>

            <Text style={[s.title, { color: t.textPrimary }]}>{step === 0 ? 'Create your account' : 'Hospital details'}</Text>
            <Text style={[s.sub, { color: t.textMuted }]}>
              {step === 0
                ? 'This account will be the primary admin for your hospital.'
                : 'Basic information to set up your hospital on Queue.'}
            </Text>

            {error ? (
              <View style={[s.errorBanner, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.3)' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#FF5C5C" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            {step === 0 ? (
              <>
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
              </>
            ) : (
              <>
                <Field icon="business-outline"  placeholder="Hospital name"    value={hosName}  onChange={setHosName} t={t} />
                <Field icon="call-outline"       placeholder="Hospital phone (optional)" value={hosPhone} onChange={setHosPhone} t={t} keyboard="phone-pad" />
                <Field icon="location-outline"   placeholder="Street address (optional)" value={address} onChange={setAddress} t={t} />
                <View style={s.row}>
                  <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, flex: 1 }]}>
                    <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={t.textMuted} style={[s.inputText, { color: t.textPrimary }]} />
                  </View>
                  <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, flex: 1 }]}>
                    <TextInput value={state} onChangeText={setState} placeholder="State" placeholderTextColor={t.textMuted} style={[s.inputText, { color: t.textPrimary }]} />
                  </View>
                </View>

                {/* Type picker */}
                <Text style={[s.label, { color: t.textMuted }]}>Hospital type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {HOSPITAL_TYPES.map(ty => (
                      <TouchableOpacity key={ty} onPress={() => setHosType(ty)}
                        style={[s.chip, { backgroundColor: hosType === ty ? t.accent : t.cardBg, borderColor: hosType === ty ? t.accent : t.cardBorder }]}>
                        <Text style={[s.chipText, { color: hosType === ty ? '#fff' : t.textMuted }]}>{ty}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <TouchableOpacity onPress={goNext} disabled={loading}
              style={[s.btn, { backgroundColor: loading ? `${t.accent}80` : t.accent }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>{step === 0 ? 'Continue' : 'Create Hospital'}</Text>}
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
  progress:    { flexDirection: 'row', gap: 6, marginBottom: 12 },
  dot:         { height: 4, borderRadius: 99 },
  stepLabel:   { fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
  title:       { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  sub:         { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  errorText:   { fontSize: 13, color: '#FF5C5C', flex: 1 },
  input:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  inputText:   { fontSize: 14, flex: 1 },
  row:         { flexDirection: 'row', gap: 10 },
  label:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
  chipText:    { fontSize: 12, fontWeight: '700' },
  btn:         { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 8 },
  btnText:     { fontSize: 15, fontWeight: '800', color: '#fff' },
})
