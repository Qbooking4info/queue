import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Switch } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { patientProfile as p } from '../data'

export function ProfileScreen() {
  const { theme: t, themeId, toggleTheme } = useTheme()

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 20 }}>
        <Text style={[styles.title, { color: t.textPrimary }]}>Profile</Text>

        {/* Avatar & info */}
        <View style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={[styles.avatarText, { color: t.accent }]}>{p.initials}</Text>
          </View>
          <Text style={[styles.name, { color: t.textPrimary }]}>{p.name}</Text>
          <Text style={[styles.email, { color: t.textMuted }]}>{p.email}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
              <Text style={[styles.badgeText, { color: t.accent }]}>Verified Patient</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
              <Text style={[styles.badgeText, { color: t.textMuted }]}>Lagos Island</Text>
            </View>
          </View>
        </View>

        {/* Theme toggle */}
        <View style={[styles.themeRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={{ fontSize: 16 }}>{themeId === 'forest' ? '🌿' : '🏥'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.themeLabel, { color: t.textPrimary }]}>{themeId === 'forest' ? 'Forest' : 'Clinical'} Theme</Text>
            <Text style={[styles.themeSub, { color: t.textMuted }]}>Tap to switch theme</Text>
          </View>
          <Switch value={themeId === 'clinical'} onValueChange={toggleTheme}
            trackColor={{ false: t.accentBg, true: t.accentBg }}
            thumbColor={t.accent} />
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {[
            { icon: '📅', label: 'Bookings',         value: p.totalBookings },
            { icon: '💊', label: 'Prescriptions',    value: p.prescriptions },
            { icon: '🏥', label: 'Hospitals used',   value: p.hospitalsUsed },
            { icon: '💻', label: 'Virtual consults', value: p.virtualConsults },
          ].map(s => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</Text>
              <Text style={[styles.statValue, { color: t.textPrimary }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: t.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Health profile */}
        <View style={[styles.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>Health profile</Text>
          {[
            { label: 'Blood group', value: p.blood },
            { label: 'Genotype',    value: p.genotype },
            { label: 'Allergies',   value: p.allergies.join(', ') },
            { label: 'Conditions',  value: p.conditions.join(', ') },
            { label: 'HMO',         value: `${p.hmo} · ${p.hmoNo}` },
          ].map(i => (
            <View key={i.label} style={[styles.infoRow, { borderBottomColor: t.cardBorder }]}>
              <Text style={[styles.infoLabel, { color: t.textMuted }]}>{i.label}</Text>
              <Text style={[styles.infoValue, { color: t.textPrimary }]}>{i.value}</Text>
            </View>
          ))}
        </View>

        {/* Menu */}
        {[
          { icon: '🩺', label: 'Medical history' },
          { icon: '📋', label: 'Prescriptions & lab results' },
          { icon: '👨‍👩‍👧', label: 'Manage dependents' },
          { icon: '🔔', label: 'Notifications' },
          { icon: '🔒', label: 'Privacy & security' },
          { icon: '💬', label: 'Support & queries' },
        ].map(item => (
          <TouchableOpacity key={item.label} style={[styles.menuItem, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={{ fontSize: 16 }}>{item.icon}</Text>
            <Text style={[styles.menuLabel, { color: t.textPrimary }]}>{item.label}</Text>
            <Text style={[styles.menuArrow, { color: t.textMuted }]}>›</Text>
          </TouchableOpacity>
        ))}

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
  badges:      { flexDirection: 'row', gap: 6, marginTop: 8 },
  badge:       { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  badgeText:   { fontSize: 10, fontWeight: '700' },
  themeRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1 },
  themeLabel:  { fontSize: 14, fontWeight: '600' },
  themeSub:    { fontSize: 11, marginTop: 1 },
  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statBox:     { width: '47.5%', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1 },
  statValue:   { fontSize: 20, fontWeight: '800' },
  statLabel:   { fontSize: 10, marginTop: 2, textAlign: 'center' },
  section:     { borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 1 },
  sectionTitle:{ padding: 10, paddingHorizontal: 14, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, borderBottomWidth: 1 },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 9, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  infoLabel:   { fontSize: 12, flexShrink: 0 },
  infoValue:   { fontSize: 12, fontWeight: '500', textAlign: 'right', flex: 1 },
  menuItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, paddingHorizontal: 14, marginBottom: 7, borderWidth: 1 },
  menuLabel:   { fontSize: 13, fontWeight: '500', flex: 1 },
  menuArrow:   { fontSize: 18 },
})
