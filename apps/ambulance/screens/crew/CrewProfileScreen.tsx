import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { DeleteAccount } from '@queue/shared/components/DeleteAccount'
import { getMyHospital } from '@queue/shared/lib/admin-api'
import { getMyUnits, getMyCrewStats, type MyUnit, type CrewStats } from '@queue/shared/lib/crew-api'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Stat, StatStrip, Seg, Btn, Mono,
} from '@queue/shared/components/q'

const ROLE_LABEL: Record<string, string> = {
  driver:     'Driver',
  emt:        'EMT',
  paramedic:  'Paramedic',
  nurse:      'Nurse',
  doctor:     'Doctor',
  dispatcher: 'Dispatcher',
}

export function CrewProfileScreen() {
  const { theme: t, mode, toggleTheme } = useTheme()
  const { crewProfile, staffProfile, user, signOut } = useAuth()
  const [confirm,      setConfirm]      = useState(false)
  const [signingOut,   setSigningOut]   = useState(false)
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [units, setUnits] = useState<MyUnit[]>([])
  const [stats, setStats] = useState<CrewStats | null>(null)
  const [shifts, setShifts] = useState<{ id: string; role_label: string; starts_at: string; ends_at: string }[]>([])

  // Hospital-fleet crew resolve through staffProfile, not crewProfile (that's
  // third-party only) — same organisation display either way, different source.
  const isHospitalFleet = !crewProfile && staffProfile?.role === 'ambulance_crew'
  const crewRole = crewProfile?.crewRole ?? staffProfile?.crewRole
  const crewTier = crewProfile?.crewTier ?? staffProfile?.crewTier
  const org = crewProfile?.providerName ?? hospitalName

  useEffect(() => {
    if (!isHospitalFleet || !staffProfile?.hospitalId) return
    getMyHospital(staffProfile.hospitalId).then(h => { if (h) setHospitalName(h.name) })
  }, [isHospitalFleet, staffProfile?.hospitalId])

  useEffect(() => {
    getMyUnits().then(setUnits).catch(() => {})
    getMyCrewStats().then(setStats).catch(() => {})
  }, [])

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

  const unit = units.find(u => u.on_duty) ?? units[0] ?? null
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <Screen>
      <AppBar large title="Crew" />

      <Body>
        <Card>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14 }}>
            <ProfileAvatar size={64} editable />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text accessibilityRole="header" numberOfLines={1}
                style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.27, color: t.q.ink }}>
                {user?.full_name ?? 'Crew member'}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 13, color: t.q.ink60, marginTop: 2 }}>
                {ROLE_LABEL[crewRole ?? ''] ?? crewRole ?? 'Crew'}{org ? ` · ${org}` : ''}
              </Text>
            </View>
          </View>
          <Hair />
          <Row compact title="Unit"
            right={<Mono size={13} weight="700">{unit?.call_sign ?? unit?.plate_number ?? '—'}</Mono>} />
          <Hair />
          <Row compact title="Care tier"
            right={<Mono size={13} weight="700">{crewTier ?? unit?.vehicle_tier ?? '—'}</Mono>} />
          <Hair />
          <Row compact title="Phone"
            right={<Mono size={13} weight="700">{user?.phone ?? '—'}</Mono>} />
        </Card>

        {!!stats && (
          <Card>
            <StatStrip>
              <Stat label="Runs completed" value={stats.jobs_completed} note="handed over" />
              <Stat label="Avg to scene"
                value={stats.avg_arrival_secs != null ? Math.round(stats.avg_arrival_secs / 60) : '—'}
                unit={stats.avg_arrival_secs != null ? 'min' : undefined}
                note="dispatch to on scene" last />
            </StatStrip>
          </Card>
        )}

        {shifts.length > 0 && (
          <>
            <SectionHead title="My shifts" />
            <Card>
              {shifts.map((sh, i) => (
                <View key={sh.id}>
                  {i > 0 && <Hair />}
                  <Row
                    compact
                    icon="time-outline"
                    title={new Date(sh.starts_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' })}
                    sub={sh.role_label}
                    right={<Mono size={13} weight="600">{hhmm(sh.starts_at)}–{hhmm(sh.ends_at)}</Mono>} />
                </View>
              ))}
            </Card>
          </>
        )}

        <SectionHead title="Appearance" />
        <Seg<'light' | 'dark'>
          value={mode === 'dark' ? 'dark' : 'light'}
          onChange={v => { if (v !== (mode === 'dark' ? 'dark' : 'light')) toggleTheme() }}
          options={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} />

        <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 12 }}>
          {!confirm ? (
            <Btn label="Sign out" variant="danger" onPress={() => { haptics.tap(); setConfirm(true) }} />
          ) : (
            <Card>
              <View style={{ padding: 14, gap: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: t.q.ink }}>
                  Sign out?
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60 }}>
                  Signing out stops job offers until you sign back in.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Btn grow label="Cancel" variant="secondary" onPress={() => setConfirm(false)} />
                  <Btn grow label="Sign out" variant="danger" loading={signingOut} onPress={doSignOut} />
                </View>
              </View>
            </Card>
          )}
          <DeleteAccount what="your crew profile, photo and sign-in" />
        </View>
      </Body>
    </Screen>
  )
}
