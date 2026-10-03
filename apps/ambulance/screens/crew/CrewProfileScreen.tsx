import { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'
import { ProfileCard } from '@queue/shared/components/ui/ProfileCard'
import { Glass } from '@queue/shared/components/ui/Glass'
import { Pill } from '@queue/shared/components/ui/DataViz'
import { getMyCrewStats, type CrewStats } from '@queue/shared/lib/crew-api'

const ROLE_LABEL: Record<string, string> = {
  driver:     'Driver',
  emt:        'EMT',
  paramedic:  'Paramedic',
  nurse:      'Nurse',
  doctor:     'Doctor',
  dispatcher: 'Dispatcher',
}

// Months under a year, whole years after that -- "0 yrs" reads as an error.
function serviceLabel(since: string | null): string {
  if (!since) return '—'
  const months = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / (30.44 * 864e5)))
  if (months < 1) return 'New'
  if (months < 12) return `${months} mo`
  return `${Math.floor(months / 12)} yr${months >= 24 ? 's' : ''}`
}

export function CrewProfileScreen() {
  const { theme: t, themeId, toggleTheme, mode, toggleMode } = useTheme()
  const { crewProfile, staffProfile, user, signOut } = useAuth()
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut,     setSigningOut]     = useState(false)
  const [hospitalName,   setHospitalName]   = useState<string | null>(null)
  const [stats,          setStats]          = useState<CrewStats | null>(null)

  // Hospital-fleet crew resolve through staffProfile, not crewProfile (that's
  // third-party only) — same organisation display either way, different source.
  const isHospitalFleet = !crewProfile && staffProfile?.role === 'ambulance_crew'
  const crewRole = crewProfile?.crewRole ?? staffProfile?.crewRole
  const crewTier = crewProfile?.crewTier ?? staffProfile?.crewTier


  useEffect(() => {
    if (!isHospitalFleet || !staffProfile?.hospitalId) return
    supabase.from('hospitals').select('name').eq('id', staffProfile.hospitalId).single()
      .then(({ data }: { data: { name: string } | null }) => { if (data) setHospitalName(data.name) })
  }, [isHospitalFleet, staffProfile?.hospitalId])

  // Stats are decoration on this screen, not the point of it: a failure here must
  // not stop the profile rendering, so it resolves to null and the chips show em dashes.
  useEffect(() => {
    let alive = true
    getMyCrewStats()
      .then(r => { if (alive) setStats(r) })
      .catch(() => { if (alive) setStats(null) })
    return () => { alive = false }
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[s.title, { color: t.textPrimary }]}>Profile</Text>

        <ProfileCard
          name={user?.full_name ?? '—'}
          sub={crewProfile?.providerName ?? hospitalName}
          badge={<Pill label={ROLE_LABEL[crewRole ?? ''] ?? crewRole ?? 'Crew'} tone="statusOpen" />}
          stats={[
            { label: 'Jobs', value: stats ? String(stats.jobs_completed) : '—' },
            {
              label: 'Avg arrival',
              value: stats?.avg_arrival_secs != null
                ? `${Math.max(1, Math.round(stats.avg_arrival_secs / 60))} min`
                : '—',
            },
            { label: 'Service', value: serviceLabel(stats?.member_since ?? null) },
          ]}
          style={{ marginHorizontal: 16, marginBottom: 12 }}
        />

        <Glass radius={22} pad={0} style={{ marginHorizontal: 16, marginBottom: 12, overflow: 'hidden' }}>
          <Text style={[s.sectionTitle, { color: t.textSecondary, borderBottomColor: t.cardBorder }]}>DETAILS</Text>
          <Row label="Care tier"  value={crewTier ?? '—'} theme={t} />
          <Row label="Phone"     value={user?.phone ?? '—'} theme={t} last />
        </Glass>

        <Glass radius={22} pad={0} style={{ marginHorizontal: 16, marginBottom: 12, overflow: 'hidden' }}>
          <Text style={[s.sectionTitle, { color: t.textSecondary, borderBottomColor: t.cardBorder }]}>SETTINGS</Text>
          <View style={[s.row, { borderBottomColor: t.cardBorder, borderBottomWidth: 1 }]}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>
              {themeId === 'forest' ? 'Teal' : 'Clinical'} theme
            </Text>
            <Switch value={themeId === 'clinical'} onValueChange={toggleTheme}
              trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>
              {mode === 'dark' ? 'Dark' : 'Light'} mode
            </Text>
            <Switch value={mode === 'dark'} onValueChange={toggleMode}
              trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        </Glass>

        {confirmVisible ? (
          <View style={[s.section, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
            <Text style={[s.sectionTitle, { color: t.danger, borderBottomColor: 'rgba(255,92,92,0.15)' }]}>CONFIRM SIGN OUT</Text>
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

function Row({ label, value, theme: t, last }: { label: string; value: string; theme: any; last?: boolean }) {
  return (
    <View style={[s.row, { borderBottomColor: t.cardBorder, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
      <Text style={[s.rowLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[s.rowValue, { color: t.textPrimary }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  title:         { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  profileCard:   { marginHorizontal: 16, borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, marginBottom: 12 },
  name:          { fontSize: 23, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  roleBadge:     { marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  roleBadgeText: { fontSize: 14, fontWeight: '700' },
  providerName:  { marginTop: 8, fontSize: 15, fontWeight: '600' },
  section:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginHorizontal: 16, marginBottom: 12 },
  sectionTitle:  { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14 },
  rowLabel:      { fontSize: 15 },
  rowValue:      { fontSize: 15, fontWeight: '600' },
})
