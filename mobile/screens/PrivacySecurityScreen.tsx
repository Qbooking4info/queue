import { useState } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Linking } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

export function PrivacySecurityScreen({ navigation }: { navigation: any }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw, setSavingPw]               = useState(false)
  const [pwError, setPwError]                 = useState('')
  const [pwSuccess, setPwSuccess]             = useState(false)

  async function handleChangePassword() {
    setPwError(''); setPwSuccess(false)
    if (!currentPassword) { setPwError('Please enter your current password.'); return }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }

    setSavingPw(true)

    // Re-authenticate with current password first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setSavingPw(false); setPwError('Session expired. Please sign in again.'); return }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (signInErr) {
      setSavingPw(false)
      setPwError('Current password is incorrect.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPw(false)
    if (error) {
      setPwError(error.message)
    } else {
      setPwSuccess(true)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Contact Support', style: 'destructive', onPress: () =>
          Linking.openURL('mailto:support@qbooking.health?subject=Delete%20Account%20Request')
        },
      ]
    )
  }

  const securityItems = [
    {
      icon: '🔐',
      label: 'Two-Factor Authentication',
      sub: 'Coming soon',
      onPress: () => Alert.alert('Two-Factor Authentication', 'Two-factor authentication is coming soon. Your account is protected by your password.'),
    },
    {
      icon: '📱',
      label: 'Trusted Devices',
      sub: 'Manage devices that have access',
      onPress: () => Alert.alert('Trusted Devices', 'Device management is coming soon.'),
    },
    {
      icon: '🕑',
      label: 'Login Activity',
      sub: 'See recent sign-in history',
      onPress: () => Alert.alert('Login Activity', 'Sign-in history is coming soon.'),
    },
  ]

  const privacyItems = [
    {
      icon: '📋',
      label: 'Terms of Service',
      onPress: () => Linking.openURL('https://qbooking.health/terms'),
    },
    {
      icon: '🔏',
      label: 'Privacy Policy',
      onPress: () => Linking.openURL('https://qbooking.health/privacy'),
    },
    {
      icon: '📤',
      label: 'Export My Data',
      onPress: () => Alert.alert('Export Data', 'Data export is coming soon. Contact support@qbooking.health to request your data.'),
    },
  ]

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacy & Security</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Change Password */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Password</Text>

          <Text style={styles.label}>Current Password</Text>
          <TextInput
            value={currentPassword}
            onChangeText={val => { setCurrentPassword(val); setPwError(''); setPwSuccess(false) }}
            placeholder="Your current password"
            placeholderTextColor={t.textMuted}
            secureTextEntry
            style={styles.input}
          />

          <Text style={styles.label}>New Password</Text>
          <TextInput
            value={newPassword}
            onChangeText={val => { setNewPassword(val); setPwError(''); setPwSuccess(false) }}
            placeholder="Min. 8 characters"
            placeholderTextColor={t.textMuted}
            secureTextEntry
            style={styles.input}
          />

          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={val => { setConfirmPassword(val); setPwError(''); setPwSuccess(false) }}
            placeholder="Repeat new password"
            placeholderTextColor={t.textMuted}
            secureTextEntry
            style={styles.input}
          />

          {pwError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{pwError}</Text>
            </View>
          ) : null}

          {pwSuccess ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✓ Password updated successfully</Text>
            </View>
          ) : null}

          <TouchableOpacity onPress={handleChangePassword} disabled={savingPw} style={[styles.saveBtn, savingPw && { opacity: 0.6 }]}>
            <Text style={styles.saveBtnText}>{savingPw ? 'Updating…' : 'Update Password'}</Text>
          </TouchableOpacity>
        </View>

        {/* Account Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Security</Text>
          {securityItems.map(item => (
            <TouchableOpacity key={item.label} style={styles.row} activeOpacity={0.7} onPress={item.onPress}>
              <Text style={{ fontSize: 20 }}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowSub}>{item.sub}</Text>
              </View>
              <Text style={{ color: t.textMuted, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          {privacyItems.map(item => (
            <TouchableOpacity key={item.label} style={styles.row} activeOpacity={0.7} onPress={item.onPress}>
              <Text style={{ fontSize: 20 }}>{item.icon}</Text>
              <Text style={[styles.rowLabel, { flex: 1 }]}>{item.label}</Text>
              <Text style={{ color: t.textMuted, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: t.bg },
  header:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  scroll:       { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  section:      { marginBottom: spacing.xl },
  sectionTitle: { fontSize: font.xs, fontWeight: '700', color: t.textSub, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.md },
  label:        { fontSize: font.xs, fontWeight: '600', color: t.textSub, marginBottom: 6, marginTop: spacing.sm },
  input:        { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderMed, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, fontSize: font.base, color: t.text, marginBottom: spacing.sm },
  errorBox:     { backgroundColor: 'rgba(255,92,92,0.08)', borderWidth: 1, borderColor: 'rgba(255,92,92,0.2)', borderRadius: radius.md, padding: 10, marginBottom: spacing.sm },
  errorText:    { fontSize: font.xs, color: '#FF5C5C' },
  successBox:   { backgroundColor: 'rgba(0,232,122,0.08)', borderWidth: 1, borderColor: 'rgba(0,232,122,0.2)', borderRadius: radius.md, padding: 10, marginBottom: spacing.sm },
  successText:  { fontSize: font.xs, color: t.accent },
  saveBtn:      { backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  saveBtnText:  { fontSize: font.base, fontWeight: '800', color: '#060A07' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, marginBottom: spacing.sm },
  rowLabel:     { fontSize: font.base, fontWeight: '600', color: t.text },
  rowSub:       { fontSize: 11, color: t.textSub, marginTop: 1 },
  dangerSection:{ marginBottom: spacing.xl },
  deleteBtn:    { paddingVertical: 14, alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: '#FF5C5C33', backgroundColor: 'rgba(255,92,92,0.06)' },
  deleteBtnText:{ fontSize: font.base, fontWeight: '700', color: '#FF5C5C' },
})
