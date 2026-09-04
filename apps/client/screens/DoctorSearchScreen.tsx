// Doctor-first discovery -- separate from SearchScreen (which searches
// hospitals). Shows every registered, active doctor, not just ones accepting
// direct (no-hospital) bookings -- a doctor who hasn't opted into that still
// shows up with their hospital affiliation(s) (see DoctorListItem), just
// without a direct-booking CTA on their profile. The Virtual/Home Visit
// filter chips narrow to doctors who specifically opted into that direct-
// booking type (doctor_profiles.accepts_direct_virtual/accepts_direct_home_visit).
// Optionally entered pre-filtered to one specialty (from SpecialtyResultsScreen's
// toggle) via route.params.
import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { searchIndependentDoctors, IndependentDoctor } from '@queue/shared/lib/api'
import { DoctorListItem } from '@queue/shared/components/doctor/DoctorListItem'
import { haptics } from '@queue/shared/lib/haptics'

interface Props { navigation: any; route?: any }

type VisitFilter = 'all' | 'virtual' | 'home_visit'

export function DoctorSearchScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const specialtyId: string | undefined = route?.params?.specialtyId
  const specialtyName: string | undefined = route?.params?.specialtyName

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<VisitFilter>('all')
  const [doctors, setDoctors] = useState<IndependentDoctor[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const results = await searchIndependentDoctors({
      q: q.trim() || undefined,
      visitType: filter === 'all' ? undefined : filter,
      specialtyId,
    })
    setDoctors(results)
    setLoading(false)
  }, [q, filter, specialtyId])

  useEffect(() => {
    const t = setTimeout(load, 300) // debounce typing
    return () => clearTimeout(t)
  }, [load])

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" style={{ marginRight: 10 }}>
          <Ionicons name="arrow-back" size={20} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>{specialtyName ? `${specialtyName} Doctors` : 'Find a Doctor'}</Text>
      </View>

      <View style={[st.inputWrap, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
        <Ionicons name="search-outline" size={15} color={t.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Doctor name or specialty…" placeholderTextColor={t.textMuted}
          style={[st.input, { color: t.textPrimary }]} />
      </View>

      <View style={st.filterRow}>
        {([['all', 'All'], ['virtual', 'Virtual'], ['home_visit', 'Home Visit']] as [VisitFilter, string][]).map(([key, label]) => (
          <TouchableOpacity key={key} onPress={() => { haptics.tap(); setFilter(key) }}
            style={[st.chip, { backgroundColor: filter === key ? t.accentBg : t.cardBg, borderColor: filter === key ? t.accentBorder : t.cardBorder }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: filter === key ? t.accent : t.textMuted }}>{label}</Text>
          </TouchableOpacity>
        ))}
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {doctors.map(d => (
            <DoctorListItem key={d.userId} doctor={d}
              onPress={() => { haptics.tap(); navigation.navigate('DoctorProfile', { userId: d.userId }) }} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  input:       { flex: 1, fontSize: 13 },
  filterRow:   { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 14 },
  chip:        { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1 },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle:  { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  emptySub:    { fontSize: 12, textAlign: 'center' },
})
