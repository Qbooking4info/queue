// Results for one specialty (from SpecialtyBrowseScreen), with a switch
// between hospitals that officially offer it (hospital_specialties) and
// independent doctors who specialise in it (doctor_profiles.specialty_id).
import { useEffect, useState, useCallback } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useLocation, distanceKm } from '@queue/shared/contexts/LocationContext'
import { getHospitals, searchIndependentDoctors, type IndependentDoctor } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import { HospitalCard } from '@queue/shared/components/hospital/HospitalCard'
import { DoctorListItem } from '@queue/shared/components/doctor/DoctorListItem'
import { haptics } from '@queue/shared/lib/haptics'
import { Screen, AppBar, Body, Card, Hair, Seg, Empty } from '@queue/shared/components/q'

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
      setDoctors(await searchIndependentDoctors({ specialtyId }))
    }
    setLoading(false)
  }, [mode, specialtyId])

  useEffect(() => { load() }, [load])

  const km = (h: DisplayHospital) =>
    coords && h.latitude != null && h.longitude != null
      ? distanceKm(coords, { latitude: h.latitude, longitude: h.longitude })
      : null

  const count = mode === 'hospitals' ? hospitals.length : doctors.length

  return (
    <Screen>
      <AppBar
        title={specialtyName}
        sub={loading ? undefined : `${count} ${mode === 'hospitals' ? (count === 1 ? 'hospital' : 'hospitals') : (count === 1 ? 'doctor' : 'doctors')}`}
        onBack={() => navigation.goBack()}
      />
      <Seg<Mode>
        value={mode} onChange={m => { haptics.tap(); setMode(m) }}
        options={[{ key: 'hospitals', label: 'Hospitals' }, { key: 'doctors', label: 'Independent doctors' }]}
      />

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <Body>
          <View style={{ height: 8 }} />
          {mode === 'hospitals' ? (
            hospitals.length === 0 ? (
              <Card>
                <Empty icon="business-outline" title="No hospitals list this yet"
                  body={`No hospital currently offers ${specialtyName}. Independent doctors may still take you — try the other tab.`}
                  action="See independent doctors" onAction={() => setMode('doctors')} />
              </Card>
            ) : (
              <Card>
                {hospitals.map((h, i) => (
                  <View key={String(h.id)}>
                    {i > 0 && <Hair />}
                    <HospitalCard hospital={h} distanceKm={km(h)}
                      onPress={() => { haptics.tap(); navigation.navigate('HospitalProfile', { hospital: h }) }} />
                  </View>
                ))}
              </Card>
            )
          ) : doctors.length === 0 ? (
            <Card>
              <Empty icon="medkit-outline" title="No independent doctors yet"
                body={`No independent doctor currently lists ${specialtyName}. Hospitals run their own ${specialtyName.toLowerCase()} clinics — try the other tab.`}
                action="See hospitals" onAction={() => setMode('hospitals')} />
            </Card>
          ) : (
            <>
              <Card>
                {doctors.map((d, i) => (
                  <View key={d.userId}>
                    {i > 0 && <Hair />}
                    <DoctorListItem doctor={d}
                      onPress={() => { haptics.tap(); navigation.navigate('DoctorProfile', { userId: d.userId }) }} />
                  </View>
                ))}
              </Card>
              <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
                <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
                  That is everyone. Independent doctors who list {specialtyName.toLowerCase()}; hospitals have
                  their own clinics in the other tab.
                </Text>
              </View>
            </>
          )}
        </Body>
      )}
    </Screen>
  )
}
