// Doctor self-registration -- creates an independent account with no hospital link.
// Mirrors mobile/screens/RegisterScreen.tsx's shape (patient sign-up), since a doctor
// account is the exact same kind of `users` row.
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

export function SignUpScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const { theme: t } = useTheme()
  const { signUp }   = useAuth()

  const [fullName, setFullName] = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSignUp() {
    setError('')
    if (!fullName.trim() || !email.trim() || !phone.trim() || !password) {
      setError('All fields are required.'); return
    }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    const err = await signUp(email.trim().toLowerCase(), password, fullName.trim(), phone.trim())
    setLoading(false)
    if (err) {
      haptics.error()
      setError(err)
    } else {
      haptics.success()
      // AuthContext's auth-state listener picks up the new session from here;
      // App.tsx routes straight into the main app -- Dashboard/Hospitals show their
      // own empty state since there's no hospital link yet.
    }
  }

  return (
    <SafeAreaView edges={['top','left','right','bottom']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
          <View style={s.content}>
            <View style={[s.iconWrap, { backgroundColor: 'rgba(91,158,255,0.15)', borderColor: 'rgba(91,158,255,0.3)' }]}>
              <Ionicons name="person-add-outline" size={30} color="#5B9EFF" />
            </View>
            <Text style={[s.title, { color: t.textPrimary }]}>Create Your Account</Text>
            <Text style={[s.sub, { color: t.textMuted }]}>
              One independent account, linkable to any number of hospitals afterward.
            </Text>

            {error ? (
              <View style={[s.errorBanner, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.3)' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#FF5C5C" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="person-outline" size={16} color={t.textMuted} />
              <TextInput
                value={fullName} onChangeText={setFullName}
                placeholder="Full name" placeholderTextColor={t.textMuted}
                style={[s.inputText, { color: t.textPrimary }]}
              />
            </View>

            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="mail-outline" size={16} color={t.textMuted} />
              <TextInput
                value={email} onChangeText={setEmail}
                placeholder="Email" placeholderTextColor={t.textMuted}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                style={[s.inputText, { color: t.textPrimary }]}
              />
            </View>

            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="call-outline" size={16} color={t.textMuted} />
              <TextInput
                value={phone} onChangeText={setPhone}
                placeholder="Phone" placeholderTextColor={t.textMuted}
                keyboardType="phone-pad"
                style={[s.inputText, { color: t.textPrimary }]}
              />
            </View>

            <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <Ionicons name="lock-closed-outline" size={16} color={t.textMuted} />
              <TextInput
                value={password} onChangeText={setPassword}
                placeholder="Password (min. 8 characters)" placeholderTextColor={t.textMuted}
                secureTextEntry={!showPass}
                style={[s.inputText, { color: t.textPrimary, flex: 1 }]}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color={t.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleSignUp} disabled={loading}
              style={[s.submitBtn, { backgroundColor: loading ? 'rgba(91,158,255,0.6)' : '#5B9EFF' }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>Create Account</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={onBackToLogin} style={{ alignSelf: 'center', marginTop: 18 }}>
              <Text style={{ fontSize: 13, color: t.textMuted }}>Already have an account? <Text style={{ color: '#5B9EFF', fontWeight: '700' }}>Sign in</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  content:       { paddingHorizontal: 24, paddingVertical: 40 },
  iconWrap:      { width: 64, height: 64, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:         { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  sub:           { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  errorBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  errorText:     { fontSize: 13, color: '#FF5C5C', flex: 1 },
  input:         { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  inputText:     { fontSize: 14, flex: 1 },
  submitBtn:     { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
