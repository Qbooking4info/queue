import { useState, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'
import { HospitalCard } from '../components/hospital/HospitalCard'

interface Hospital {
  id: string; name: string; type: string; city: string; state: string
  avg_rating: number; review_count: number; accepts_virtual: boolean; is_verified: boolean
  hospital_specialties: { specialties: { name: string; icon: string | null } | null }[]
}

const FILTERS = ['All', 'Virtual', 'Open Now', 'Top Rated'] as const
type Filter = typeof FILTERS[number]

export function SearchScreen({ navigation, route }: { navigation: any; route: any }) {
  const [query, setQuery]       = useState(route?.params?.initialQuery ?? '')
  const [filter, setFilter]     = useState<Filter>('All')
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    setLoading(true)
    let q = supabase
      .from('hospitals')
      .select('id,name,type,city,state,avg_rating,review_count,accepts_virtual,is_verified,hospital_specialties(specialties(name,icon)),hospital_operating_hours(day_of_week,open_time,close_time)')
      .eq('is_active', true)
      .eq('is_verified', true)

    if (query.trim()) q = q.or(`name.ilike.%${query}%,city.ilike.%${query}%,type.ilike.%${query}%`)
    if (filter === 'Virtual')   q = q.eq('accepts_virtual', true)
    if (filter === 'Top Rated') q = q.gte('avg_rating', 4.5)

    q.order('avg_rating', { ascending: false }).limit(20).then(({ data }) => {
      let results = (data as (Hospital & { hospital_operating_hours: { day_of_week: number; open_time: string; close_time: string }[] })[]) ?? []
      if (filter === 'Open Now') {
        const now  = new Date()
        const day  = now.getDay()
        const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
        results = results.filter(h =>
          h.hospital_operating_hours?.some(oh =>
            oh.day_of_week === day && oh.open_time <= time && time <= oh.close_time
          )
        )
      }
      setHospitals(results)
      setLoading(false)
    })
  }, [query, filter])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Care</Text>
        <View style={styles.searchRow}>
          <Text style={{ fontSize: 16, color: t.textMuted }}>🔍</Text>
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Hospital, doctor, or specialty…"
            placeholderTextColor={t.textMuted}
            style={styles.input}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={{ color: t.textMuted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {FILTERS.map(f => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.filterChip, filter === f && styles.filterChipActive]}>
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
        <Text style={styles.count}>{hospitals.length} result{hospitals.length !== 1 ? 's' : ''}</Text>
        {loading ? (
          <Text style={styles.placeholder}>Searching…</Text>
        ) : hospitals.length === 0 ? (
          <Text style={styles.placeholder}>No hospitals found</Text>
        ) : (
          hospitals.map(h => (
            <HospitalCard key={h.id} hospital={h} onPress={() => navigation.navigate('HospitalProfile', { hospital: h })} />
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: t.bg },
  header:          { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  title:           { fontSize: font.xl, fontWeight: '800', color: t.text, marginBottom: spacing.md, letterSpacing: -0.5 },
  searchRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderMed, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  input:           { flex: 1, fontSize: font.base, color: t.text },
  filterChip:      { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: t.border },
  filterChipActive:{ borderColor: t.accent, backgroundColor: t.accentMuted },
  filterText:      { fontSize: font.sm, color: t.textSub, fontWeight: '600' },
  filterTextActive:{ color: t.accent },
  results:         { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  count:           { fontSize: font.xs, color: t.textMuted, marginBottom: spacing.sm },
  placeholder:     { color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
})
