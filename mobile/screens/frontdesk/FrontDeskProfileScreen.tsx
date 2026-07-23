import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'

interface Props { navigation?: any }

const ROLE_LABEL: Record<string, string> = {
  front_desk:      'Front Desk',
  clinic_admin:    'Clinic Administrator',
  hospital_admin:  'Hospital Administrator',
}

export function FrontDeskProfileScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { staffProfile, signOut }          = useAuth()
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut,     setSigningOut]     = useState(false)
  const [hospitalName,   setHospitalName]   = useState<string | null>(null)

  const initials = staffProfile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    if (!staffProfile?.hospitalId) return
    ;(supabase as any)
      .from('hospitals')
      .select('name')
      .eq('id', staffProfile.hospitalId)
      .single()
      .then(({ data }: { data: { name: string } | null }) => {
        if (data) setHospitalName(data.name)
      })
  }, [staffProfile?.hospitalId])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.title, { color: t.textPrimary }]}>Profile</Text>

        {/* Staff card */}
        <View style={[s.profileCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={[s.avatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={[s.avatarText, { color: t.accent }]}>{initials}</Text>
          </View>
          <Text style={[s.name, { color: t.textPrimary }]}>{staffProfile?.name ?? '—'}</Text>
          <View style={[s.roleBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={[s.roleBadgeText, { color: t.accent }]}>{ROLE_LABEL[staffProfile?.role ?? ''] ?? staffProfile?.role ?? 'Staff'}</Text>
          </View>
          {hospitalName && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="business-outline" size={12} color={t.textMuted} /><Text style={[s.hospitalName, { color: t.textMuted }]}>{hospitalName}</Text></View>
          )}
        </View>

        {/* Info */}
        <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>DETAILS</Text>
          <Row label="Role"     value={ROLE_LABEL[staffProfile?.role ?? ''] ?? '—'} theme={t} />
          {staffProfile?.clinicId && <Row label="Assigned clinic" value={staffProfile.clinicId} theme={t} />}
        </View>

        {/* Settings */}
        <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>SETTINGS</Text>
          <View style={[s.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>
              {themeId === 'forest' ? '🌙 Dark theme' : '☀️ Light theme'}
            </Text>
            <Switch value={themeId === 'forest'} onValueChange={toggleTheme}
              trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        </View>

        {/* Sign out */}
        {confirmVisible ? (
          <View style={[s.section, { backgroundColor: 'rgba(255,92,92,0.07)', borderColor: 'rgba(255,92,92,0.25)' }]}>
            <Text style={[s.sectionTitle, { color: '#FF5C5C', borderBottomColor: 'rgba(255,92,92,0.15)' }]}>CONFIRM SIGN OUT</Text>
            <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg }]}
                onPress={() => setConfirmVisible(false)}>
                <Text style={{ color: t.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { flex: 1, borderColor: 'rgba(255,92,92,0.4)', backgroundColor: 'rgba(255,92,92,0.1)' }]}
                onPress={() => { haptics.tap(); handleSignOut() }}
                disabled={signingOut}
              >
                {signingOut
                  ? <ActivityIndicator size="small" color="#FF5C5C" />
                  : <Text style={{ color: '#FF5C5C', fontWeight: '700' }}>Sign out</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={[s.signOutBtn, { borderColor: 'rgba(255,92,92,0.3)' }]}
            onPress={() => setConfirmVisible(true)}>
            <Text style={s.signOutTxt}>Sign out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({ label, value, theme: t }: { label: string; value: string; theme: any }) {
  return (
    <View style={[s.row, { borderBottomColor: t.cardBorder }]}>
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
  hospitalName:  { marginTop: 8, fontSize: 13, fontWeight: '600' },
  section:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginHorizontal: 16, marginBottom: 12 },
  sectionTitle:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14, borderBottomWidth: 1 },
  rowLabel:      { fontSize: 13 },
  rowValue:      { fontSize: 13, fontWeight: '600' },
  actionBtn:     { padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  signOutBtn:    { borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, backgroundColor: 'rgba(255,92,92,0.06)', marginHorizontal: 16 },
  signOutTxt:    { fontSize: 14, fontWeight: '700', color: '#FF5C5C' },
})
