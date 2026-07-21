import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { supabase }  from '../lib/supabase'

interface Props { navigation: any }

export function PrivacySecurityScreen({ navigation }: Props) {
  const { theme: t }      = useTheme()
  const { signOut, user } = useAuth()

  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [pwError,    setPwError]    = useState('')
  const [pwSuccess,  setPwSuccess]  = useState(false)
  const [saving,     setSaving]     = useState(false)

  // MC1: Verify current password before allowing the update
  async function handleChangePassword() {
    setPwError(''); setPwSuccess(false)
    if (!currentPw)          { setPwError('Enter your current password.'); return }
    if (newPw.length < 6)    { setPwError('New password must be at least 6 characters.'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    setSaving(true)

    // Re-authenticate with the current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: currentPw,
    })
    if (signInError) {
      setSaving(false)
      setPwError('Current password is incorrect.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) { setPwError(error.message) }
    else { setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[s.back, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Privacy & Security</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Account info */}
        <View style={[s.accountCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={[s.accountAvatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={[s.accountAvatarText, { color: t.accent }]}>
              {user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.accountName, { color: t.textPrimary }]}>{user?.full_name ?? '—'}</Text>
            <Text style={[s.accountEmail, { color: t.textMuted }]}>{user?.email ?? '—'}</Text>
          </View>
          <View style={[s.verifiedBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={[s.verifiedText, { color: t.accent }]}>✓ Verified</Text>
          </View>
        </View>

        {/* Change password */}
        <Text style={[s.sectionTitle, { color: t.textMuted }]}>Change password</Text>
        <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {[
            { label: 'Current password', value: currentPw, set: setCurrentPw },
            { label: 'New password',     value: newPw,     set: setNewPw     },
            { label: 'Confirm password', value: confirmPw, set: setConfirmPw },
          ].map(f => (
            <View key={f.label} style={s.fieldWrap}>
              <Text style={[s.fieldLabel, { color: t.textMuted }]}>{f.label}</Text>
              <TextInput
                value={f.value} onChangeText={f.set}
                secureTextEntry placeholder="••••••••" placeholderTextColor={t.textMuted}
                style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
              />
            </View>
          ))}

          {!!pwError   && <Text style={s.errorText}>{pwError}</Text>}
          {pwSuccess   && <Text style={s.successText}>Password changed successfully.</Text>}

          <TouchableOpacity onPress={handleChangePassword} disabled={saving}
            style={[s.saveBtn, { backgroundColor: t.accent, opacity: saving ? 0.6 : 1 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Update password</Text>}
          </TouchableOpacity>
        </View>

        {/* MM12: Privacy preference toggles removed — they were static decorations with no backing state */}

        {/* Danger zone */}
        <Text style={[s.sectionTitle, { color: t.textMuted }]}>Account</Text>
        {/* MH8: navigation.goBack() removed — session becoming null drives navigation automatically */}
        <TouchableOpacity onPress={() => signOut()}
          style={[s.dangerBtn, { borderColor: 'rgba(255,92,92,0.3)', backgroundColor: 'rgba(255,92,92,0.06)' }]}>
          <Text style={{ fontSize: 16 }}>🚪</Text>
          <Text style={[s.dangerBtnText, { color: '#FF5C5C' }]}>Sign out of all devices</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.dangerBtn, { borderColor: 'rgba(255,92,92,0.2)', backgroundColor: 'transparent', marginTop: 6 }]}>
          <Text style={{ fontSize: 16 }}>🗑️</Text>
          <Text style={[s.dangerBtnText, { color: t.textMuted }]}>Delete my account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:             { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  back:             { fontSize: 22 },
  title:            { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  accountCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 20, borderWidth: 1 },
  accountAvatar:    { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  accountAvatarText:{ fontSize: 16, fontWeight: '800' },
  accountName:      { fontSize: 14, fontWeight: '700' },
  accountEmail:     { fontSize: 11, marginTop: 2 },
  verifiedBadge:    { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  verifiedText:     { fontSize: 10, fontWeight: '700' },
  sectionTitle:     { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  card:             { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
  fieldWrap:        { marginBottom: 12 },
  fieldLabel:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:            { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  errorText:        { color: '#F87171', fontSize: 12, marginBottom: 8 },
  successText:      { color: '#4ADE80', fontSize: 12, marginBottom: 8 },
  saveBtn:          { borderRadius: 12, padding: 13, alignItems: 'center' },
  saveBtnText:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  dangerBtn:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 13, borderWidth: 1 },
  dangerBtnText:    { fontSize: 13, fontWeight: '600' },
})
