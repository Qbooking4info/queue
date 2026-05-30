import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'
import type { User } from '../types/database'

const menuItems = [
  { icon: '🩺', label: 'Medical History',            sub: 'View your past diagnoses and notes' },
  { icon: '📄', label: 'Prescriptions & Lab Results', sub: 'Access your uploaded documents' },
  { icon: '👨‍👩‍👧', label: 'Manage Dependents',          sub: 'Book appointments for family members' },
  { icon: '🛡️', label: 'Insurance Details',            sub: 'Link your HMO or insurance card' },
  { icon: '🔔', label: 'Notifications',                sub: 'Reminders, updates, and alerts' },
  { icon: '🔐', label: 'Privacy & Security',           sub: 'Password, data, and account settings' },
]

const stats = [
  { icon: '📋', label: 'Total Bookings',    key: 'bookings' },
  { icon: '💻', label: 'Virtual Consults',  key: 'virtual'  },
  { icon: '🏥', label: 'Hospitals Used',    key: 'hospitals' },
  { icon: '⭐', label: 'Reviews Left',      key: 'reviews'  },
]

export function ProfileScreen({ navigation }: { navigation: any }) {
  const [user, setUser]     = useState<User | null>(null)
  const [counts, setCounts] = useState({ bookings: 0, virtual: 0, hospitals: 0, reviews: 0 })

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: profile } = await supabase.from('users').select('*').eq('auth_id', authUser.id).single()
      if (!profile) return
      setUser(profile as User)

      const [{ count: bookings }, { count: virtual }, { data: apptHospitals }, { count: reviews }] = await Promise.all([
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('patient_id', profile.id),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('patient_id', profile.id).eq('type', 'virtual'),
        supabase.from('appointments').select('hospital_id').eq('patient_id', profile.id),
        supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('patient_id', profile.id),
      ])
      const uniqueHospitals = new Set((apptHospitals ?? []).map((a: { hospital_id: string }) => a.hospital_id)).size
      setCounts({ bookings: bookings ?? 0, virtual: virtual ?? 0, hospitals: uniqueHospitals, reviews: reviews ?? 0 })
    }
    load()
  }, [])

  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <Text style={styles.name}>{user?.full_name ?? 'Loading…'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.is_verified && (
            <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✓ Verified Patient</Text></View>
          )}
        </View>

        <View style={styles.statsGrid}>
          {stats.map(s => (
            <View key={s.key} style={styles.statCard}>
              <Text style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</Text>
              <Text style={styles.statValue}>{counts[s.key as keyof typeof counts]}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.menu}>
          {menuItems.map(item => (
            <TouchableOpacity key={item.label} style={styles.menuItem} activeOpacity={0.7}>
              <Text style={{ fontSize: 20 }}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSub}>{item.sub}</Text>
              </View>
              <Text style={{ color: t.textMuted, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: t.bg },
  scroll:       { flex: 1, paddingHorizontal: spacing.xl },
  avatarSection:{ alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xl },
  avatar:       { width: 72, height: 72, borderRadius: 22, backgroundColor: t.accentMuted, borderWidth: 2, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:   { fontSize: 22, fontWeight: '800', color: t.accent },
  name:         { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  email:        { fontSize: font.sm, color: t.textSub, marginTop: 3 },
  verifiedBadge:{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: t.accentBorder, backgroundColor: t.accentMuted },
  verifiedText: { fontSize: 11, fontWeight: '700', color: t.accent },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  statCard:     { flex: 1, minWidth: '45%', backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center' },
  statValue:    { fontSize: font.xxl, fontWeight: '800', color: t.text },
  statLabel:    { fontSize: 10, color: t.textSub, marginTop: 2, textAlign: 'center' },
  menu:         { marginBottom: spacing.xl },
  menuItem:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, marginBottom: spacing.sm },
  menuLabel:    { fontSize: font.base, fontWeight: '600', color: t.text },
  menuSub:      { fontSize: 11, color: t.textSub, marginTop: 1 },
  signOutBtn:   { paddingVertical: 14, alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: '#FF5C5C33', backgroundColor: 'rgba(255,92,92,0.06)' },
  signOutText:  { fontSize: font.base, fontWeight: '700', color: '#FF5C5C' },
})
