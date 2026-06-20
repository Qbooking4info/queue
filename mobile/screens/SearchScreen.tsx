import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { HospitalCard } from '../components/hospital/HospitalCard'
import type { DisplayHospital } from '../components/hospital/HospitalCard'
import { getHospitals } from '../lib/api'
import { toDisplayHospital } from '../lib/adapters'

const FILTERS = ['All', 'Virtual', 'Open Now', 'HMO Accepted', 'Emergency']

interface Props { navigation: any }

export function SearchScreen({ navigation }: Props) {
  const { theme: t }         = useTheme()
  const [q, setQ]            = useState('')
  const [filter, setFilter]  = useState('All')
  const [all, setAll]        = useState<DisplayHospital[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const raw = await getHospitals()
    setAll(raw.map(toDisplayHospital))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const results = all.filter(h => {
    const matchesQuery = !q.trim() ||
      h.name.toLowerCase().includes(q.toLowerCase()) ||
      h.specialty.toLowerCase().includes(q.toLowerCase()) ||
      h.services.some(s => s.toLowerCase().includes(q.toLowerCase()))
    const matchesFilter =
      filter === 'All'         ? true :
      filter === 'Virtual'     ? h.virtual :
      filter === 'Open Now'    ? h.tagType === 'open' :
      filter === 'HMO Accepted'? (h.hmo ?? []).length > 0 :
      filter === 'Emergency'   ? (h.emergencySlots ?? 0) > 0 : true
    return matchesQuery && matchesFilter
  })

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <View style={[styles.container, { backgroundColor: t.canvasBg }]}>
        <Text style={[styles.title, { color: t.textPrimary }]}>Find care</Text>

        <View style={[styles.inputWrap, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Text style={{ fontSize: 15, color: t.textMuted }}>🔍</Text>
          <TextInput
            value={q} onChangeText={setQ}
            placeholder="Hospital, doctor, specialty…"
            placeholderTextColor={t.textMuted}
            style={[styles.input, { color: t.textPrimary }]}
          />
          {!!q && (
            <TouchableOpacity onPress={() => setQ('')}>
              <Text style={{ color: t.textMuted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 20, alignItems: 'center' }}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f} onPress={() => setFilter(f)}
              style={[styles.filterPill, {
                backgroundColor: filter === f ? t.accentBg : t.cardBg,
                borderColor: filter === f ? t.accent : t.cardBorder,
              }]}>
              <Text style={[styles.filterText, { color: filter === f ? t.accent : t.textMuted }]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!loading && (
          <Text style={[styles.resultCount, { color: t.textMuted }]}>{results.length} results</Text>
        )}

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, paddingHorizontal: 20 }}>
            {results.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={[styles.emptyText, { color: t.textMuted }]}>No hospitals found.</Text>
              </View>
            )}
            {results.map(h => (
              <HospitalCard key={h.id} hospital={h}
                onPress={() => navigation.navigate('HospitalProfile', { hospital: h })} />
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  container:    { flex: 1 },
  title:        { fontSize: 20, fontWeight: '800', letterSpacing: -0.8, marginBottom: 14, paddingHorizontal: 20, paddingTop: 16 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12, borderWidth: 1, marginHorizontal: 20 },
  input:        { flex: 1, fontSize: 13 },
  filterScroll: { marginHorizontal: -20, marginBottom: 12, flexGrow: 0, height: 38 },
  filterPill:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 1, alignSelf: 'center' },
  filterText:   { fontSize: 11, fontWeight: '600' },
  resultCount:  { fontSize: 11, marginBottom: 10, paddingHorizontal: 20 },
  emptyText:    { fontSize: 13 },
})
