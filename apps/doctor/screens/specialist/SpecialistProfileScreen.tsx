import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'
import { Button } from '@queue/shared/components/ui/Button'
import { ProfileCard } from '@queue/shared/components/ui/ProfileCard'
import { Glass } from '@queue/shared/components/ui/Glass'
import { Pill } from '@queue/shared/components/ui/DataViz'

interface Props { navigation?: any }

interface DoctorDetails {
  full_name:        string
  qualification:    string | null
  bio:              string | null
  years_experience: number | null
  avg_rating:       number | null
  review_count:     number | null
  consultation_fee: number | null
  virtual_fee:      number | null
  accepts_virtual:  boolean | null
  specialty:        { name: string } | null
}

interface Stats {
  today:     number
  thisMonth: number
  completed: number
}

export function SpecialistProfileScreen({ navigation }: Props) {
  const { theme: t, themeId, toggleTheme, mode, toggleMode } = useTheme()
  const { user, doctorProfile, signOut } = useAuth()
  const [doctor,       setDoctor]       = useState<DoctorDetails | null>(null)
  const [stats,        setStats]        = useState<Stats>({ today: 0, thisMonth: 0, completed: 0 })
  const [loading,      setLoading]      = useState(true)
  const [signingOut,   setSigningOut]   = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)

  useEffect(() => {
    if (!doctorProfile) return

    async function fetch() {
      const [{ data: doc }, statsRes] = await Promise.all([
        supabase
          .from('doctors')
          .select('full_name, qualification, bio, years_experience, avg_rating, review_count, consultation_fee, virtual_fee, accepts_virtual, specialty:specialties!doctors_specialty_id_fkey(name)')
          .eq('id', doctorProfile!.doctorId)
          .single() as any,
        (async () => {
          const today   = todayLocalDate()
          const monthStart = today.slice(0, 7) + '-01'

          const [todayRes, monthRes, completedRes] = await Promise.all([
            supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('doctor_id', doctorProfile!.doctorId).eq('appointment_date', today).neq('status', 'cancelled'),
            supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('doctor_id', doctorProfile!.doctorId).gte('appointment_date', monthStart).neq('status', 'cancelled'),
            supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('doctor_id', doctorProfile!.doctorId).eq('status', 'completed'),
          ])

          return { today: todayRes.count ?? 0, thisMonth: monthRes.count ?? 0, completed: completedRes.count ?? 0 }
        })(),
      ])

      setDoctor(doc as DoctorDetails)
      setStats(statsRes)
      setLoading(false)
    }

    fetch()
  }, [doctorProfile])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top','left','right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
        <View style={st.center}><ActivityIndicator color={t.accent} size="large" /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[st.title, { color: t.textPrimary }]}>Profile</Text>

        <ProfileCard
          name={doctor?.full_name ?? user?.full_name ?? '—'}
          sub={doctor?.qualification ?? user?.email ?? null}
          badge={doctor?.specialty
            ? <Pill label={(doctor.specialty as any).name} tone="statusVirtual" />
            : undefined}
          stats={[
            { label: 'Rating', value: (doctor?.avg_rating ?? 0) > 0 ? doctor!.avg_rating!.toFixed(1) : '—' },
            { label: 'This month', value: String(stats.thisMonth) },
            { label: 'All-time', value: String(stats.completed) },
          ]}
          style={{ marginHorizontal: 16, marginBottom: 12 }}
        />

        {/* Kept out of ProfileCard deliberately: the doctor code is the string a
            hospital types to link this account, so it needs to stay selectable and
            prominent rather than becoming a stat chip. */}
        {(user?.doctor_code || (doctor?.avg_rating ?? 0) > 0) && (
          <Glass radius={22} pad={14} style={{ marginHorizontal: 16, marginBottom: 12, gap: 10 }}>
            {!!user?.doctor_code && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="key-outline" size={13} color={t.accent} />
                <Text style={{ fontSize: 12.5, color: t.textSecondary }}>Doctor ID</Text>
                <Text selectable style={{ fontSize: 13.5, fontWeight: '700', color: t.accent, marginLeft: 'auto' }}>
                  {user.doctor_code}
                </Text>
              </View>
            )}
            {(doctor?.avg_rating ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <Ionicons key={i} name="star" size={15}
                    color={i < Math.round(doctor!.avg_rating!) ? t.statusBusy.text : t.tick} />
                ))}
                <Text style={{ fontSize: 12, color: t.textSecondary, marginLeft: 6 }}>
                  {doctor!.avg_rating!.toFixed(1)} from {doctor!.review_count ?? 0} review{(doctor!.review_count ?? 0) === 1 ? '' : 's'}
                </Text>
              </View>
            )}
          </Glass>
        )}

        {/* Today's schedule quick link */}
        {navigation && (
          <TouchableOpacity
            style={[st.scheduleBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}
            onPress={() => {
              haptics.tap()
              navigation.navigate('Queue')
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="calendar-outline" size={14} color={t.accent} /><Text style={[st.scheduleBtnText, { color: t.accent }]}>View Today's Schedule</Text></View>
          </TouchableOpacity>
        )}

        {/* Practice info */}
        <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>PRACTICE INFO</Text>
          <Row label="Experience" value={doctor?.years_experience ? `${doctor.years_experience} years` : '—'} theme={t} />
          <Row label="Consultation fee" value={doctor?.consultation_fee ? `₦${doctor.consultation_fee.toLocaleString()}` : '—'} theme={t} />
          {doctor?.accepts_virtual && (
            <Row label="Virtual fee" value={doctor?.virtual_fee ? `₦${doctor.virtual_fee.toLocaleString()}` : '—'} theme={t} />
          )}
          <Row label="Virtual consultations" value={doctor?.accepts_virtual ? 'Enabled' : 'Disabled'} theme={t} accent={doctor?.accepts_virtual ?? false} />
        </View>

        {/* Bio */}
        {doctor?.bio && (
          <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginHorizontal: 16, marginBottom: 12 }]}>
            <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>BIO</Text>
            <Text style={[st.bio, { color: t.textSecondary }]}>{doctor.bio}</Text>
          </View>
        )}

        {/* Settings */}
        <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>SETTINGS</Text>
          <View style={[st.row, { borderBottomColor: t.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={themeId === 'forest' ? 'leaf-outline' : 'medical-outline'} size={14} color={t.textPrimary} />
              <Text style={[st.rowLabel, { color: t.textPrimary }]}>
                {themeId === 'forest' ? 'Teal' : 'Clinical'} theme
              </Text>
            </View>
            <Switch value={themeId === 'clinical'} onValueChange={toggleTheme} trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
          <View style={[st.row, { borderBottomColor: t.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={mode === 'dark' ? 'moon-outline' : 'sunny-outline'} size={14} color={t.textPrimary} />
              <Text style={[st.rowLabel, { color: t.textPrimary }]}>
                {mode === 'dark' ? 'Dark' : 'Light'} mode
              </Text>
            </View>
            <Switch value={mode === 'dark'} onValueChange={toggleMode} trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        </View>

        {/* Sign out */}
        {confirmVisible ? (
          <View style={[st.section, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder, marginHorizontal: 16, marginBottom: 12 }]}>
            <Text style={[st.sectionTitle, { color: t.danger, borderBottomColor: 'rgba(255,92,92,0.15)' }]}>CONFIRM SIGN OUT</Text>
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

function Row({ label, value, theme: t, accent }: { label: string; value: string; theme: any; accent?: boolean }) {
  return (
    <View style={[st.row, { borderBottomColor: t.cardBorder }]}>
      <Text style={[st.rowLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[st.rowValue, { color: accent ? t.accent : t.textPrimary }]}>{value}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  safe:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  specialty:       { fontSize: 15, fontWeight: '700', marginTop: 4 },
  scheduleBtn:     { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  scheduleBtnText: { fontSize: 16, fontWeight: '700' },
  section:         { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle:    { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  row:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14, borderBottomWidth: 1 },
  rowLabel:        { fontSize: 15 },
  rowValue:        { fontSize: 15, fontWeight: '600' },
  bio:             { padding: 14, fontSize: 15, lineHeight: 20 },
})
