import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

export function LoginScreen({ navigation }: { navigation: any }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleLogin() {
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) { setError(err.message); setLoading(false) }
    // on success: App.tsx session listener switches to main navigator automatically
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logoIcon}>
              <Text style={{ fontSize: 32 }}>🏥</Text>
            </View>
            <Text style={styles.logoText}>Queue</Text>
            <Text style={styles.logoSub}>Healthcare, simplified</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your patient account</Text>

            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={t.textMuted}
                  secureTextEntry
                  autoComplete="password"
                  style={styles.input}
                />
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={[styles.btn, loading && styles.btnDisabled]}>
              <Text style={styles.btnText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Create account</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: t.bg },
  scroll:      { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', paddingVertical: 40 },
  logoWrap:    { alignItems: 'center', marginBottom: 36 },
  logoIcon:    { width: 72, height: 72, borderRadius: 22, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText:    { fontSize: 28, fontWeight: '800', color: t.text, letterSpacing: -0.5 },
  logoSub:     { fontSize: font.sm, color: t.textSub, marginTop: 2 },
  card:        { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.xl },
  title:       { fontSize: font.xl, fontWeight: '800', color: t.text, letterSpacing: -0.4, marginBottom: 4 },
  subtitle:    { fontSize: font.sm, color: t.textSub, marginBottom: 24 },
  fields:      { gap: 14, marginBottom: 16 },
  field:       { gap: 6 },
  label:       { fontSize: font.xs, fontWeight: '600', color: t.textSub },
  input:       { backgroundColor: t.bg, borderWidth: 1, borderColor: t.borderMed, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, fontSize: font.base, color: t.text },
  error:       { fontSize: font.xs, color: '#FF5C5C', backgroundColor: 'rgba(255,92,92,0.08)', borderWidth: 1, borderColor: 'rgba(255,92,92,0.2)', borderRadius: radius.md, padding: 10, marginBottom: 12 },
  btn:         { backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText:     { fontSize: font.base, fontWeight: '800', color: '#060A07' },
  footer:      { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:  { fontSize: font.sm, color: t.textSub },
  footerLink:  { fontSize: font.sm, color: t.accent, fontWeight: '700' },
})
