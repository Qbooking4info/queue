import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, Pressable, Dimensions,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { HospitalCard } from '../components/hospital/HospitalCard'
import { hospitals, specialties } from '../data'
import type { Theme } from '../contexts/ThemeContext'

const SCREEN_H     = Dimensions.get('window').height
const PREVIEW_COUNT = 10
const SURGERY_LABELS = [
  'General Surgery', 'Plastic Surgery', 'Neurosurgery', 'Cardiothoracic',
  'Ortho Surgery', 'Laparoscopic', 'Paediatric Surgery', 'Vascular Surgery',
  'Maxillofacial', 'Endoscopic Surgery',
]

// ── Specialties grid (3-column) used inside the modal ─────────────────────
function SpecialtyGrid({
  items, theme: t, onSelect,
}: { items: typeof specialties; theme: Theme; onSelect: () => void }) {
  const rows: (typeof specialties)[] = []
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3))
  return (
    <>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', marginBottom: 8 }}>
          {row.map(s => (
            <TouchableOpacity key={s.label} onPress={onSelect}
              style={{ flex: 1, margin: 4, borderRadius: 14, paddingVertical: 12,
                paddingHorizontal: 4, alignItems: 'center', gap: 5, borderWidth: 1,
                backgroundColor: t.inputBg, borderColor: t.cardBorder }}>
              <Text style={{ fontSize: 22 }}>{s.icon}</Text>
              <Text style={{ fontSize: 10, fontWeight: '500', textAlign: 'center', color: t.textSecondary }}
                numberOfLines={2}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`pad-${i}`} style={{ flex: 1, margin: 4 }} />
          ))}
        </View>
      ))}
    </>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────
interface Props { navigation: any }

