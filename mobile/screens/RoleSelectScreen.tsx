import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'

interface Props { navigation: any }

export function RoleSelectScreen({ navigation }: Props) {
  const { theme: t } = useTheme()

  return (
    <SafeAreaView edges={['top','left','right','bottom']} style={[s.safe, { backgroundColor: t.canvasBg }]}>

      {/* Branding */}
      <View style={s.logoWrap}>
        <View style={[s.logoIcon, { backgroundColor: `${t.accent}18`, borderColor: `${t.accent}30` }]}>
          <Ionicons name="pulse" size={32} color={t.accent} />
        </View>
        <Text style={[s.logoText, { color: t.textPrimary }]}>Queue</Text>
        <Text style={[s.logoSub, { color: t.textMuted }]}>Healthcare, made simple</Text>
      </View>

      {/* Role cards */}
      <View style={s.cards}>
        <TouchableOpacity
          onPress={() => navigation.navigate('PatientAuth')}
          style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
          activeOpacity={0.85}
        >
          <View style={[s.cardIcon, { backgroundColor: `${t.accent}15` }]}>
            <Ionicons name="person-outline" size={28} color={t.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: t.textPrimary }]}>I'm a Patient</Text>
            <Text style={[s.cardSub, { color: t.textMuted }]}>
              Book appointments, manage health records, and consult doctors
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('HospitalAuth')}
          style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
          activeOpacity={0.85}
        >
          <View style={[s.cardIcon, { backgroundColor: 'rgba(91,158,255,0.15)' }]}>
            <Ionicons name="business-outline" size={28} color="#5B9EFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: t.textPrimary }]}>I'm a Hospital / Staff</Text>
            <Text style={[s.cardSub, { color: t.textMuted }]}>
              Register your hospital or sign in to manage queues, staff, and appointments
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={[s.footer, { color: t.textMuted }]}>
        © {new Date().getFullYear()} Queue Health Technologies
      </Text>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:      { flex: 1 },
  logoWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 20 },
  logoIcon:  { width: 80, height: 80, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText:  { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  logoSub:   { fontSize: 14, marginTop: 4 },
  cards:     { paddingHorizontal: 20, gap: 12, paddingBottom: 24 },
  card:      { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, padding: 18 },
  cardIcon:  { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  cardSub:   { fontSize: 12, lineHeight: 17 },
  footer:    { fontSize: 11, textAlign: 'center', paddingBottom: 24 },
})
