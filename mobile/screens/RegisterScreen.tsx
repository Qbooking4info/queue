import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

export function RegisterScreen({ navigation }: { navigation: any }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleRegister() {
    if (!fullName.trim())  { setError('Please enter your full name.'); return }
    if (!email.trim())     { setError('Please enter your email address.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true); setError('')

    const { data: authData, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }

    // Insert profile row immediately — before sign-in, so it always exists
    if (authData.user) {
      await supabase.from('users').insert({
        auth_id: authData.user.id,
        full_name: fullName.trim(),
        email: email.trim(),
      })
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInErr) { setError(signInErr.message); setLoading(false); return }
    // on success: App.tsx session listener switches to main navigator automatically
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Back */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={{ color: t.accent, fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logoIcon}>
              <Text style={{ fontSize: 32 }}>🏥</Text>
            </View>
            <Text style={styles.logoText}>Queue</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Book appointments at top hospitals near you</Text>

            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Amaka Okafor"
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="words"
                  autoComplete="name"
                  style={styles.input}
                />
              </View>

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
                  placeholder="Min. 8 characters"
                  placeholderTextColor={t.textMuted}
                  secureTextEntry
                  autoComplete="new-password"
                  style={styles.input}
                />
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              onPress={handleRegister}
              disabled={loading}
              style={[styles.btn, loading && styles.btnDisabled]}>
              <Text style={styles.btnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
            </TouchableOpacity>

            <Text style={styles.terms}>
              By creating an account you agree to our Terms of Service and Privacy Policy.
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: t.bg },
  scroll:      { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: 24 },
  backBtn:     { marginBottom: 16 },
  logoWrap:    { alignItems: 'center', marginBottom: 28 },
  logoIcon:    { width: 64, height: 64, borderRadius: 20, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  logoText:    { fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: -0.5 },
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
  terms:       { fontSize: 10, color: t.textMuted, textAlign: 'center', marginTop: 14, lineHeight: 15 },
  footer:      { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:  { fontSize: font.sm, color: t.textSub },
  footerLink:  { fontSize: font.sm, color: t.accent, fontWeight: '700' },
})
