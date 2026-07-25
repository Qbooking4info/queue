import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Clipboard } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { haptics } from '../lib/haptics'

interface Props { navigation?: any }

export function ProfileScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { user, signOut }                  = useAuth()
  const [signingOut, setSigningOut]         = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [idCopied, setIdCopied]             = useState(false)

  const patientNumber = (user as any)?.patient_number ?? null

  function copyPatientId() {
    if (!patientNumber) return
    Clipboard.setString(patientNumber)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 2000)
  }

  const initials = user?.full_name
    ?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
    setConfirmVisible(false)
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 20 }}>
        <Text style={[styles.title, { color: t.textPrimary }]}>Profile</Text>

        {/* Avatar & info */}
        <View style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={[styles.avatarText, { color: t.accent }]}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: t.textPrimary }]}>{user?.full_name ?? '—'}</Text>
          <Text style={[styles.email, { color: t.textMuted }]}>{user?.email ?? '—'}</Text>

          {/* Patient Number — copyable */}
          {patientNumber && (
            <TouchableOpacity onPress={copyPatientId} activeOpacity={0.7}
              style={[styles.patientIdRow, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
              <Text style={[styles.patientIdLabel, { color: t.accent }]}>Patient No.</Text>
              <Text style={[styles.patientIdValue, { color: t.accent }]}>{patientNumber}</Text>
              {idCopied ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="checkmark" size={11} color={t.accent} />
                  <Text style={[styles.patientIdCopy, { color: t.accent }]}>Copied</Text>
                </View>
              ) : (
                <Ionicons name="copy-outline" size={13} color={t.textMuted} />
              )}
            </TouchableOpacity>
          )}

          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
              <Text style={[styles.badgeText, { color: t.accent }]}>
                {user?.is_verified ? 'Verified Patient' : 'Unverified'}
              </Text>
            </View>
            {!!user?.city && (
              <View style={[styles.badge, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                <Text style={[styles.badgeText, { color: t.textMuted }]}>{user.city}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Theme toggle */}
        <View style={[styles.themeRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Ionicons name={themeId === 'forest' ? 'leaf-outline' : 'medical-outline'} size={18} color={t.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.themeLabel, { color: t.textPrimary }]}>{themeId === 'forest' ? 'Forest' : 'Clinical'} Theme</Text>
            <Text style={[styles.themeSub, { color: t.textMuted }]}>Tap to switch theme</Text>
          </View>
          <Switch value={themeId === 'clinical'} onValueChange={toggleTheme}
            trackColor={{ false: t.accentBg, true: t.accentBg }}
            thumbColor={t.accent} />
        </View>

        {/* Health profile */}
        {(user?.blood_group || user?.date_of_birth) && (
          <View style={[styles.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Health profile</Text>
            {[
              user?.blood_group   && { label: 'Blood group', value: user.blood_group },
              user?.gender        && { label: 'Gender',      value: user.gender },
              user?.date_of_birth && { label: 'Date of birth', value: user.date_of_birth },
            ].filter(Boolean).map(i => i && (
              <View key={i.label} style={[styles.infoRow, { borderBottomColor: t.cardBorder }]}>
                <Text style={[styles.infoLabel, { color: t.textMuted }]}>{i.label}</Text>
                <Text style={[styles.infoValue, { color: t.textPrimary }]}>{i.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Menu */}
        {[
          { icon: 'medical-outline' as const,            label: 'Medical history',             sub: 'Consultations, conditions & allergies',   onPress: () => { haptics.tap(); navigation?.navigate('MedicalHistory') } },
          { icon: 'document-text-outline' as const,      label: 'Prescriptions & lab results', sub: 'Medications and diagnostic reports',       onPress: () => { haptics.tap(); navigation?.navigate('Prescriptions') } },
          { icon: 'shield-checkmark-outline' as const,   label: 'Insurance',                   sub: 'Manage your health insurance details',     onPress: () => { haptics.tap(); navigation?.navigate('Insurance') } },
          { icon: 'people-outline' as const,             label: 'Manage dependents',           sub: 'Book for family members',                  onPress: () => { haptics.tap(); navigation?.navigate('Dependents') } },
          { icon: 'notifications-outline' as const,      label: 'Notifications',               sub: 'Alerts, reminders & updates',             onPress: () => { haptics.tap(); navigation?.navigate('Notifications') } },
          { icon: 'lock-closed-outline' as const,        label: 'Privacy & security',          sub: 'Password, data & account settings',       onPress: () => { haptics.tap(); navigation?.navigate('PrivacySecurity') } },
          { icon: 'chatbubbles-outline' as const,        label: 'Support & queries',           sub: 'FAQs, live chat & contact us',            onPress: () => { haptics.tap(); navigation?.navigate('Support') } },
        ].map(item => (
          <TouchableOpacity key={item.label} onPress={item.onPress}
            style={[styles.menuItem, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Ionicons name={item.icon} size={18} color={t.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: t.textPrimary }]}>{item.label}</Text>
              <Text style={[styles.menuSub, { color: t.textMuted }]}>{item.sub}</Text>
            </View>
            <Text style={[styles.menuArrow, { color: t.textMuted }]}>›</Text>
          </TouchableOpacity>
        ))}

        {/* Sign out */}
        {!confirmVisible ? (
          <TouchableOpacity onPress={() => { haptics.tap(); setConfirmVisible(true) }}
            style={[styles.signOutBtn, { backgroundColor: '#3B1111', borderColor: '#7B2020' }]}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.confirmBox, { backgroundColor: '#3B1111', borderColor: '#7B2020' }]}>
            <Text style={styles.confirmText}>Sign out of your account?</Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity onPress={() => setConfirmVisible(false)}
                style={[styles.confirmBtn, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { haptics.heavy(); handleSignOut() }} disabled={signingOut}
                style={[styles.confirmBtn, { backgroundColor: '#7B2020', borderColor: '#A32D2D', opacity: signingOut ? 0.6 : 1 }]}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  {signingOut ? 'Signing out…' : 'Yes, sign out'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.8, paddingTop: 16, marginBottom: 16 },
  profileCard: { alignItems: 'center', marginBottom: 16 },
  avatar:      { width: 70, height: 70, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 10 },
  avatarText:  { fontSize: 22, fontWeight: '800' },
  name:        { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  email:       { fontSize: 12, marginTop: 3 },
  patientIdRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
  patientIdLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, opacity: 0.6 },
  patientIdValue: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  patientIdCopy:  { fontSize: 10, fontWeight: '600', marginLeft: 4 },
  badges:         { flexDirection: 'row', gap: 6, marginTop: 8 },
  badge:       { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  badgeText:   { fontSize: 10, fontWeight: '700' },
  themeRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1 },
  themeLabel:  { fontSize: 14, fontWeight: '600' },
  themeSub:    { fontSize: 11, marginTop: 1 },
  section:     { borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 1 },
  sectionTitle:{ padding: 10, paddingHorizontal: 14, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, borderBottomWidth: 1 },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 9, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  infoLabel:   { fontSize: 12, flexShrink: 0 },
  infoValue:   { fontSize: 12, fontWeight: '500', textAlign: 'right', flex: 1 },
  menuItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, paddingHorizontal: 14, marginBottom: 7, borderWidth: 1 },
  menuLabel:   { fontSize: 13, fontWeight: '600' },
  menuSub:     { fontSize: 11, marginTop: 1 },
  menuArrow:   { fontSize: 18 },
  signOutBtn:  { borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8, marginBottom: 4, borderWidth: 1 },
  signOutText: { color: '#F87171', fontSize: 14, fontWeight: '700' },
  confirmBox:  { borderRadius: 14, padding: 16, marginTop: 8, marginBottom: 4, borderWidth: 1 },
  confirmText: { color: '#F87171', fontSize: 14, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  confirmRow:  { flexDirection: 'row', gap: 8 },
  confirmBtn:  { flex: 1, padding: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
})
