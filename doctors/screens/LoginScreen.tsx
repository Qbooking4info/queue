// Trimmed from mobile/screens/HospitalAuthScreen.tsx -- drops the "Register a new
// hospital" CTA (not relevant here) and retitles the copy for a doctor-only app.
// Doctor accounts are independent and self-registered (see SignUpScreen) -- a
// hospital admin only links an existing account to their hospital by ID afterward,
// never issues the account itself.
import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { haptics }  from '../lib/haptics'

export function LoginScreen({ onCreateAccount }: { onCreateAccount: () => void }) {
  const { theme: t } = useTheme()
  const { signIn }   = useAuth()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleLogin() {
    setError('')
    if (!email.trim() || !password) { setError('Email and password are required.'); return }
    setLoading(true)
    const err = await signIn(email.trim().toLowerCase(), password)
    setLoading(false)
    if (err) {
      haptics.error()
      setError(err)
    } else {
      haptics.success()
      // AuthContext resolves the doctor profile from here; App.tsx's root
      // navigator reacts once it lands (or reports "not a doctor account").
    }
  }

  return (
    <SafeAreaView edges={['top','left','right','bottom']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
          <View style={s.content}>
            {/* Header */}
            <View style={[s.iconWrap, { backgroundColor: 'rgba(91,158,255,0.15)', borderColor: 'rgba(91,158,255,0.3)' }]}>
              <Ionicons name="medkit-outline" size={30} color="#5B9EFF" />
            </View>
            <Text style={[s.title, { color: t.textPrimary }]}>Doctor Sign In</Text>
            <Text style={[s.sub, { color: t.textMuted }]}>
              Your own independent account — link it to any hospital or clinic afterward.
            </Text>

            {error ? (
              <View style={[s.errorBanner, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.3)' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#FF5C5C" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="mail-outline" size={16} color={t.textMuted} />
              <TextInput
                value={email} onChangeText={setEmail}
                placeholder="Work email" placeholderTextColor={t.textMuted}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                style={[s.inputText, { color: t.textPrimary }]}
              />
            </View>

            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="lock-closed-outline" size={16} color={t.textMuted} />
              <TextInput
                value={password} onChangeText={setPassword}
                placeholder="Password" placeholderTextColor={t.textMuted}
                secureTextEntry={!showPass}
                style={[s.inputText, { color: t.textPrimary, flex: 1 }]}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color={t.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleLogin} disabled={loading}
              style={[s.loginBtn, { backgroundColor: loading ? 'rgba(91,158,255,0.6)' : '#5B9EFF' }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.loginBtnText}>Sign In</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={onCreateAccount} style={{ alignSelf: 'center', marginTop: 18 }}>
              <Text style={{ fontSize: 13, color: t.textMuted }}>New here? <Text style={{ color: '#5B9EFF', fontWeight: '700' }}>Create an account</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:         { flex: 1 },
  content:      { paddingHorizontal: 24, paddingVertical: 40 },
  iconWrap:     { width: 64, height: 64, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:        { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  sub:          { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  errorBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  errorText:    { fontSize: 13, color: '#FF5C5C', flex: 1 },
  input:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  inputText:    { fontSize: 14, flex: 1 },
  loginBtn:     { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4 },
  loginBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
