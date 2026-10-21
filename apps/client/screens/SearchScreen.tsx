import { useState, useEffect, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { HospitalsMap } from '@queue/shared/components/map/HospitalsMap'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useLocation, distanceKm, formatDistance } from '@queue/shared/contexts/LocationContext'
import { HospitalCard } from '@queue/shared/components/hospital/HospitalCard'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import { DoctorListItem } from '@queue/shared/components/doctor/DoctorListItem'
import { Dropdown, type DropdownOption } from '@queue/shared/components/ui/Dropdown'
import { getHospitals, searchIndependentDoctors, type IndependentDoctor } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { haptics } from '@queue/shared/lib/haptics'
import { Header } from '@queue/shared/components/ui/v3'

type Mode = 'hospitals' | 'doctors'
type HospitalFilter = 'all' | 'virtual' | 'open' | 'hmo' | 'emergency'
type DoctorFilter   = 'all' | 'virtual' | 'home_visit'

// One dropdown replaces the old row of filter pills. The options differ by
// side, because they are not the same question: a hospital can be "open now"
// or take HMO, neither of which means anything for an independent doctor.
const HOSPITAL_FILTERS: DropdownOption<HospitalFilter>[] = [
  { key: 'all',       label: 'All hospitals' },
  { key: 'virtual',   label: 'Offers virtual care' },
  { key: 'open',      label: 'Open now' },
  { key: 'hmo',       label: 'Accepts HMO' },
  { key: 'emergency', label: 'Emergency slots' },
]

const DOCTOR_FILTERS: DropdownOption<DoctorFilter>[] = [
  { key: 'all',        label: 'All doctors' },
  { key: 'virtual',    label: 'Sees patients online' },
  { key: 'home_visit', label: 'Does home visits' },
]

interface Props { navigation: any }

