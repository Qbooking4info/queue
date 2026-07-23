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
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { user, doctorProfile, signOut }   = useAuth()
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
          const today   = new Date().toISOString().split('T')[0]
          const monthStart = today.slice(0, 7) + '-01'

          const [todayRes, monthRes, completedRes] = await Promise.all([
            (supabase as any).from('appointments').select('*', { count: 'exact', head: true }).eq('doctor_id', doctorProfile!.doctorId).eq('appointment_date', today).neq('status', 'cancelled'),
            (supabase as any).from('appointments').select('*', { count: 'exact', head: true }).eq('doctor_id', doctorProfile!.doctorId).gte('appointment_date', monthStart).neq('status', 'cancelled'),
            (supabase as any).from('appointments').select('*', { count: 'exact', head: true }).eq('doctor_id', doctorProfile!.doctorId).eq('status', 'completed'),
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

  const initials = doctor?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    ?? user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    ?? '?'

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

        {/* Doctor Card */}
        <View style={[st.profileCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={[st.avatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={[st.avatarText, { color: t.accent }]}>{initials}</Text>
          </View>
          <Text style={[st.docName, { color: t.textPrimary }]}>{doctor?.full_name ?? user?.full_name ?? '—'}</Text>
          {doctor?.specialty && (
            <Text style={[st.specialty, { color: t.accent }]}>{(doctor.specialty as any).name}</Text>
          )}
          {doctor?.qualification && (
            <Text style={[st.qual, { color: t.textMuted }]}>{doctor.qualification}</Text>
          )}
          {user?.email && (
            <Text style={[st.email, { color: t.textMuted }]}>{user.email}</Text>
          )}

          {(doctor?.avg_rating ?? 0) > 0 && (
            <View style={st.ratingRow}>
              {[0, 1, 2, 3, 4].map(i => (
                <Ionicons key={i} name="star" size={16} color={i < Math.round(doctor!.avg_rating!) ? '#EF9F27' : t.textMuted} />
              ))}
              <Text style={[st.ratingNum, { color: t.textMuted }]}>
                {doctor!.avg_rating!.toFixed(1)} ({doctor!.review_count ?? 0} reviews)
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={[st.statsRow, { marginHorizontal: 16, marginBottom: 12 }]}>
          {[
            { label: 'Today',      value: stats.today },
            { label: 'This month', value: stats.thisMonth },
            { label: 'All-time',   value: stats.completed },
          ].map(s => (
            <View key={s.label} style={[st.statBox, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.statNum, { color: t.textPrimary }]}>{s.value}</Text>
              <Text style={[st.statLabel, { color: t.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

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
              <Ionicons name={themeId === 'forest' ? 'moon-outline' : 'sunny-outline'} size={14} color={t.textPrimary} />
              <Text style={[st.rowLabel, { color: t.textPrimary }]}>
                {themeId === 'forest' ? 'Dark theme' : 'Light theme'}
              </Text>
            </View>
            <Switch value={themeId === 'forest'} onValueChange={toggleTheme} trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        </View>

        {/* Sign out */}
        {confirmVisible ? (
          <View style={[st.section, { backgroundColor: 'rgba(255,92,92,0.07)', borderColor: 'rgba(255,92,92,0.25)', marginHorizontal: 16, marginBottom: 12 }]}>
            <Text style={[st.sectionTitle, { color: '#FF5C5C', borderBottomColor: 'rgba(255,92,92,0.15)' }]}>CONFIRM SIGN OUT</Text>
            <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
              <TouchableOpacity
                style={[st.actionBtn, { flex: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg }]}
                onPress={() => setConfirmVisible(false)}
              >
                <Text style={{ color: t.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.actionBtn, { flex: 1, borderColor: 'rgba(255,92,92,0.4)', backgroundColor: 'rgba(255,92,92,0.1)' }]}
                onPress={() => { haptics.tap(); handleSignOut() }}
                disabled={signingOut}
              >
                {signingOut
                  ? <ActivityIndicator size="small" color="#FF5C5C" />
                  : <Text style={{ color: '#FF5C5C', fontWeight: '700' }}>Sign out</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[st.signOutBtn, { borderColor: 'rgba(255,92,92,0.3)', marginHorizontal: 16 }]}
            onPress={() => setConfirmVisible(true)}
          >
            <Text style={st.signOutTxt}>Sign out</Text>
          </TouchableOpacity>
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
  title:           { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  profileCard:     { marginHorizontal: 16, borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, marginBottom: 12 },
  avatar:          { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 12 },
  avatarText:      { fontSize: 26, fontWeight: '800' },
  docName:         { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  specialty:       { fontSize: 13, fontWeight: '700', marginTop: 4 },
  qual:            { fontSize: 12, marginTop: 3, textAlign: 'center' },
  email:           { fontSize: 11, marginTop: 6 },
  ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  ratingNum:       { fontSize: 12, marginLeft: 4 },
  statsRow:        { flexDirection: 'row', gap: 8 },
  statBox:         { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  statNum:         { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel:       { fontSize: 10, fontWeight: '600', marginTop: 3 },
  scheduleBtn:     { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  scheduleBtnText: { fontSize: 14, fontWeight: '700' },
  section:         { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  row:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14, borderBottomWidth: 1 },
  rowLabel:        { fontSize: 13 },
  rowValue:        { fontSize: 13, fontWeight: '600' },
  bio:             { padding: 14, fontSize: 13, lineHeight: 20 },
  actionBtn:       { padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  signOutBtn:      { borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, backgroundColor: 'rgba(255,92,92,0.06)' },
  signOutTxt:      { fontSize: 14, fontWeight: '700', color: '#FF5C5C' },
})
