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

      {/* Role sections */}
      <View style={s.sections}>

        {/* Patient */}
        <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIcon, { backgroundColor: `${t.accent}15` }]}>
              <Ionicons name="person-outline" size={22} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: t.textPrimary }]}>Patient</Text>
              <Text style={[s.sectionSub, { color: t.textMuted }]}>Book appointments & manage your health</Text>
            </View>
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate('PatientAuth', { screen: 'Login' })}
              style={[s.btn, { borderColor: t.accent, backgroundColor: 'transparent', flex: 1 }]}
              activeOpacity={0.8}
            >
              <Text style={[s.btnText, { color: t.accent }]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('PatientAuth', { screen: 'Register' })}
              style={[s.btn, { backgroundColor: t.accent, borderColor: t.accent, flex: 1 }]}
              activeOpacity={0.8}
            >
              <Text style={[s.btnText, { color: '#fff' }]}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hospital / Staff */}
        <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIcon, { backgroundColor: 'rgba(91,158,255,0.15)' }]}>
              <Ionicons name="business-outline" size={22} color="#5B9EFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: t.textPrimary }]}>Hospital / Staff</Text>
              <Text style={[s.sectionSub, { color: t.textMuted }]}>Manage queues, staff & appointments</Text>
            </View>
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate('HospitalAuth', { screen: 'HospitalPortal' })}
              style={[s.btn, { borderColor: '#5B9EFF', backgroundColor: 'transparent', flex: 1 }]}
              activeOpacity={0.8}
            >
              <Text style={[s.btnText, { color: '#5B9EFF' }]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('HospitalAuth', { screen: 'HospitalRegister' })}
              style={[s.btn, { backgroundColor: '#5B9EFF', borderColor: '#5B9EFF', flex: 1 }]}
              activeOpacity={0.8}
            >
              <Text style={[s.btnText, { color: '#fff' }]}>Register Hospital</Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>

      <Text style={[s.footer, { color: t.textMuted }]}>
        © {new Date().getFullYear()} Queue Health Technologies
      </Text>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  logoWrap:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 8 },
  logoIcon:      { width: 72, height: 72, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoText:      { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  logoSub:       { fontSize: 13, marginTop: 4 },
  sections:      { paddingHorizontal: 20, gap: 14, paddingBottom: 20 },
  section:       { borderRadius: 20, borderWidth: 1, padding: 18, gap: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon:   { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:  { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  sectionSub:    { fontSize: 11, marginTop: 2, lineHeight: 15 },
  btnRow:        { flexDirection: 'row', gap: 10 },
  btn:           { borderRadius: 12, borderWidth: 1.5, paddingVertical: 11, alignItems: 'center' },
  btnText:       { fontSize: 13, fontWeight: '800' },
  footer:        { fontSize: 11, textAlign: 'center', paddingBottom: 24 },
})