export function SearchScreen({ navigation }: Props) {
  const { theme: t }        = useTheme()
  const { coords, request } = useLocation()

  const [mode, setMode] = useState<Mode>('hospitals')
  const [q, setQ]       = useState('')
  const [hFilter, setHFilter] = useState<HospitalFilter>('all')
  const [dFilter, setDFilter] = useState<DoctorFilter>('all')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')

  const [all, setAll]         = useState<DisplayHospital[]>([])
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

  // Doctors are fetched server-side so the visit-type filter and the query are
  // applied by the same route the specialty flow uses, rather than reimplemented
  // here against a half-loaded list.
  useEffect(() => {
    if (mode !== 'doctors') return
    let cancelled = false
    setDocLoading(true)
    searchIndependentDoctors({
      q: q.trim() || undefined,
      visitType: dFilter === 'all' ? undefined : dFilter,
    })
      .then(res => { if (!cancelled) setDoctors(res) })
      .finally(() => { if (!cancelled) setDocLoading(false) })
    return () => { cancelled = true }
  }, [mode, q, dFilter])

  // Distance from GPS, used both for the label and for the sort below.
  const withDistance = all.map(h => {
    if (!coords || h.latitude == null || h.longitude == null) return h
    const km = distanceKm(coords, { latitude: h.latitude!, longitude: h.longitude! })
    return { ...h, distance: formatDistance(km), _km: km }
  })

  const results = (withDistance as (DisplayHospital & { _km?: number })[])
    .filter(h => {
      const needle = q.trim().toLowerCase()
      const matchesQuery = !needle ||
        h.name.toLowerCase().includes(needle) ||
        h.specialty.toLowerCase().includes(needle) ||
        h.services.some(s => s.toLowerCase().includes(needle))
      const matchesFilter =
        hFilter === 'all'       ? true :
        hFilter === 'virtual'   ? h.virtual :
        hFilter === 'open'      ? h.tagType === 'open' :
        hFilter === 'hmo'       ? (h.hmo ?? []).length > 0 :
        hFilter === 'emergency' ? (h.emergencySlots ?? 0) > 0 : true
      return matchesQuery && matchesFilter
    })
    // Nearest first. Hospitals with no coordinates sort last rather than being
    // dropped -- a hospital missing a lat/lng is still somewhere you can go.
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
      : { latitude: 6.5244, longitude: 3.3792 } // Lagos default

  const showingHospitals = mode === 'hospitals'
  const count = showingHospitals ? results.length : doctors.length

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <Header title="Find care" onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />
      <View style={[styles.container, { backgroundColor: t.canvasBg }]}>

        <View style={[styles.inputWrap, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Ionicons name="search-outline" size={15} color={t.textMuted} />
          <TextInput
            value={q} onChangeText={setQ}
            placeholder={showingHospitals ? 'Hospital, specialty, service…' : 'Doctor name or specialty…'}
            placeholderTextColor={t.textMuted}
            style={[styles.input, { color: t.textPrimary }]}
          />
          {!!q && (
            <TouchableOpacity onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color={t.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('SpecialtyBrowse') }}
          accessibilityRole="button"
          style={[styles.specialtyBanner, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Ionicons name="grid-outline" size={15} color={t.accent} />
          <Text style={[styles.specialtyBannerText, { color: t.textPrimary }]}>Browse by Specialty</Text>
          <Text style={{ color: t.accent, fontSize: 16, marginLeft: 'auto' }}>›</Text>
        </TouchableOpacity>

        {/* Hospitals / Independent Doctors -- the same split the specialty
            results screen uses, lifted up here so it applies to the whole
            Find care page rather than only after picking a specialty. */}
        <View style={[styles.toggle, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {(['hospitals', 'doctors'] as Mode[]).map(m => (
            <TouchableOpacity key={m} onPress={() => { haptics.tap(); setMode(m) }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              style={[styles.toggleTab, mode === m && { backgroundColor: t.accentBg }]}>
              <Ionicons name={m === 'hospitals' ? 'business-outline' : 'medkit-outline'} size={14}
                color={mode === m ? t.accent : t.textMuted} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: mode === m ? t.accent : t.textMuted }}>
                {m === 'hospitals' ? 'Hospitals' : 'Independent Doctors'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.controlRow}>
          {showingHospitals ? (
            <Dropdown<HospitalFilter>
              label="Filter hospitals" icon="filter-outline"
              value={hFilter} options={HOSPITAL_FILTERS} onChange={setHFilter}
              style={{ flex: 1 }}
            />
          ) : (
            <Dropdown<DoctorFilter>
              label="Filter doctors" icon="filter-outline"
              value={dFilter} options={DOCTOR_FILTERS} onChange={setDFilter}
              style={{ flex: 1 }}
            />
          )}

          {/* Map is hospitals-only: independent doctors carry no coordinates,
              so a map of them would always be empty. */}
          {showingHospitals && (
            <View style={[styles.viewToggle, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <TouchableOpacity onPress={() => setViewMode('list')}
                accessibilityLabel="List view" accessibilityState={{ selected: viewMode === 'list' }}
                style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: t.accentBg }]}>
                <Ionicons name="list-outline" size={15} color={viewMode === 'list' ? t.accent : t.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setViewMode('map')}
                accessibilityLabel="Map view" accessibilityState={{ selected: viewMode === 'map' }}
                style={[styles.toggleBtn, viewMode === 'map' && { backgroundColor: t.accentBg }]}>
                <Ionicons name="map-outline" size={15} color={viewMode === 'map' ? t.accent : t.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {!(loading || docLoading) && (
          <Text style={[styles.resultCount, { color: t.textMuted }]}>
            {count} {showingHospitals
              ? `hospital${count === 1 ? '' : 's'}${coords ? ', nearest first' : ''}`
              : `doctor${count === 1 ? '' : 's'}`}
          </Text>
        )}

        {showingHospitals ? (
          loading ? (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, paddingHorizontal: 20 }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </ScrollView>
          ) : viewMode === 'map' ? (
            <HospitalsMap
              style={{ flex: 1, borderRadius: 16, marginHorizontal: 20, marginBottom: 16 }}
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
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, paddingHorizontal: 20 }}>
              {results.length === 0 && (
                <Empty theme={t} icon="business-outline" title="No hospitals found"
                  sub={q.trim() ? `Nothing matches “${q.trim()}”.` : 'Try a different filter.'} />
              )}
              {results.map(h => (
                <HospitalCard key={String(h.id)} hospital={h}
                  onPress={() => { haptics.tap(); navigation.navigate('HospitalProfile', { hospital: h }) }} />
              ))}
              <View style={{ height: 32 }} />
            </ScrollView>
          )
        ) : docLoading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {doctors.length === 0 && (
              <Empty theme={t} icon="medkit-outline" title="No independent doctors found"
                sub={q.trim() ? `Nothing matches “${q.trim()}”.` : 'No doctors currently accept direct bookings with that filter.'} />
            )}
            {doctors.map(d => (
              <DoctorListItem key={d.userId} doctor={d}
                onPress={() => { haptics.tap(); navigation.navigate('DoctorProfile', { userId: d.userId }) }} />
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  )
}

function Empty({ theme: t, icon, title, sub }: {
  theme: any; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 }}>
      <Ionicons name={icon} size={34} color={t.textMuted} style={{ opacity: 0.5 }} />
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{title}</Text>
      <Text style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', lineHeight: 19 }}>{sub}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  container: { flex: 1 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12, borderWidth: 1, marginHorizontal: 20,
  },
  input: { flex: 1, fontSize: 13 },
  specialtyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, borderWidth: 1, marginHorizontal: 20,
  },
  specialtyBannerText: { fontSize: 13, fontWeight: '700' },
  toggle: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 12,
    borderRadius: 12, borderWidth: 1, overflow: 'hidden',
  },
  toggleTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11,
  },
  controlRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginBottom: 12,
  },
  viewToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  toggleBtn:  { paddingHorizontal: 10, paddingVertical: 8 },
  resultCount: { fontSize: 11, marginBottom: 10, paddingHorizontal: 20 },
})
