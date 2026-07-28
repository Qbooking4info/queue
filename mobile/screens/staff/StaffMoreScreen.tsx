import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'

const ROLE_LABEL: Record<string, string> = {
  front_desk: 'Front Desk', clinic_admin: 'Clinic Admin', hospital_admin: 'Hospital Admin',
}

interface Props { navigation: any }

export function StaffMoreScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { staffProfile, setStaffMode, signOut } = useAuth()
  const [hospitalName,   setHospitalName]   = useState<string | null>(null)
  const [signingOut,     setSigningOut]      = useState(false)
  const [confirmVisible, setConfirmVisible]  = useState(false)

  const isAdmin = staffProfile?.role === 'hospital_admin'
  const initials = staffProfile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    if (!staffProfile?.hospitalId) return
    ;supabase
      .from('hospitals').select('name').eq('id', staffProfile.hospitalId).single()
      .then(({ data }: { data: { name: string } | null }) => { if (data) setHospitalName(data.name) })
  }, [staffProfile?.hospitalId])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  const menuItems = [
    ...(isAdmin ? [
      { icon: 'analytics-outline', label: 'Analytics', onPress: () => navigation.navigate('StaffAnalytics') },
      { icon: 'people-outline', label: 'Staff Management', onPress: () => navigation.navigate('StaffManagement') },
      { icon: 'settings-outline', label: 'Hospital Settings', onPress: () => navigation.navigate('HospitalSettings') },
    ] : []),
  ]

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
        <Text style={[s.title, { color: t.textPrimary }]}>More</Text>

        {/* Profile card */}
        <View style={[s.profileCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={[s.avatar, { backgroundColor: `${t.accent}20`, borderColor: `${t.accent}40` }]}>
            <Text style={[s.avatarText, { color: t.accent }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.profileName, { color: t.textPrimary }]}>{staffProfile?.name ?? '—'}</Text>
            <View style={[s.roleBadge, { backgroundColor: `${t.accent}18`, borderColor: `${t.accent}30` }]}>
              <Text style={[s.roleText, { color: t.accent }]}>{ROLE_LABEL[staffProfile?.role ?? ''] ?? 'Staff'}</Text>
            </View>
            {hospitalName && <Text style={[s.hospitalText, { color: t.textMuted }]}>{hospitalName}</Text>}
          </View>
        </View>

        {/* Menu items */}
        {menuItems.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: t.textMuted }]}>MANAGEMENT</Text>
            <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              {menuItems.map((item, i) => (
                <TouchableOpacity key={item.label} onPress={() => { haptics.tap(); item.onPress() }}
                  style={[s.menuRow, { borderBottomColor: t.cardBorder, borderBottomWidth: i < menuItems.length - 1 ? 1 : 0 }]}>
                  <View style={[s.menuIcon, { backgroundColor: `${t.accent}12` }]}>
                    <Ionicons name={item.icon as any} size={18} color={t.accent} />
                  </View>
                  <Text style={[s.menuLabel, { color: t.textPrimary }]}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Switch to patient mode */}
        <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 16 }]}>ACCOUNT</Text>
        <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <TouchableOpacity onPress={() => { haptics.tap(); setStaffMode(false) }}
            style={[s.menuRow, { borderBottomColor: t.cardBorder, borderBottomWidth: 1 }]}>
            <View style={[s.menuIcon, { backgroundColor: 'rgba(91,158,255,0.12)' }]}>
              <Ionicons name="swap-horizontal-outline" size={18} color="#5B9EFF" />
            </View>
            <Text style={[s.menuLabel, { color: t.textPrimary }]}>Switch to Patient Mode</Text>
            <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
          </TouchableOpacity>

          {/* Theme toggle */}
          <View style={[s.menuRow, { borderBottomColor: t.cardBorder, borderBottomWidth: 1 }]}>
            <View style={[s.menuIcon, { backgroundColor: `${t.accent}12` }]}>
              <Ionicons name={themeId === 'forest' ? 'moon-outline' : 'sunny-outline'} size={18} color={t.accent} />
            </View>
            <Text style={[s.menuLabel, { color: t.textPrimary }]}>{themeId === 'forest' ? 'Dark theme' : 'Light theme'}</Text>
            <Switch value={themeId === 'forest'} onValueChange={toggleTheme}
              trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>

          {/* Sign out */}
          {confirmVisible ? (
            <View style={{ padding: 12 }}>
              <Text style={[{ color: t.textMuted, fontSize: 13, marginBottom: 10, textAlign: 'center' }]}>Sign out of your account?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => setConfirmVisible(false)} style={[s.confirmBtn, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
                  <Text style={{ color: t.textPrimary, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { haptics.tap(); handleSignOut() }} disabled={signingOut}
                  style={[s.confirmBtn, { borderColor: 'rgba(255,92,92,0.4)', backgroundColor: 'rgba(255,92,92,0.1)', flex: 1 }]}>
                  {signingOut ? <ActivityIndicator size="small" color="#FF5C5C" /> : <Text style={{ color: '#FF5C5C', fontWeight: '700' }}>Sign out</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setConfirmVisible(true)} style={s.menuRow}>
              <View style={[s.menuIcon, { backgroundColor: 'rgba(255,92,92,0.1)' }]}>
                <Ionicons name="log-out-outline" size={18} color="#FF5C5C" />
              </View>
              <Text style={[s.menuLabel, { color: '#FF5C5C' }]}>Sign out</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  title:       { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, borderRadius: 18, padding: 16, borderWidth: 1, marginBottom: 20 },
  avatar:      { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 18, fontWeight: '800' },
  profileName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  roleBadge:   { marginTop: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, borderWidth: 1, alignSelf: 'flex-start' },
  roleText:    { fontSize: 11, fontWeight: '700' },
  hospitalText: { fontSize: 11, marginTop: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 8 },
  section:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginHorizontal: 16, marginBottom: 12 },
  menuRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  menuIcon:    { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel:   { flex: 1, fontSize: 14, fontWeight: '600' },
  confirmBtn:  { flex: 1, borderRadius: 10, padding: 11, alignItems: 'center', borderWidth: 1 },
})
