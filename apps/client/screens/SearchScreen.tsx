import { useState, useEffect, useCallback } from 'react'
import { View, ScrollView, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { HospitalsMap } from '@queue/shared/components/map/HospitalsMap'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useLocation, distanceKm } from '@queue/shared/contexts/LocationContext'
import { HospitalCard, type DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import { DoctorListItem } from '@queue/shared/components/doctor/DoctorListItem'
import { getHospitals, searchIndependentDoctors, type IndependentDoctor } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Hair, Seg, Chip, SearchField, IconBtn, Row, Empty,
} from '@queue/shared/components/q'

type Mode = 'hospitals' | 'doctors'
type HospitalFilter = 'virtual' | 'open' | 'hmo' | 'emergency'
type DoctorFilter = 'virtual' | 'home_visit'

// The two sides are not asking the same question: a hospital can be "open now"
// or take HMO, neither of which means anything for an independent doctor.
const HOSPITAL_CHIPS: { key: HospitalFilter; label: string }[] = [
  { key: 'open', label: 'Open now' },
  { key: 'virtual', label: 'Offers virtual care' },
  { key: 'hmo', label: 'Accepts HMO' },
  { key: 'emergency', label: 'Emergency slots' },
]

const DOCTOR_CHIPS: { key: DoctorFilter; label: string }[] = [
  { key: 'virtual', label: 'Sees patients online' },
  { key: 'home_visit', label: 'Does home visits' },
]

interface Props { navigation: any }

