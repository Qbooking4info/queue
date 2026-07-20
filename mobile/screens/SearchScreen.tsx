import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native'
import { HospitalsMap } from '../components/map/HospitalsMap'
import { useTheme } from '../contexts/ThemeContext'
import { useLocation, distanceKm, formatDistance } from '../contexts/LocationContext'
import { HospitalCard } from '../components/hospital/HospitalCard'
import type { DisplayHospital } from '../components/hospital/HospitalCard'
import { getHospitals } from '../lib/api'
import { toDisplayHospital } from '../lib/adapters'

const FILTERS = ['All', 'Virtual', 'Open Now', 'HMO Accepted', 'Emergency']

interface Props { navigation: any }

export function SearchScreen({ navigation }: Props) {
  const { theme: t }          = useTheme()
  const { coords, request }   = useLocation()
  const [q, setQ]             = useState('')
  const [filter, setFilter]   = useState('All')
  const [all, setAll]         = useState<DisplayHospital[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')

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

  // Enrich distance field from GPS coords
  const withDistance = all.map(h => {
    if (!coords || h.latitude == null || h.longitude == null) return h
    const km = distanceKm(coords, { latitude: h.latitude!, longitude: h.longitude! })
    return { ...h, distance: formatDistance(km), _km: km }
  })

  const results = (withDistance as (DisplayHospital & { _km?: number })[])
    .filter(h => {
      const matchesQuery = !q.trim() ||
        h.name.toLowerCase().includes(q.toLowerCase()) ||
        h.specialty.toLowerCase().includes(q.toLowerCase()) ||
        h.services.some(s => s.toLowerCase().includes(q.toLowerCase()))
      const matchesFilter =
        filter === 'All'          ? true :
        filter === 'Virtual'      ? h.virtual :
        filter === 'Open Now'     ? h.tagType === 'open' :
        filter === 'HMO Accepted' ? (h.hmo ?? []).length > 0 :
        filter === 'Emergency'    ? (h.emergencySlots ?? 0) > 0 : true
      return matchesQuery && matchesFilter
    })
    .sort((a, b) => (a._km ?? Infinity) - (b._km ?? Infinity))

  // Hospitals with coordinates for the map view
  const mappable = results.filter(h => h.latitude != null && h.longitude != null)
  const mapCenter = coords
    ? { latitude: coords.latitude, longitude: coords.longitude }
    : mappable.length > 0
      ? { latitude: mappable[0].latitude!, longitude: mappable[0].longitude! }
      : { latitude: 6.5244, longitude: 3.3792 } // Lagos default

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

        {/* Filter chips + list/map toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, height: 38 }}
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

          <View style={[styles.viewToggle, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <TouchableOpacity onPress={() => setViewMode('list')}
              style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: t.accentBg }]}>
              <Text style={{ fontSize: 15, color: viewMode === 'list' ? t.accent : t.textMuted }}>≡</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('map')}
              style={[styles.toggleBtn, viewMode === 'map' && { backgroundColor: t.accentBg }]}>
              <Text style={{ fontSize: 13, color: viewMode === 'map' ? t.accent : t.textMuted }}>🗺</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!loading && (
          <Text style={[styles.resultCount, { color: t.textMuted }]}>{results.length} results</Text>
        )}

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
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
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={[styles.emptyText, { color: t.textMuted }]}>No hospitals found.</Text>
              </View>
            )}
            {results.map(h => (
              <HospitalCard key={String(h.id)} hospital={h}
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
  safe:        { flex: 1 },
  container:   { flex: 1 },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.8, marginBottom: 14, paddingHorizontal: 20, paddingTop: 16 },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12, borderWidth: 1, marginHorizontal: 20 },
  input:       { flex: 1, fontSize: 13 },
  filterPill:  { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 1, alignSelf: 'center' },
  filterText:  { fontSize: 11, fontWeight: '600' },
  resultCount: { fontSize: 11, marginBottom: 10, paddingHorizontal: 20 },
  emptyText:   { fontSize: 13 },
  viewToggle:  { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden', marginRight: 20 },
  toggleBtn:   { paddingHorizontal: 10, paddingVertical: 6 },
})
