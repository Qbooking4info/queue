import { useState, useEffect } from 'react'
import { View, Clipboard } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Stat, StatStrip,
  Seg, Btn, Mono, qs,
} from '@queue/shared/components/q'

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

interface Stats { today: number; thisMonth: number; completed: number }

export function SpecialistProfileScreen({ navigation }: Props) {
  const { theme: t, mode, toggleTheme } = useTheme()
  const { user, doctorProfile, signOut } = useAuth()
  const [doctor,  setDoctor]  = useState<DoctorDetails | null>(null)
  const [stats,   setStats]   = useState<Stats>({ today: 0, thisMonth: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!doctorProfile) { setLoading(false); return }

    async function fetch() {
      const [{ data: doc }, statsRes] = await Promise.all([
        supabase
          .from('doctors')
          .select('full_name, qualification, bio, years_experience, avg_rating, review_count, consultation_fee, virtual_fee, accepts_virtual, specialty:specialties!doctors_specialty_id_fkey(name)')
          .eq('id', doctorProfile!.doctorId)
          .single() as any,
        (async () => {
          const today = todayLocalDate()
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

  function copyCode() {
    if (!user?.doctor_code) return
    Clipboard.setString(user.doctor_code)
    haptics.success(); setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const name = doctor?.full_name ?? user?.full_name ?? 'Your profile'
  const line = [doctor?.specialty ? (doctor.specialty as any).name : null, doctor?.qualification]
    .filter(Boolean).join(' · ') || 'Doctor'

  return (
    <Screen>
      <AppBar title="Profile" onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

      {loading ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <Body>
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14 }}>
              <ProfileAvatar size={64} editable variant="doctor" name={name} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.27, color: t.q.ink }}>
                  {name}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 13, color: t.q.ink60, marginTop: 2 }}>{line}</Text>
              </View>
            </View>
            <Hair />
            {/* The Doctor ID is how a hospital admin links this account, so it is
                read aloud and typed in far more than it is tapped. Mono, spaced,
                and copyable. */}
            <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
              <CardLabel>Your Doctor ID</CardLabel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <Text selectable style={[{ flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: 4, color: t.q.ink }, qs.naira]}>
                  {user?.doctor_code ?? '—'}
                </Text>
                <Btn label={copied ? 'Copied' : 'Copy'} variant="secondary" small
                  icon={copied ? 'checkmark' : 'copy-outline'} onPress={copyCode} />
              </View>
              <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60, marginTop: 8 }}>
                A hospital admin types this into Staff & doctors to link you to their queue.
              </Text>
            </View>
          </Card>

          <Card>
            <StatStrip>
              <Stat label="Today" value={stats.today}
                onPress={navigation ? () => navigation.navigate('Queue') : undefined} />
              <Stat label="This month" value={stats.thisMonth} note="booked" />
              <Stat label="Seen" value={stats.completed} note="all time" last />
            </StatStrip>
          </Card>

          {(doctor?.avg_rating ?? 0) > 0 && (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <Ionicons key={i} name="star" size={18}
                    color={i < Math.round(doctor!.avg_rating!) ? '#F59E0B' : t.q.line} />
                ))}
                <Text style={{ fontSize: 13, color: t.q.ink70, marginLeft: 6 }}>
                  {doctor!.avg_rating!.toFixed(1)} · {doctor!.review_count ?? 0} reviews
                </Text>
              </View>
            </Card>
          )}

          <SectionHead title="Fees" action="Edit" onAction={navigation ? () => navigation.navigate('Settings') : undefined} />
          <Card>
            <Row title="Consultation fee" compact
              right={<Mono size={14} weight="700">{doctor?.consultation_fee ? `₦${doctor.consultation_fee.toLocaleString()}` : '—'}</Mono>} />
            <Hair />
            <Row title="Virtual fee" compact
              subColor={t.q.ink60}
              sub={doctor?.accepts_virtual ? undefined : 'Virtual consults are off'}
              right={<Mono size={14} weight="700">{doctor?.virtual_fee ? `₦${doctor.virtual_fee.toLocaleString()}` : '—'}</Mono>} />
            <Hair />
            <Row title="Experience" compact
              right={<Mono size={14} weight="700">{doctor?.years_experience ? `${doctor.years_experience} yrs` : '—'}</Mono>} />
          </Card>

          {!!doctor?.bio && (
            <>
              <SectionHead title="About" />
              <Card>
                <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: t.q.ink70 }}>{doctor.bio}</Text>
                </View>
              </Card>
            </>
          )}

          <SectionHead title="Your practice" />
          <Card>
            {!!navigation && (
              <>
                <Row icon="business-outline" title="Hospitals & Doctor ID" sub="Linked hospitals and clinics"
                  chevron onPress={() => navigation.navigate('Hospitals')} />
                <Hair />
                <Row icon="briefcase-outline" title="Locum board" sub="Shifts and your own posts"
                  chevron onPress={() => navigation.navigate('LocumBoard')} />
                <Hair />
                <Row icon="trending-up-outline" title="My analytics" sub="Visits, wait times, ratings"
                  chevron onPress={() => navigation.navigate('DoctorAnalytics')} />
                <Hair />
                <Row icon="options-outline" title="Settings & fees" sub="Availability, fees, virtual care"
                  chevron onPress={() => navigation.navigate('Settings')} />
              </>
            )}
          </Card>

          <SectionHead title="Appearance" />
          <Seg<'light' | 'dark'>
            value={mode === 'dark' ? 'dark' : 'light'}
            onChange={v => { if (v !== (mode === 'dark' ? 'dark' : 'light')) toggleTheme() }}
            options={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} />

          <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 12 }}>
            {!confirmVisible ? (
              <Btn label="Sign out" variant="danger" onPress={() => { haptics.tap(); setConfirmVisible(true) }} />
            ) : (
              <Card>
                <View style={{ padding: 14, gap: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.q.ink }}>Sign out of your account?</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Btn grow label="Cancel" variant="secondary" onPress={() => setConfirmVisible(false)} />
                    <Btn grow label="Sign out" variant="danger" loading={signingOut} onPress={handleSignOut} />
                  </View>
                </View>
              </Card>
            )}
            <DeleteAccount what="your doctor profile, photo and sign-in, and removes you from hospital rosters" />
          </View>
        </Body>
      )}
    </Screen>
  )
}
