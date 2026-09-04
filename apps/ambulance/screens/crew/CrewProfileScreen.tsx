import { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'

const ROLE_LABEL: Record<string, string> = {
  driver:     'Driver',
  emt:        'EMT',
  paramedic:  'Paramedic',
  nurse:      'Nurse',
  doctor:     'Doctor',
  dispatcher: 'Dispatcher',
}

export function CrewProfileScreen() {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { crewProfile, staffProfile, user, signOut } = useAuth()
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut,     setSigningOut]     = useState(false)
  const [hospitalName,   setHospitalName]   = useState<string | null>(null)

  // Hospital-fleet crew resolve through staffProfile, not crewProfile (that's
  // third-party only) — same organisation display either way, different source.
  const isHospitalFleet = !crewProfile && staffProfile?.role === 'ambulance_crew'
  const crewRole = crewProfile?.crewRole ?? staffProfile?.crewRole
  const crewTier = crewProfile?.crewTier ?? staffProfile?.crewTier

  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    if (!isHospitalFleet || !staffProfile?.hospitalId) return
    supabase.from('hospitals').select('name').eq('id', staffProfile.hospitalId).single()
      .then(({ data }: { data: { name: string } | null }) => { if (data) setHospitalName(data.name) })
  }, [isHospitalFleet, staffProfile?.hospitalId])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.title, { color: t.textPrimary }]}>Profile</Text>

        <View style={[s.profileCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={[s.avatar, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={[s.avatarText, { color: t.accent }]}>{initials}</Text>
          </View>
          <Text style={[s.name, { color: t.textPrimary }]}>{user?.full_name ?? '—'}</Text>
          <View style={[s.roleBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={[s.roleBadgeText, { color: t.accent }]}>
              {ROLE_LABEL[crewRole ?? ''] ?? crewRole ?? 'Crew'}
            </Text>
          </View>
          {(crewProfile?.providerName ?? hospitalName) && (
            <Text style={[s.providerName, { color: t.textMuted }]}>{crewProfile?.providerName ?? hospitalName}</Text>
          )}
        </View>

        <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>DETAILS</Text>
          <Row label="Care tier"  value={crewTier ?? '—'} theme={t} />
          <Row label="Phone"     value={user?.phone ?? '—'} theme={t} last />
        </View>

        <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>SETTINGS</Text>
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>
              {themeId === 'forest' ? 'Dark theme' : 'Light theme'}
            </Text>
            <Switch value={themeId === 'forest'} onValueChange={toggleTheme}
              trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        </View>

        {confirmVisible ? (
          <View style={[s.section, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
            <Text style={[s.sectionTitle, { color: t.danger, borderBottomColor: 'rgba(255,92,92,0.15)' }]}>CONFIRM SIGN OUT</Text>
            <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
              <Button label="Cancel" onPress={() => setConfirmVisible(false)} variant="outline" style={{ flex: 1 }} />
              <Button
                label="Sign out" onPress={() => { haptics.tap(); handleSignOut() }}
                loading={signingOut} variant="danger" style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Button label="Sign out" onPress={() => setConfirmVisible(true)} variant="danger" style={{ marginHorizontal: 16 }} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({ label, value, theme: t, last }: { label: string; value: string; theme: any; last?: boolean }) {
  return (
    <View style={[s.row, { borderBottomColor: t.cardBorder, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
      <Text style={[s.rowLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[s.rowValue, { color: t.textPrimary }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  title:         { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  profileCard:   { marginHorizontal: 16, borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, marginBottom: 12 },
  avatar:        { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 12 },
  avatarText:    { fontSize: 26, fontWeight: '800' },
  name:          { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  roleBadge:     { marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  providerName:  { marginTop: 8, fontSize: 13, fontWeight: '600' },
  section:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginHorizontal: 16, marginBottom: 12 },
  sectionTitle:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14 },
  rowLabel:      { fontSize: 13 },
  rowValue:      { fontSize: 13, fontWeight: '600' },
})
