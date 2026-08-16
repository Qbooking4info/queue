// Real, DB-backed specialty picker -- distinct from HomeScreen's SpecialtyGrid,
// which drives its own static local array (data/index.ts) and filters the
// already-fetched hospital list client-side by name. This one uses the real
// specialties.id, so results (hospitals or doctors) come from a real,
// server-side ID filter rather than a fuzzy name/substring match.
import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { getSpecialties, SpecialtyRow } from '../lib/api'
import { haptics } from '../lib/haptics'

interface Props { navigation: any }

export function SpecialtyBrowseScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    getSpecialties().then(list => { setSpecialties(list); setLoading(false) })
  }, [])

  const filtered = specialties.filter(s => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 10 }}>
          <Ionicons name="arrow-back" size={20} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>Browse by Specialty</Text>
      </View>
      <Text style={[st.sub, { color: t.textMuted }]}>
        Pick a specialty to see hospitals that offer it, or doctors who specialize in it.
      </Text>

      <View style={[st.inputWrap, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
        <Ionicons name="search-outline" size={15} color={t.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search specialties…" placeholderTextColor={t.textMuted}
          style={[st.input, { color: t.textPrimary }]} />
      </View>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={st.grid}>
            {filtered.map(s => (
              <TouchableOpacity key={s.id}
                onPress={() => { haptics.tap(); navigation.navigate('SpecialtyResults', { specialtyId: s.id, specialtyName: s.name }) }}
                style={[st.tile, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={st.icon}>{s.icon ?? '🩺'}</Text>
                <Text numberOfLines={2} style={[st.label, { color: t.textPrimary }]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe:      { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sub:       { fontSize: 12, paddingHorizontal: 20, marginBottom: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 16 },
  input:     { flex: 1, fontSize: 13 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
  tile:      { width: '30%', aspectRatio: 1, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 },
  icon:      { fontSize: 26 },
  label:     { fontSize: 11, fontWeight: '700', textAlign: 'center' },
})