export function HomeScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [showAll, setShowAll] = useState(false)
  const preview = specialties.slice(0, PREVIEW_COUNT)
  const general = specialties.filter(s => !SURGERY_LABELS.includes(s.label))
  const surgery = specialties.filter(s => SURGERY_LABELS.includes(s.label))

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>

      {/* ── All Specialties modal ── */}
      <Modal visible={showAll} animationType="slide" transparent
        onRequestClose={() => setShowAll(false)}>
        <Pressable style={s.overlay} onPress={() => setShowAll(false)} />
        <View style={[s.sheet, { backgroundColor: t.cardBg, maxHeight: SCREEN_H * 0.82 }]}>
          <View style={[s.handle, { backgroundColor: t.inputBorder }]} />
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: t.textPrimary }]}>All Specialties</Text>
            <TouchableOpacity onPress={() => setShowAll(false)}
              style={[s.closeBtn, { backgroundColor: t.inputBg }]}>
              <Text style={{ color: t.textMuted, fontSize: 14, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}>
            <SpecialtyGrid items={general} theme={t} onSelect={() => setShowAll(false)} />
            {/* Surgery section */}
            <View style={[s.dividerRow, { borderTopColor: t.cardBorder }]}>
              <View style={[s.dividerPill, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.dividerText, { color: t.accent }]}>✂️  Surgery Sub-specialties</Text>
              </View>
            </View>
            <SpecialtyGrid items={surgery} theme={t} onSelect={() => setShowAll(false)} />
          </ScrollView>
        </View>
      </Modal>

      {/* ── Main scroll ── */}
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={[s.greeting, { color: t.textMuted }]}>Good morning</Text>
            <Text style={[s.headline, { color: t.textPrimary }]}>Adaeze 👋</Text>
          </View>
          <View style={[s.notifBtn, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
            <Text style={{ fontSize: 18 }}>🔔</Text>
            <View style={[s.notifDot, { backgroundColor: t.accent }]} />
          </View>
        </View>

        {/* Appointment banner */}
        <View style={[s.banner, { backgroundColor: t.bannerBg, borderColor: t.bannerBorder }]}>
          <Text style={[s.bannerLabel, { color: t.accent }]}>NEXT APPOINTMENT</Text>
          <View style={s.bannerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.bannerDoctor}>Dr. Amaka Osei</Text>
              <Text style={[s.bannerSub, { color: 'rgba(255,255,255,0.5)' }]}>
                Cardiology · Lagos Island General
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {['Thu 29 May', '9:00 AM'].map(l => (
                  <View key={l} style={[s.bannerChip, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                    <Text style={[s.bannerChipText, { color: t.accent }]}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>
            <TouchableOpacity style={[s.bannerBtn, { backgroundColor: t.accent }]}>
              <Text style={s.bannerBtnText}>View</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <TouchableOpacity onPress={() => navigation.navigate('Search')}
          style={[s.searchBar, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Text style={{ fontSize: 15, color: t.textMuted }}>🔍</Text>
          <Text style={[s.searchPH, { color: t.textMuted }]}>Search hospitals, doctors, specialties…</Text>
        </TouchableOpacity>

        {/* Emergency CTA */}
        <View style={s.emergency}>
          <Text style={{ fontSize: 22 }}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.emergencyTitle}>Need urgent care?</Text>
            <Text style={[s.emergencySub, { color: 'rgba(255,255,255,0.6)' }]}>
              Emergency slots available · Premium fee applies
            </Text>
          </View>
          <TouchableOpacity style={s.emergencyBtn}>
            <Text style={s.emergencyBtnText}>Book now</Text>
          </TouchableOpacity>
        </View>

        {/* Specialties — preview + More */}
        <Text style={[s.sectionLabel, { color: t.textMuted }]}>Specialties</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.specialtyScroll}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          {preview.map(sp => (
            <TouchableOpacity key={sp.label}
              style={[s.chip, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={{ fontSize: 20 }}>{sp.icon}</Text>
              <Text style={[s.chipLabel, { color: t.textMuted }]}>{sp.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setShowAll(true)}
            style={[s.chip, s.moreChip, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={{ fontSize: 18 }}>＋</Text>
            <Text style={[s.chipLabel, { color: t.accent, fontWeight: '700' }]}>More</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Nearby hospitals */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionLabel, { color: t.textMuted }]}>Nearby hospitals</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Search')}>
            <Text style={[s.seeAll, { color: t.accent }]}>See all →</Text>
          </TouchableOpacity>
        </View>
        {hospitals.slice(0, 3).map(h => (
          <HospitalCard key={h.id} hospital={h}
            onPress={() => navigation.navigate('HospitalProfile', { hospital: h })} />
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:           { flex: 1 },
  scroll:         { flex: 1, paddingHorizontal: 20 },
  // Header
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 16, marginBottom: 18 },
  greeting:       { fontSize: 12, letterSpacing: 0.4 },
  headline:       { fontSize: 22, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  notifBtn:       { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notifDot:       { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  // Banner
  banner:         { borderRadius: 20, padding: 14, marginBottom: 18, borderWidth: 1 },
  bannerLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  bannerRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bannerDoctor:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  bannerSub:      { fontSize: 11, marginTop: 2 },
  bannerChip:     { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  bannerChipText: { fontSize: 10, fontWeight: '700' },
  bannerBtn:      { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  bannerBtnText:  { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Search
  searchBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 18, borderWidth: 1 },
  searchPH:       { fontSize: 13 },
  // Emergency
  emergency:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#7B1A1A', borderRadius: 16, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(163,45,45,0.5)' },
  emergencyTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  emergencySub:   { fontSize: 11, marginTop: 1 },
  emergencyBtn:   { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  emergencyBtnText:{ fontSize: 11, fontWeight: '700', color: '#A32D2D' },
  // Sections
  sectionLabel:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },
  sectionRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  seeAll:         { fontSize: 12, fontWeight: '600' },
  // Specialty row
  specialtyScroll:{ marginHorizontal: -20, marginBottom: 4 },
  chip:           { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, alignItems: 'center', gap: 3 },
  chipLabel:      { fontSize: 10, fontWeight: '500' },
  moreChip:       { minWidth: 58 },
  // Modal
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:          { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 },
  handle:         { width: 40, height: 4, borderRadius: 99, alignSelf: 'center', marginBottom: 14 },
  sheetHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  sheetTitle:     { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  closeBtn:       { width: 30, height: 30, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  dividerRow:     { flexDirection: 'row', justifyContent: 'center', marginVertical: 14, borderTopWidth: 1, paddingTop: 14 },
  dividerPill:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  dividerText:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
})
