import { useState } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { HospitalCard } from '../components/hospital/HospitalCard'
import { hospitals } from '../data'

const FILTERS = ['All', 'Virtual', 'Open Now', 'HMO Accepted', 'Emergency']

interface Props { navigation: any }

export function SearchScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('All')

  const results = hospitals.filter(h =>
    h.name.toLowerCase().includes(q.toLowerCase()) ||
    h.specialty.toLowerCase().includes(q.toLowerCase()) ||
    h.services.some(s => s.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <View style={[styles.container, { backgroundColor: t.canvasBg }]}>
        <Text style={[styles.title, { color: t.textPrimary }]}>Find care</Text>

        {/* Search input */}
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

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.filterScroll} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
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

        <Text style={[styles.resultCount, { color: t.textMuted }]}>{results.length} results · Lagos Island</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, paddingHorizontal: 20 }}>
          {results.map(h => (
            <HospitalCard key={h.id} hospital={h} onPress={() => navigation.navigate('HospitalProfile', { hospital: h })} />
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  container:   { flex: 1 },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.8, marginBottom: 14, paddingHorizontal: 20, paddingTop: 16 },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12, borderWidth: 1, marginHorizontal: 20 },
  input:       { flex: 1, fontSize: 13, fontFamily: undefined },
  filterScroll:{ marginHorizontal: -20, marginBottom: 12 },
  filterPill:  { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  filterText:  { fontSize: 11, fontWeight: '600' },
  resultCount: { fontSize: 11, marginBottom: 10, paddingHorizontal: 20 },
})