export function SearchScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { coords, request } = useLocation()

  const [mode, setMode] = useState<Mode>('hospitals')
  const [q, setQ] = useState('')
  const [hFilter, setHFilter] = useState<HospitalFilter | null>(null)
  const [dFilter, setDFilter] = useState<DoctorFilter | null>(null)
  const [showMap, setShowMap] = useState(false)

  const [all, setAll] = useState<DisplayHospital[]>([])
  const [doctors, setDoctors] = useState<IndependentDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await getHospitals()
      setAll(raw.map(toDisplayHospital))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!coords) request() }, [])

  // Doctors are fetched server-side so the visit-type filter and the query go
  // through the same route the specialty flow uses, rather than being
  // reimplemented here against a half-loaded list.
  useEffect(() => {
    if (mode !== 'doctors') return
    let cancelled = false
    setDocLoading(true)
    searchIndependentDoctors({
      q: q.trim() || undefined,
      visitType: dFilter ?? undefined,
    })
      .then(res => { if (!cancelled) setDoctors(res) })
      .finally(() => { if (!cancelled) setDocLoading(false) })
    return () => { cancelled = true }
  }, [mode, q, dFilter])

  const km = (h: DisplayHospital) =>
    coords && h.latitude != null && h.longitude != null
      ? distanceKm(coords, { latitude: h.latitude, longitude: h.longitude })
      : null

  const results = all
    .map(h => ({ ...h, _km: km(h) }))
    .filter(h => {
      const needle = q.trim().toLowerCase()
      const matchesQuery = !needle ||
        h.name.toLowerCase().includes(needle) ||
        h.specialty.toLowerCase().includes(needle) ||
        h.services.some(s => s.toLowerCase().includes(needle))
      const matchesFilter =
        hFilter == null ? true :
        hFilter === 'virtual' ? h.virtual :
        hFilter === 'open' ? h.tagType === 'open' :
        hFilter === 'hmo' ? (h.hmo ?? []).length > 0 :
        hFilter === 'emergency' ? (h.emergencySlots ?? 0) > 0 : true
      return matchesQuery && matchesFilter
    })
    // Nearest first. A hospital with no coordinates sorts last rather than
    // being dropped -- it is still somewhere you can go.
    .sort((a, b) => {
      if (a._km != null && b._km != null) return a._km - b._km
      if (a._km != null) return -1
      if (b._km != null) return 1
      return a.name.localeCompare(b.name)
    })

  const mappable = results.filter(h => h.latitude != null && h.longitude != null)
  const mapCenter = coords
    ? { latitude: coords.latitude, longitude: coords.longitude }
    : mappable.length > 0
      ? { latitude: mappable[0].latitude!, longitude: mappable[0].longitude! }
      : { latitude: 6.5244, longitude: 3.3792 } // Lagos

  const showingHospitals = mode === 'hospitals'
  const count = showingHospitals ? results.length : doctors.length
  // The map only means something for hospitals: independent doctors carry no
  // coordinates, so a map of them is always empty.
  const mapping = showingHospitals && showMap

  return (
    <Screen>
      <AppBar
        large title="Find care"
        right={showingHospitals
          ? <IconBtn
              name={mapping ? 'list-outline' : 'map-outline'}
              label={mapping ? 'Show the list' : 'Show the map'}
              onPress={() => { haptics.tap(); setShowMap(m => !m) }}
            />
          : undefined}
      />

      <SearchField
        value={q} onChangeText={setQ}
        placeholder={showingHospitals ? 'Search hospitals or doctors' : 'Doctor name or specialty…'}
      />

      <Seg<Mode>
        value={mode} onChange={m => { haptics.tap(); setMode(m) }}
        options={[{ key: 'hospitals', label: 'Hospitals' }, { key: 'doctors', label: 'Doctors' }]}
      />

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
        style={{ flexGrow: 0 }}>
        {showingHospitals
          ? HOSPITAL_CHIPS.map(c => (
              <Chip key={c.key} label={c.label} on={hFilter === c.key}
                onPress={() => { haptics.tap(); setHFilter(f => f === c.key ? null : c.key) }} />
            ))
          : DOCTOR_CHIPS.map(c => (
              <Chip key={c.key} label={c.label} on={dFilter === c.key}
                onPress={() => { haptics.tap(); setDFilter(f => f === c.key ? null : c.key) }} />
            ))}
      </ScrollView>

      {mapping ? (
        <HospitalsMap
          style={{ flex: 1, borderRadius: 16, marginHorizontal: 16, marginBottom: 16 }}
          initialRegion={{ ...mapCenter, latitudeDelta: 0.15, longitudeDelta: 0.15 }}
          showsUserLocation={!!coords}
          markers={mappable.map(h => ({
            id: String(h.id), latitude: h.latitude!, longitude: h.longitude!,
            title: h.name, subtitle: h.specialty,
          }))}
          onMarkerPress={id => {
            const h = mappable.find(m => String(m.id) === id)
            if (h) navigation.navigate('HospitalProfile', { hospital: h })
          }}
        />
      ) : (
        <Body>
          {!(loading || docLoading) && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 12, color: t.q.ink60 }}>
                {count} {showingHospitals
                  ? `${count === 1 ? 'hospital' : 'hospitals'}${coords ? ', nearest first' : ''}`
                  : count === 1 ? 'doctor' : 'doctors'}
              </Text>
            </View>
          )}

          {showingHospitals ? (
            loading ? (
              <View style={{ marginHorizontal: 16, gap: 12 }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
            ) : (
              <>
                <Card>
                  <Row icon="grid-outline" title="Browse by specialty"
                    sub="Cardiology, paediatrics, ENT and the rest" chevron
                    onPress={() => { haptics.tap(); navigation.navigate('SpecialtyBrowse') }} />
                </Card>
                <View style={{ height: 12 }} />
                {results.length === 0 ? (
                  <Card>
                    <Empty icon="business-outline" title="No hospitals match that"
                      body={q.trim() ? `Nothing matches “${q.trim()}”.` : 'Try clearing the filter.'}
                      action={hFilter ? 'Clear the filter' : undefined}
                      onAction={() => setHFilter(null)} />
                  </Card>
                ) : (
                  <Card>
                    {results.map((h, i) => (
                      <View key={String(h.id)}>
                        {i > 0 && <Hair />}
                        <HospitalCard hospital={h} distanceKm={h._km}
                          onPress={() => { haptics.tap(); navigation.navigate('HospitalProfile', { hospital: h }) }} />
                      </View>
                    ))}
                  </Card>
                )}
              </>
            )
          ) : docLoading ? (
            <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
          ) : doctors.length === 0 ? (
            <Card>
              <Empty icon="medkit-outline" title="No doctors match that"
                body={q.trim() ? `Nothing matches “${q.trim()}”.` : 'Try a specialty instead, or clear the filter.'}
                action={dFilter ? 'Clear the filter' : 'Browse by specialty'}
                onAction={() => dFilter ? setDFilter(null) : navigation.navigate('SpecialtyBrowse')} />
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
