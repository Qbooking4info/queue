import { useState, useEffect } from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { Header, Card, ListRow, SectionTitle, SegmentedControl, PrimaryButton } from '@queue/shared/components/ui/v3'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'
import { getMyHospital } from '@queue/shared/lib/admin-api'

const ROLE_LABEL: Record<string, string> = {
  driver:     'Driver',
  emt:        'EMT',
  paramedic:  'Paramedic',
  nurse:      'Nurse',
  doctor:     'Doctor',
  dispatcher: 'Dispatcher',
}

// v3.1 Crew Profile (c-me). Same layout as the patient Profile: identity in the teal
// header, grouped rows, appearance, then sign out with a confirm step.
export function CrewProfileScreen() {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { crewProfile, staffProfile, user, signOut } = useAuth()
  const [confirm,      setConfirm]      = useState(false)
  const [signingOut,   setSigningOut]   = useState(false)
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [shifts, setShifts] = useState<{ id: string; role_label: string; starts_at: string; ends_at: string }[]>([])

  // Hospital-fleet crew resolve through staffProfile, not crewProfile (that's
  // third-party only) — same organisation display either way, different source.
  const isHospitalFleet = !crewProfile && staffProfile?.role === 'ambulance_crew'
  const crewRole = crewProfile?.crewRole ?? staffProfile?.crewRole
  const crewTier = crewProfile?.crewTier ?? staffProfile?.crewTier
  const org = crewProfile?.providerName ?? hospitalName

  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    if (!isHospitalFleet || !staffProfile?.hospitalId) return
    getMyHospital(staffProfile.hospitalId).then(h => { if (h) setHospitalName(h.name) })
  }, [isHospitalFleet, staffProfile?.hospitalId])

  // Next 7 days of rota shifts (hospital-fleet crews are rostered in Queue Hospital).
  useEffect(() => {
    if (!user?.id) return
    const now = new Date(), week = new Date(now.getTime() + 7 * 86400_000)
    supabase.from('staff_shifts').select('id, role_label, starts_at, ends_at').eq('user_id', user.id)
      .gte('ends_at', now.toISOString()).lt('starts_at', week.toISOString()).order('starts_at').limit(14)
      .then(({ data }: { data: any[] | null }) => setShifts(data ?? []))
  }, [user?.id])

  async function doSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <ProfileAvatar size={68} editable />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{user?.full_name ?? 'Crew member'}</Text>
            <Text style={{ color: '#CCFBF1', fontSize: 13, marginTop: 2 }}>
              {ROLE_LABEL[crewRole ?? ''] ?? crewRole ?? 'Crew'}{org ? ` · ${org}` : ''}
            </Text>
          </View>
        </View>
      </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ padding: 20, gap: 14 }}>
          <SectionTitle title="Details" />
          <Card style={{ paddingVertical: 0 }}>
            <ListRow icon="ribbon-outline" title="Care tier" trailing={<Text style={{ fontSize: 14, fontWeight: '600', color: t.textPrimary }}>{crewTier ?? '—'}</Text>} />
            <ListRow icon="call-outline" title="Phone" last trailing={<Text style={{ fontSize: 14, fontWeight: '600', color: t.textPrimary }}>{user?.phone ?? '—'}</Text>} />
          </Card>

          {shifts.length > 0 && (
            <>
              <SectionTitle title="My shifts" />
              <Card style={{ paddingVertical: 0 }}>
                {shifts.map((sh, i) => (
                  <ListRow key={sh.id} icon="time-outline" last={i === shifts.length - 1}
                    title={new Date(sh.starts_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' })}
                    subtitle={`${sh.role_label} · ${new Date(sh.starts_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}–${new Date(sh.ends_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`} />
                ))}
              </Card>
            </>
          )}

          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary }}>Appearance</Text>
            <SegmentedControl<'light' | 'dark'> value={themeId === 'forest' ? 'dark' : 'light'}
              onChange={v => { if (v !== (themeId === 'forest' ? 'dark' : 'light')) toggleTheme() }}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Card>

          {!confirm ? (
            <TouchableOpacity onPress={() => { haptics.tap(); setConfirm(true) }} accessibilityRole="button"
              style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.danger, fontSize: 16, fontWeight: '700' }}>Sign out</Text>
            </TouchableOpacity>
          ) : (
            <Card style={{ gap: 12, borderColor: t.dangerBorder }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>Sign out? You won't receive job offers until you sign back in.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><PrimaryButton label="Cancel" variant="ghost" height={64} onPress={() => setConfirm(false)} /></View>
                <View style={{ flex: 1 }}><PrimaryButton label="Sign out" variant="danger" height={64} loading={signingOut} onPress={doSignOut} /></View>
              </View>
            </Card>
          )}

          <DeleteAccount what="your crew profile, photo and sign-in" />
        </View>
      </ScrollView>
    </View>
  )
}
