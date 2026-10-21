import { useState, useEffect } from 'react'
import { View, ScrollView, TouchableOpacity, Clipboard } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'
import { Header, Card, ListRow, SectionTitle, SegmentedControl, PrimaryButton, KpiCard } from '@queue/shared/components/ui/v3'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'

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

  const initials = doctor?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    ?? user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    ?? '?'

  const [copied, setCopied] = useState(false)
  function copyCode() {
    if (!user?.doctor_code) return
    Clipboard.setString(user.doctor_code)
    haptics.success(); setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  const value = (v: string, accent?: boolean) =>
    <Text style={{ fontSize: 14, fontWeight: '600', color: accent ? t.accent : t.textPrimary }}>{v}</Text>

  // v3.1 Doctor Profile & Earnings (d-me): identity + Doctor ID in the teal header,
  // the same grouped-row layout as the patient Profile.
  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <ProfileAvatar size={68} editable variant="doctor" name={doctor?.full_name ?? user?.full_name} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>
              {doctor?.full_name ?? user?.full_name ?? 'Your profile'}
            </Text>
            <Text numberOfLines={1} style={{ color: '#CCFBF1', fontSize: 13 }}>
              {[doctor?.specialty ? (doctor.specialty as any).name : null, doctor?.qualification].filter(Boolean).join(' · ') || 'Doctor'}
            </Text>
            {user?.doctor_code && (
              <TouchableOpacity onPress={copyCode} accessibilityRole="button" accessibilityLabel={`Doctor ID ${user.doctor_code}. Copy`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}>
                <Text style={{ color: '#CCFBF1', fontSize: 13 }}>Doctor ID {user.doctor_code}</Text>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#CCFBF1" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Header>

      {loading ? (
        <View style={{ padding: 20, gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
      ) : (
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <KpiCard label="Today" value={stats.today} onPress={navigation ? () => navigation.navigate('Queue') : undefined} />
            <KpiCard label="This month" value={stats.thisMonth} />
            <KpiCard label="Completed" value={stats.completed} />
          </View>

          {(doctor?.avg_rating ?? 0) > 0 && (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <Ionicons key={i} name="star" size={18} color={i < Math.round(doctor!.avg_rating!) ? t.starColor : t.cardBorder} />
              ))}
              <Text style={{ fontSize: 14, color: t.textSecondary, marginLeft: 4 }}>
                {doctor!.avg_rating!.toFixed(1)} · {doctor!.review_count ?? 0} reviews
              </Text>
            </Card>
          )}

          <SectionTitle title="Practice" />
          <Card style={{ paddingVertical: 0 }}>
            <ListRow icon="briefcase-outline" title="Experience" trailing={value(doctor?.years_experience ? `${doctor.years_experience} years` : '—')} />
            <ListRow icon="cash-outline" title="Consultation fee" trailing={value(doctor?.consultation_fee ? `₦${doctor.consultation_fee.toLocaleString()}` : '—')} />
            {doctor?.accepts_virtual && (
              <ListRow icon="videocam-outline" title="Virtual fee" trailing={value(doctor?.virtual_fee ? `₦${doctor.virtual_fee.toLocaleString()}` : '—')} />
            )}
            <ListRow icon="globe-outline" title="Virtual consultations" last trailing={value(doctor?.accepts_virtual ? 'On' : 'Off', !!doctor?.accepts_virtual)} />
          </Card>

          {doctor?.bio && (
            <Card style={{ gap: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary }}>About</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: t.textSecondary }}>{doctor.bio}</Text>
            </Card>
          )}

          <Card style={{ paddingVertical: 0 }}>
            {navigation && <ListRow icon="business-outline" title="Hospitals & Doctor ID" subtitle="Linked hospitals and your QR" onPress={() => navigation.navigate('Hospitals')} />}
            {navigation && <ListRow icon="briefcase-outline" title="Locum board" subtitle="Find or advertise shifts" onPress={() => navigation.navigate('LocumBoard')} />}
            {navigation && <ListRow icon="bar-chart-outline" title="My analytics" subtitle="Visits, wait times, ratings" onPress={() => navigation.navigate('DoctorAnalytics')} />}
            {navigation && <ListRow icon="settings-outline" title="Settings & fees" subtitle="Availability, fees, virtual care" last onPress={() => navigation.navigate('Settings')} />}
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary }}>Appearance</Text>
            <SegmentedControl<'light' | 'dark'> value={themeId === 'forest' ? 'dark' : 'light'}
              onChange={v => { if (v !== (themeId === 'forest' ? 'dark' : 'light')) toggleTheme() }}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Card>

          {!confirmVisible ? (
            <TouchableOpacity onPress={() => { haptics.tap(); setConfirmVisible(true) }} accessibilityRole="button"
              style={{ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.danger, fontSize: 15, fontWeight: '700' }}>Sign out</Text>
            </TouchableOpacity>
          ) : (
            <Card style={{ gap: 12, borderColor: t.dangerBorder }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>Sign out of your account?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><PrimaryButton label="Cancel" variant="ghost" height={48} onPress={() => setConfirmVisible(false)} /></View>
                <View style={{ flex: 1 }}><PrimaryButton label="Sign out" variant="danger" height={48} loading={signingOut} onPress={handleSignOut} /></View>
              </View>
            </Card>
          )}

          <DeleteAccount what="your doctor profile, photo and sign-in, and removes you from hospital rosters" />
        </View>
      </ScrollView>
      )}
    </View>
  )
}
