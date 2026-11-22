// Doctor-first discovery -- separate from SearchScreen, which searches
// hospitals. Shows every registered, active doctor, not just ones accepting
// direct (no-hospital) bookings: a doctor who has not opted into that still
// appears with their hospital affiliation, just without a direct-booking CTA
// on their profile. The filter chips narrow to doctors who opted into that
// direct-booking type.
import { useState, useEffect, useCallback } from 'react'
import { View, ActivityIndicator, ScrollView } from 'react-native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { searchIndependentDoctors, type IndependentDoctor } from '@queue/shared/lib/api'
import { DoctorListItem } from '@queue/shared/components/doctor/DoctorListItem'
import { haptics } from '@queue/shared/lib/haptics'
import { Screen, AppBar, Body, Card, Hair, Chip, SearchField, Empty } from '@queue/shared/components/q'

interface Props { navigation: any; route?: any }

type VisitFilter = 'all' | 'virtual' | 'home_visit'

const FILTERS: { key: VisitFilter; label: string }[] = [
  { key: 'all', label: 'All doctors' },
  { key: 'virtual', label: 'Sees patients online' },
  { key: 'home_visit', label: 'Does home visits' },
]

export function DoctorSearchScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const specialtyId: string | undefined = route?.params?.specialtyId
  const specialtyName: string | undefined = route?.params?.specialtyName

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<VisitFilter>(route?.params?.initialFilter ?? 'all')
  const [doctors, setDoctors] = useState<IndependentDoctor[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setDoctors(await searchIndependentDoctors({
      q: q.trim() || undefined,
      visitType: filter === 'all' ? undefined : filter,
      specialtyId,
    }))
    setLoading(false)
  }, [q, filter, specialtyId])

  useEffect(() => {
    const id = setTimeout(load, 300) // debounce typing
    return () => clearTimeout(id)
  }, [load])

  return (
    <Screen>
      <AppBar title={specialtyName ? `${specialtyName} doctors` : 'Find a doctor'} onBack={() => navigation.goBack()} />
      <SearchField value={q} onChangeText={setQ} placeholder="Doctor name or specialty…" />

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}
        style={{ flexGrow: 0 }}>
        {FILTERS.map(f => (
          <Chip key={f.key} label={f.label} on={filter === f.key}
            onPress={() => { haptics.tap(); setFilter(f.key) }} />
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <Body>
          {doctors.length === 0 ? (
            <Card>
              <Empty
                icon="medkit-outline"
                title="No doctors match that"
                body={filter === 'all'
                  ? 'Try a shorter search, or browse by specialty instead.'
                  : 'Try a specialty instead, or clear the filter.'}
                action={filter === 'all' ? 'Browse by specialty' : 'Clear the filter'}
                onAction={() => filter === 'all' ? navigation.navigate('SpecialtyBrowse') : setFilter('all')}
              />
            </Card>
          ) : (
            <Card>
              {doctors.map((d, i) => (
                <View key={d.userId}>
                  {i > 0 && <Hair />}
                  <DoctorListItem doctor={d}
                    onPress={() => { haptics.tap(); navigation.navigate('DoctorProfile', { userId: d.userId }) }} />
                </View>
              ))}
            </Card>
          )}
        </Body>
      )}
    </Screen>
  )
}
