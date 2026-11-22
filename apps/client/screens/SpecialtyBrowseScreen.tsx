// Real, DB-backed specialty picker -- distinct from the static local array in
// data/index.ts. This one uses the real specialties.id, so results come from a
// server-side ID filter rather than a fuzzy name match.
import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { getSpecialties, type SpecialtyRow } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { Screen, AppBar, Body, Card, Row, Hair, SearchField, Empty } from '@queue/shared/components/q'

interface Props { navigation: any }

export function SpecialtyBrowseScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  /** doctors per specialty id. The handoff prints a count under each row; this
   *  is the one count we can state truthfully from a single query. */
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    getSpecialties().then(list => { setSpecialties(list); setLoading(false) })
    supabase.from('doctors').select('specialty_id').eq('is_active', true).then(({ data }) => {
      const tally: Record<string, number> = {}
      for (const d of (data ?? []) as { specialty_id: string | null }[]) {
        if (d.specialty_id) tally[d.specialty_id] = (tally[d.specialty_id] ?? 0) + 1
      }
      setCounts(tally)
    })
  }, [])

  const needle = q.trim().toLowerCase()
  const filtered = specialties.filter(s => !needle || s.name.toLowerCase().includes(needle))

  return (
    <Screen>
      <AppBar title="Browse by specialty" onBack={() => navigation.goBack()} />
      <SearchField value={q} onChangeText={setQ} placeholder="Search specialties…" />

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <Body>
          <View style={{ height: 6 }} />
          {filtered.length === 0 ? (
            <Card>
              <Empty icon="search-outline" title="No specialty matches that"
                body="Try a shorter word, or clear the search to see all of them." />
            </Card>
          ) : (
            <Card>
              {filtered.map((s, i) => {
                const n = counts[s.id]
                return (
                  <View key={s.id}>
                    {i > 0 && <Hair />}
                    <Row
                      leading={
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.q.sel, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 18 }}>{s.icon ?? '🩺'}</Text>
                        </View>
                      }
                      title={s.name}
                      sub={n ? `${n} ${n === 1 ? 'doctor' : 'doctors'}` : null}
                      chevron
                      onPress={() => {
                        haptics.tap()
                        navigation.navigate('SpecialtyResults', { specialtyId: s.id, specialtyName: s.name })
                      }}
                    />
                  </View>
                )
              })}
            </Card>
          )}
        </Body>
      )}
    </Screen>
  )
}
