import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { haptics }  from '@queue/shared/lib/haptics'

interface Props { navigation: any }

export function HospitalAuthScreen({ navigation }: Props) {
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
    const err = await signIn(email.trim().toLowerCase(), password, 'hospital')
    setLoading(false)
    if (err) {
      haptics.error()
      setError(err)
    } else {
      haptics.success()
      // AuthContext auto-detects staff/doctor role and sets staffMode=true
    }
  }

  return (
    <SafeAreaView edges={['top','left','right','bottom']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>

          {/* Back */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
            <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
          </TouchableOpacity>

          <View style={s.content}>
            {/* Header */}
            <View style={[s.iconWrap, { backgroundColor: 'rgba(91,158,255,0.15)', borderColor: 'rgba(91,158,255,0.3)' }]}>
              <Ionicons name="business-outline" size={30} color="#5B9EFF" />
            </View>
            <Text style={[s.title, { color: t.textPrimary }]}>Staff Portal</Text>
            <Text style={[s.sub, { color: t.textMuted }]}>
              Sign in to your hospital, clinic, or ambulance crew account.
            </Text>

            {/* Login form */}
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
                : <Text style={s.loginBtnText}>Sign in to Portal</Text>}
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.divider}>
              <View style={[s.divLine, { backgroundColor: t.cardBorder }]} />
              <Text style={[s.divText, { color: t.textMuted }]}>or</Text>
              <View style={[s.divLine, { backgroundColor: t.cardBorder }]} />
            </View>

            {/* Register new hospital */}
            <TouchableOpacity
              onPress={() => navigation.navigate('HospitalRegister')}
              style={[s.registerCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
              activeOpacity={0.85}
            >
              <View style={[s.registerIcon, { backgroundColor: `${t.accent}15` }]}>
                <Ionicons name="add-circle-outline" size={22} color={t.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.registerTitle, { color: t.textPrimary }]}>Register a new hospital</Text>
                <Text style={[s.registerSub, { color: t.textMuted }]}>
                  Set up your hospital on Queue — takes about 5 minutes
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:         { flex: 1 },
  back:         { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  content:      { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  iconWrap:     { width: 64, height: 64, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:        { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  sub:          { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  errorBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  errorText:    { fontSize: 13, color: '#FF5C5C', flex: 1 },
  input:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  inputText:    { fontSize: 14, flex: 1 },
  loginBtn:     { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4, marginBottom: 24 },
  loginBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  divider:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  divLine:      { flex: 1, height: 1 },
  divText:      { fontSize: 12 },
  registerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  registerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  registerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  registerSub:  { fontSize: 12, lineHeight: 16 },
})
