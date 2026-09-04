// Results for one specialty (from SpecialtyBrowseScreen), with a toggle
// between hospitals that officially offer it (hospital_specialties) and
// independent doctors who specialize in it and accept direct bookings
// (doctor_profiles.specialty_id). Two different data sources/audiences under
// one specialty-scoped view, per the user's ask: pick a specialty, see
// hospitals, optionally toggle to doctors instead.
import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useLocation, distanceKm, formatDistance } from '@queue/shared/contexts/LocationContext'
import { getHospitals, searchIndependentDoctors, IndependentDoctor } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import { HospitalCard } from '@queue/shared/components/hospital/HospitalCard'
import { DoctorListItem } from '@queue/shared/components/doctor/DoctorListItem'
import { haptics } from '@queue/shared/lib/haptics'

interface Props { navigation: any; route: any }

type Mode = 'hospitals' | 'doctors'

export function SpecialtyResultsScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { coords } = useLocation()
  const { specialtyId, specialtyName } = route.params as { specialtyId: string; specialtyName: string }

  const [mode, setMode] = useState<Mode>('hospitals')
  const [loading, setLoading] = useState(true)
  const [hospitals, setHospitals] = useState<DisplayHospital[]>([])
  const [doctors, setDoctors] = useState<IndependentDoctor[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    if (mode === 'hospitals') {
      const raw = await getHospitals(undefined, { specialtyId })
      setHospitals(raw.map(toDisplayHospital))
    } else {
      const results = await searchIndependentDoctors({ specialtyId })
      setDoctors(results)
    }
    setLoading(false)
  }, [mode, specialtyId])

  useEffect(() => { load() }, [load])

  const withDistance = hospitals.map(h => {
    if (!coords || h.latitude == null || h.longitude == null) return h
    const km = distanceKm(coords, { latitude: h.latitude!, longitude: h.longitude! })
    return { ...h, distance: formatDistance(km) }
  })

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" style={{ marginRight: 10 }}>
          <Ionicons name="arrow-back" size={20} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>{specialtyName}</Text>
      </View>

      <View style={[st.toggle, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
        {(['hospitals', 'doctors'] as Mode[]).map(m => (
          <TouchableOpacity key={m} onPress={() => { haptics.tap(); setMode(m) }}
            style={[st.toggleBtn, mode === m && { backgroundColor: t.accentBg }]}>
            <Ionicons name={m === 'hospitals' ? 'business-outline' : 'medkit-outline'} size={14}
              color={mode === m ? t.accent : t.textMuted} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: mode === m ? t.accent : t.textMuted }}>
              {m === 'hospitals' ? 'Hospitals' : 'Independent Doctors'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : mode === 'hospitals' ? (
        withDistance.length === 0 ? (
          <Empty theme={t} icon="business-outline" title="No hospitals found"
            sub={`No hospitals currently list ${specialtyName} as a specialty.`} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
            {withDistance.map(h => (
              <HospitalCard key={String(h.id)} hospital={h}
                onPress={() => { haptics.tap(); navigation.navigate('HospitalProfile', { hospital: h }) }} />
            ))}
          </ScrollView>
        )
      ) : doctors.length === 0 ? (
        <Empty theme={t} icon="medkit-outline" title="No independent doctors found"
          sub={`No independent doctors currently list ${specialtyName} and accept direct bookings.`} />
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

function Empty({ theme: t, icon, title, sub }: { theme: any; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }) {
  return (
    <View style={st.empty}>
      <Ionicons name={icon} size={44} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
      <Text style={[st.emptyTitle, { color: t.textPrimary }]}>{title}</Text>
      <Text style={[st.emptySub, { color: t.textMuted }]}>{sub}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  safe:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title:      { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  toggle:     { flexDirection: 'row', marginHorizontal: 20, borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginBottom: 16 },
  toggleBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9 },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  emptySub:   { fontSize: 12, textAlign: 'center' },
})
