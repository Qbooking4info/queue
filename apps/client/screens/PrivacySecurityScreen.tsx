import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Share } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase }  from '@queue/shared/lib/supabase'
import { deleteAccount } from '@queue/shared/lib/api'
import { RETENTION_SUMMARY, POLICY_VERSION } from '@queue/shared/lib/privacy'
// expo-file-system 56 moved the classic API to /legacy. StorageAccessFramework
// and documentDirectory are only on that entry point.
import * as FileSystem from 'expo-file-system/legacy'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

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
  const [exporting,  setExporting]  = useState(false)

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

  // Fetches the export and hands it to the OS share sheet. Writing it to app storage
  // and calling that a download would leave the file somewhere the person cannot get
  // at it, which is not a portable copy in any meaningful sense.
  async function handleExport() {
    setExporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { Alert.alert('Please sign in again.'); return }
      const res = await fetch(`${API_URL}/api/account/export`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        Alert.alert('Could not export', b?.error ?? 'Please try again.')
        return
      }
      const text = await res.text()
      const name = `queue-my-data-${new Date().toISOString().slice(0, 10)}.json`

      // Storage Access Framework rather than expo-sharing: sharing is a native
      // module this project does not have, and adding one would force a fresh
      // native build of every app before the feature worked at all. SAF ships with
      // expo-file-system, which is already a dependency, and it writes where the
      // person chooses -- a copy they actually keep, which is the whole point of a
      // portability right.
      if (Platform.OS === 'android') {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
        if (!perm.granted) { Alert.alert('Export cancelled', 'No folder was chosen.'); return }
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(
          perm.directoryUri, name, 'application/json',
        )
        await FileSystem.writeAsStringAsync(uri, text)
        Alert.alert('Saved', `Your data was saved as ${name}.`)
      } else {
        const path = `${FileSystem.documentDirectory}${name}`
        await FileSystem.writeAsStringAsync(path, text)
        await Share.share({ url: path, title: 'Your Queue data' })
      }
    } catch (e) {
      Alert.alert('Could not export', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and cancels all pending appointments. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession()
          const jwt = session?.access_token
          if (!jwt) return
          const ok = await deleteAccount(API_URL, jwt)
          if (ok) { await signOut() }
          else { Alert.alert('Error', 'Could not delete account. Please contact support.') }
        }},
      ],
    )
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={t.textMuted} />
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Privacy & Security</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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
          <View style={[s.verifiedBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Ionicons name="checkmark-circle" size={11} color={t.accent} />
            <Text style={[s.verifiedText, { color: t.accent }]}>Verified</Text>
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

          <Button label="Update password" onPress={handleChangePassword} loading={saving} />
        </View>

        {/* MM12: Privacy preference toggles removed — they were static decorations with no backing state */}

        {/* What we keep, and for how long. NDPR asks for a stated retention period;
            stating it only in a policy document nobody opens is not stating it. The
            wording comes from shared/lib/privacy so this screen, the export file and
            the signup consent cannot drift apart. */}
        <Text style={[s.sectionTitle, { color: t.textMuted }]}>Your data</Text>
        <View style={{ gap: 12, marginBottom: 18 }}>
          {RETENTION_SUMMARY.map(r => (
            <View key={r.title}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.textPrimary, marginBottom: 2 }}>{r.title}</Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: t.textSecondary }}>{r.body}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 11, color: t.textFaint }}>Policy version {POLICY_VERSION}</Text>
        </View>

        <Button
          label={exporting ? 'Preparing…' : 'Download my data'}
          onPress={handleExport}
          loading={exporting}
          variant="outline"
          icon="download-outline"
        />

        {/* Danger zone */}
        <Text style={[s.sectionTitle, { color: t.textMuted, marginTop: 20 }]}>Account</Text>
        {/* MH8: navigation.goBack() removed — session becoming null drives navigation automatically */}
        <Button label="Sign out of all devices" onPress={() => signOut()} variant="danger" icon="log-out-outline" />
        <TouchableOpacity onPress={handleDeleteAccount} style={[s.dangerBtn, { borderColor: 'rgba(255,92,92,0.2)', backgroundColor: 'transparent', marginTop: 6 }]}>
          <Ionicons name="trash-outline" size={16} color="rgba(255,92,92,0.8)" />
          <Text style={[s.dangerBtnText, { color: t.textMuted }]}>Delete my account</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:             { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  back:             { fontSize: 25 },
  title:            { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  accountCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 20, borderWidth: 1 },
  accountAvatar:    { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  accountAvatarText:{ fontSize: 18, fontWeight: '800' },
  accountName:      { fontSize: 16, fontWeight: '700' },
  accountEmail:     { fontSize: 13, marginTop: 2 },
  verifiedBadge:    { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  verifiedText:     { fontSize: 12, fontWeight: '700' },
  sectionTitle:     { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  card:             { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
  fieldWrap:        { marginBottom: 12 },
  fieldLabel:       { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:            { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  errorText:        { color: '#F87171', fontSize: 14, marginBottom: 8 },
  successText:      { color: '#4ADE80', fontSize: 14, marginBottom: 8 },
  dangerBtn:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 13, borderWidth: 1 },
  dangerBtnText:    { fontSize: 15, fontWeight: '600' },
})
