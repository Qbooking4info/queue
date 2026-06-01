import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'
import { HospitalCard } from '../components/hospital/HospitalCard'

interface Hospital {
  id: string; name: string; type: string; city: string; state: string
  avg_rating: number; review_count: number; accepts_virtual: boolean; is_verified: boolean
  hospital_specialties: { specialties: { name: string; icon: string | null } | null }[]
}

interface Specialty { id: string; name: string; icon: string | null; slug: string }

export function HomeScreen({ navigation }: { navigation: any }) {
  const [hospitals, setHospitals]   = useState<Hospital[]>([])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('hospitals').select(`id,name,type,city,state,avg_rating,review_count,accepts_virtual,is_verified,hospital_specialties(specialties(name,icon))`).eq('is_active', true).order('avg_rating', { ascending: false }).limit(10),
      supabase.from('specialties').select('id,name,icon,slug').eq('is_active', true).order('sort_order').limit(8),
    ]).then(([{ data: h }, { data: s }]) => {
      setHospitals((h as Hospital[]) ?? [])
      setSpecialties((s as Specialty[]) ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning 👋' : h < 17 ? 'Good afternoon 👋' : 'Good evening 👋' })()}</Text>
            <Text style={styles.headline}>Find care near you</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.searchBar} onPress={() => navigation.navigate('Search')}>
          <Text style={{ fontSize: 16, color: t.textMuted }}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search hospitals, doctors, specialties…</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Specialties</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          {specialties.map(s => (
            <TouchableOpacity key={s.id} style={styles.specialtyChip}
              onPress={() => navigation.navigate('Search', { initialQuery: s.name })}>
              <Text style={{ fontSize: 22 }}>{s.icon}</Text>
              <Text style={styles.specialtyLabel}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Nearby Hospitals</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Search')}>
            <Text style={{ fontSize: font.sm, color: t.accent }}>See all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <Text style={styles.loadingText}>Loading…</Text>
        ) : (
          hospitals.map(h => (
            <HospitalCard key={h.id} hospital={h} onPress={() => navigation.navigate('HospitalProfile', { hospital: h })} />
          ))
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: t.bg },
  scroll:             { flex: 1, paddingHorizontal: spacing.xl },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: spacing.lg, marginBottom: spacing.xl },
  greeting:           { fontSize: font.sm, color: t.textSub },
  headline:           { fontSize: font.xl, fontWeight: '800', color: t.text, letterSpacing: -0.5, marginTop: 2 },
  notifBtn:           { width: 40, height: 40, borderRadius: 12, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  notifDot:           { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent },
  searchBar:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderMed, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, marginBottom: spacing.xl },
  searchPlaceholder:  { fontSize: font.base, color: t.textMuted },
  sectionLabel:       { fontSize: font.xs, fontWeight: '700', color: t.textSub, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.md },
  sectionRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, marginTop: spacing.xl },
  specialtyChip:      { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', gap: 5 },
  specialtyLabel:     { fontSize: 10, color: t.textSub, fontWeight: '600' },
  loadingText:        { color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
})
