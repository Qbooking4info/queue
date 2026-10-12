import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'
import { ProfileCard } from '@queue/shared/components/ui/ProfileCard'
import { Glass } from '@queue/shared/components/ui/Glass'
import { Pill } from '@queue/shared/components/ui/DataViz'

interface Props { navigation: any }

export function AdminProfileScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme, mode, toggleMode } = useTheme()
  const { providerAdminProfile, user, signOut } = useAuth()
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const isHospitalFleet = providerAdminProfile?.providerType === 'hospital_fleet'
  const orgName = providerAdminProfile?.providerName
  const roleLabel = providerAdminProfile?.role === 'owner'
    ? (isHospitalFleet ? 'Hospital fleet owner' : 'Owner')
    : (isHospitalFleet ? 'Hospital fleet admin' : 'Admin')

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.title, { color: t.textPrimary }]}>Profile</Text>

        <ProfileCard
          name={user?.full_name ?? '—'}
          sub={orgName}
          badge={<Pill label={roleLabel} tone="statusOpen" />}
          style={{ marginHorizontal: 16, marginBottom: 12 }}
        />

        <Glass radius={22} pad={0} style={{ marginHorizontal: 16, marginBottom: 12, overflow: 'hidden' }}>
          <TouchableOpacity onPress={() => navigation.navigate('ProviderSettings')} style={s.linkRow}>
            <Ionicons name="options-outline" size={16} color={t.textPrimary} />
            <Text style={[s.linkText, { color: t.textPrimary }]}>Service settings</Text>
            <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
          </TouchableOpacity>
        </Glass>

        <Glass radius={22} pad={0} style={{ marginHorizontal: 16, marginBottom: 12, overflow: 'hidden' }}>
          <View style={[s.row, { borderBottomColor: t.cardBorder, borderBottomWidth: 1 }]}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>
              {themeId === 'forest' ? 'Teal' : 'Clinical'} theme
            </Text>
            <Switch value={themeId === 'clinical'} onValueChange={toggleTheme} trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>
              {mode === 'dark' ? 'Dark' : 'Light'} mode
            </Text>
            <Switch value={mode === 'dark'} onValueChange={toggleMode} trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        </Glass>

        {confirmVisible ? (
          <View style={[s.section, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
            <Text style={[s.sectionTitle, { color: t.danger, borderBottomColor: 'rgba(255,92,92,0.15)' }]}>CONFIRM SIGN OUT</Text>
            <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
              <Button label="Cancel" onPress={() => setConfirmVisible(false)} variant="outline" style={{ flex: 1 }} />
              <Button label="Sign out" onPress={() => { haptics.tap(); handleSignOut() }} loading={signingOut} variant="danger" style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button label="Sign out" onPress={() => setConfirmVisible(true)} variant="danger" style={{ marginHorizontal: 16 }} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  title:         { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  profileCard:   { marginHorizontal: 16, borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, marginBottom: 12 },
  name:          { fontSize: 23, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  roleBadge:     { marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  roleBadgeText: { fontSize: 14, fontWeight: '700' },
  orgName:       { marginTop: 8, fontSize: 15, fontWeight: '600' },
  section:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginHorizontal: 16, marginBottom: 12 },
  sectionTitle:  { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14 },
  rowLabel:      { fontSize: 15 },
  linkRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  linkText:      { fontSize: 15, fontWeight: '600', flex: 1 },
})
