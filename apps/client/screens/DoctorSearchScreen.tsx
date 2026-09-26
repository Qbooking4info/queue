// Doctor-first discovery -- separate from SearchScreen (which searches
// hospitals). Shows every registered, active doctor, not just ones accepting
// direct (no-hospital) bookings -- a doctor who hasn't opted into that still
// shows up with their hospital affiliation(s) (see DoctorListItem), just
// without a direct-booking CTA on their profile. The Virtual/Home Visit
// filter narrows to doctors who specifically opted into that direct-
// booking type (doctor_profiles.accepts_direct_virtual/accepts_direct_home_visit).
// Optionally entered pre-filtered to one specialty (from SpecialtyResultsScreen's
// toggle) via route.params, or picked in-screen from the specialty chip row.
import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { searchIndependentDoctors, getSpecialties, IndependentDoctor, SpecialtyRow } from '@queue/shared/lib/api'
import { DoctorListItem } from '@queue/shared/components/doctor/DoctorListItem'
import { haptics } from '@queue/shared/lib/haptics'

interface Props { navigation: any; route?: any }

type VisitFilter = 'all' | 'virtual' | 'home_visit'

export function DoctorSearchScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const routeSpecialtyId: string | undefined = route?.params?.specialtyId
  const routeSpecialtyName: string | undefined = route?.params?.specialtyName

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<VisitFilter>('all')
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  const [specialtyId, setSpecialtyId] = useState<string | undefined>(routeSpecialtyId)
  const [doctors, setDoctors] = useState<IndependentDoctor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { getSpecialties().then(setSpecialties) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const results = await searchIndependentDoctors({
      q: q.trim() || undefined,
      visitType: filter === 'all' ? undefined : filter,
      specialtyId,
    })
    // "Sorted by rating" -- doctors with a rating first (highest first), then
    // unrated doctors after, in whatever order the API returned them.
    results.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1))
    setDoctors(results)
    setLoading(false)
  }, [q, filter, specialtyId])

  useEffect(() => {
    const timer = setTimeout(load, 300) // debounce typing
    return () => clearTimeout(timer)
  }, [load])

  const virtualCount = doctors.filter(d => d.acceptsDirectVirtual).length
  const homeVisitCount = doctors.filter(d => d.acceptsDirectHomeVisit).length
  const selectedSpecialtyName = specialtyId
    ? (specialties.find(s => s.id === specialtyId)?.name ?? routeSpecialtyName)
    : undefined

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      {/* Dark hero header -- matches the app's other "always dark" banner
          treatment (AppointmentDetailScreen, PatientConsultScreen), not a new
          one-off color, so it stays legible across all 4 themes. */}
      <View style={[st.hero, { backgroundColor: t.bannerBg }]}>
        <View style={st.heroTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" style={{ marginRight: 10 }}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={st.title}>{selectedSpecialtyName ? `${selectedSpecialtyName} Doctors` : 'Find a Doctor'}</Text>
        </View>
        <View style={st.inputWrap}>
          <Ionicons name="search-outline" size={15} color="rgba(255,255,255,0.6)" />
          <TextInput value={q} onChangeText={setQ} placeholder="Search by name or specialty…" placeholderTextColor="rgba(255,255,255,0.5)"
            style={st.input} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Stat strip -- real, live counts from the current result set (not
            platform-wide vanity numbers), laid out as the 3-up card the
            design calls for. */}
        <View style={[st.statsCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Stat t={t} value={String(doctors.length)} label="Available" />
          <View style={[st.statDivider, { backgroundColor: t.cardBorder }]} />
          <Stat t={t} value={String(virtualCount)} label="Virtual" />
          <View style={[st.statDivider, { backgroundColor: t.cardBorder }]} />
          <Stat t={t} value={String(homeVisitCount)} label="Home Visit" />
        </View>

        {/* Specialty chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
          <TouchableOpacity onPress={() => { haptics.tap(); setSpecialtyId(undefined) }}
            style={[st.chip, { backgroundColor: !specialtyId ? t.accent : t.cardBg, borderColor: !specialtyId ? t.accent : t.cardBorder }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: !specialtyId ? t.onAccent : t.textPrimary }}>All Specialties</Text>
          </TouchableOpacity>
          {specialties.map(s => (
            <TouchableOpacity key={s.id} onPress={() => { haptics.tap(); setSpecialtyId(s.id) }}
              style={[st.chip, { backgroundColor: specialtyId === s.id ? t.accent : t.cardBg, borderColor: specialtyId === s.id ? t.accent : t.cardBorder }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: specialtyId === s.id ? t.onAccent : t.textPrimary }}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Visit-type filter -- smaller, secondary to the specialty chips above */}
        <View style={st.filterRow}>
          {([['all', 'All types'], ['virtual', 'Virtual'], ['home_visit', 'Home Visit']] as [VisitFilter, string][]).map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => { haptics.tap(); setFilter(key) }}
              style={[st.filterChip, { backgroundColor: filter === key ? t.accentBg : 'transparent', borderColor: filter === key ? t.accentBorder : t.cardBorder }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: filter === key ? t.accent : t.textMuted }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={st.resultsHeader}>
          <Text style={[st.resultsCount, { color: t.textPrimary }]}>{doctors.length} Doctor{doctors.length === 1 ? '' : 's'} Available</Text>
          <Text style={[st.sortedBy, { color: t.accent }]}>Sorted by rating</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : doctors.length === 0 ? (
          <View style={st.empty}>
            <Ionicons name="medkit-outline" size={44} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
            <Text style={[st.emptyTitle, { color: t.textPrimary }]}>No doctors found</Text>
            <Text style={[st.emptySub, { color: t.textMuted }]}>Try a different search or filter.</Text>
          </View>
        ) : (
          doctors.map(d => (
            <DoctorListItem key={d.userId} doctor={d}
              onPress={() => { haptics.tap(); navigation.navigate('DoctorProfile', { userId: d.userId }) }} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Stat({ t, value, label }: { t: any; value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.4 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: t.textMuted, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  safe:        { flex: 1 },
  hero:        { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  heroTopRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: '#fff' },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 14, paddingVertical: 12 },
  input:       { flex: 1, fontSize: 15, color: '#fff' },
  statsCard:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: -18, borderRadius: 16, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3 },
  statDivider: { width: 1, height: 28 },
  chipRow:     { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4, gap: 8 },
  chip:        { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1 },
  filterRow:   { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 10, marginBottom: 6 },
  filterChip:  { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 99, borderWidth: 1 },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 14, marginBottom: 10 },
  resultsCount:  { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  sortedBy:      { fontSize: 12, fontWeight: '700' },
  empty:       { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 40 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySub:    { fontSize: 14, textAlign: 'center' },
})
