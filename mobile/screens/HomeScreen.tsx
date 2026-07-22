import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Pressable, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { useLocation, distanceKm } from '../contexts/LocationContext'
import { HospitalCard } from '../components/hospital/HospitalCard'
import { SkeletonCard } from '../components/ui/Skeleton'
import { specialties } from '../data'
import { getHospitals, getNextAppointment } from '../lib/api'
import { supabase } from '../lib/supabase'
import { toDisplayHospital } from '../lib/adapters'
import { haptics } from '../lib/haptics'
import type { AppointmentWithRelations } from '../lib/api'
import type { Theme } from '../contexts/ThemeContext'
import type { DisplayHospital } from '../components/hospital/HospitalCard'

const SCREEN_H = Dimensions.get('window').height

const SURGERY_LABELS = [
  'General Surgery', 'Plastic Surgery', 'Neurosurgery', 'Cardiothoracic',
  'Ortho Surgery', 'Laparoscopic', 'Paediatric Surgery', 'Vascular Surgery',
  'Maxillofacial', 'Endoscopic Surgery',
]
const PREVIEW_COUNT = 10

function getGreeting(): { salutation: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour < 12) return { salutation: 'Good morning',   emoji: '☀️' }
  if (hour < 16) return { salutation: 'Good afternoon', emoji: '🌤️' }
  return               { salutation: 'Good evening',   emoji: '🌇' }
}

const WELLNESS_TIPS = [
  'Remember to stay hydrated today 💧',
  'Your health is your wealth 🌿',
  'A check-up a day keeps worries away 🩺',
  'Taking care of yourself is a priority 💚',
  'Small steps lead to great health 🏃',
]

function getDayMessage(): string {
  const day = new Date().getDay()
  const messages: Record<number, string> = {
    0: 'Happy Sunday! Rest and recharge 🛌',
    1: 'New week, fresh start 💪',
    2: 'Keep the momentum going 🔥',
    3: 'Midweek check-in — how are you feeling? 😊',
    4: 'Almost there, stay strong 🌟',
    5: 'Happy Friday! Wrap up and unwind 🎉',
    6: 'Happy Saturday! Make it count 🌈',
  }
  return messages[day] ?? WELLNESS_TIPS[Math.floor(Math.random() * WELLNESS_TIPS.length)]
}

// MM7: Sort hospitals by real distance ascending (distanceKm field, set during load)
function sortByProximity(list: DisplayHospital[]): DisplayHospital[] {
  return [...list].sort((a, b) => ((a as any).distanceKm ?? Infinity) - ((b as any).distanceKm ?? Infinity))
}

// Filter hospitals that offer a given specialty
function filterBySpecialty(list: DisplayHospital[], specialty: string): DisplayHospital[] {
  const q = specialty.toLowerCase()
  return list.filter(h =>
    h.services.some(svc => svc.toLowerCase().includes(q) || q.includes(svc.toLowerCase()))
  )
}

function SpecialtyGrid({
  items, theme: t, activeSpecialty, onSelect,
}: {
  items: typeof specialties
  theme: Theme
  activeSpecialty: string | null
  onSelect: (label: string) => void
}) {
  const rows: (typeof specialties)[] = []
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3))
  return (
    <>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', marginBottom: 8 }}>
          {row.map(sp => {
            const active = activeSpecialty === sp.label
            return (
              <TouchableOpacity key={sp.label} onPress={() => { haptics.tap(); onSelect(sp.label) }}
                style={{
                  flex: 1, margin: 4, borderRadius: 14, paddingVertical: 12,
                  paddingHorizontal: 4, alignItems: 'center', gap: 5, borderWidth: active ? 1.5 : 1,
                  backgroundColor: active ? t.accentBg : t.inputBg,
                  borderColor:     active ? t.accent   : t.cardBorder,
                }}>
                <Text style={{ fontSize: 22 }}>{sp.icon}</Text>
                <Text style={{ fontSize: 10, fontWeight: active ? '700' : '500', textAlign: 'center', color: active ? t.accent : t.textSecondary }}
                  numberOfLines={2}>{sp.label}</Text>
                {active && (
                  <View style={{ position: 'absolute', top: 6, right: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#000', fontSize: 7, fontWeight: '900' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`pad-${i}`} style={{ flex: 1, margin: 4 }} />
          ))}
        </View>
      ))}
    </>
  )
}

interface Props { navigation: any }

export function HomeScreen({ navigation }: Props) {
  const { theme: t }              = useTheme()
  const { user }                  = useAuth()
  const { coords }                = useLocation()
  const [showAll, setShowAll]     = useState(false)
  const [hospitals, setHospitals] = useState<DisplayHospital[]>([])
  const [nextAppt, setNextAppt]   = useState<AppointmentWithRelations | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeSpecialty, setActiveSpecialty] = useState<string | null>(null)
  // MM3: track unread notifications count
  const [unreadCount, setUnreadCount] = useState(0)
  // Profile completion banner — session-only dismissal
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const { salutation, emoji } = getGreeting()
  const dayMessage            = getDayMessage()
  const preview               = specialties.slice(0, PREVIEW_COUNT)
  const general               = specialties.filter(s => !SURGERY_LABELS.includes(s.label))
  const surgery               = specialties.filter(s =>  SURGERY_LABELS.includes(s.label))
  const firstName             = user?.full_name?.split(' ')[0] ?? 'there'

  // Show profile completion banner if any key health field is missing
  const showProfileBanner = !bannerDismissed && !!user && (
    !user.blood_group || !user.date_of_birth || !user.phone
  )

  const load = useCallback(async () => {
    setLoading(true)
    const [raw, appt] = await Promise.all([
      getHospitals(),
      user ? getNextAppointment(user.id) : Promise.resolve(null),
    ])
    // MM7: attach real distanceKm to each hospital display object
    const mapped = raw.map(h => {
      const dh = toDisplayHospital(h) as any
      if (coords && h.latitude != null && h.longitude != null) {
        dh.distanceKm = distanceKm(coords, { latitude: h.latitude, longitude: h.longitude })
      }
      return dh as DisplayHospital
    })
    setHospitals(mapped)
    setNextAppt(appt)

    // MM3: fetch unread notifications count
    if (user) {
      const { count } = await (supabase as any)
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count ?? 0)
    }

    setLoading(false)
  }, [user, coords])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Derived: filtered + sorted hospitals
  const displayedHospitals = useMemo(() => {
    if (!activeSpecialty) return hospitals
    const filtered = filterBySpecialty(hospitals, activeSpecialty)
    return sortByProximity(filtered)
  }, [hospitals, activeSpecialty])

  function handleSpecialtyPress(label: string) {
    haptics.tap()
    setActiveSpecialty(prev => prev === label ? null : label)
    setShowAll(false)
  }

  function clearFilter() {
    setActiveSpecialty(null)
  }

  const activeIcon = activeSpecialty
    ? (specialties.find(s => s.label === activeSpecialty)?.icon ?? '🔍')
    : null

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>

      {/* All Specialties modal */}
      <Modal visible={showAll} animationType="slide" transparent
        onRequestClose={() => setShowAll(false)}>
        <Pressable style={s.overlay} onPress={() => setShowAll(false)} />
        <View style={[s.sheet, { backgroundColor: t.cardBg, maxHeight: SCREEN_H * 0.82 }]}>
          <View style={[s.handle, { backgroundColor: t.inputBorder }]} />
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: t.textPrimary }]}>All Specialties</Text>
            <TouchableOpacity onPress={() => { haptics.tap(); setShowAll(false) }}
              style={[s.closeBtn, { backgroundColor: t.inputBg }]}>
              <Text style={{ color: t.textMuted, fontSize: 14, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
          {activeSpecialty && (
            <TouchableOpacity onPress={clearFilter}
              style={[s.clearModalBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder, marginHorizontal: 16, marginBottom: 8 }]}>
              <Text style={[s.clearModalText, { color: t.accent }]}>✕  Clear filter: {activeSpecialty}</Text>
            </TouchableOpacity>
          )}
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}>
            <SpecialtyGrid items={general} theme={t} activeSpecialty={activeSpecialty} onSelect={handleSpecialtyPress} />
            <View style={[s.dividerRow, { borderTopColor: t.cardBorder }]}>
              <View style={[s.dividerPill, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.dividerText, { color: t.accent }]}>✂️  Surgery Sub-specialties</Text>
              </View>
            </View>
            <SpecialtyGrid items={surgery} theme={t} activeSpecialty={activeSpecialty} onSelect={handleSpecialtyPress} />
          </ScrollView>
        </View>
      </Modal>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.greeting, { color: t.textMuted }]}>{salutation} {emoji}</Text>
            <Text style={[s.headline, { color: t.textPrimary }]}>{firstName} 👋</Text>
            <Text style={[s.dayMsg, { color: t.textMuted }]} numberOfLines={1}>{dayMessage}</Text>
          </View>
          <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Notifications') }}
            style={[s.notifBtn, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
            <Text style={{ fontSize: 18 }}>🔔</Text>
            {unreadCount > 0 && <View style={[s.notifDot, { backgroundColor: t.accent }]} />}
          </TouchableOpacity>
        </View>

        {/* Profile completion banner */}
        {showProfileBanner && (
          <View style={[s.profileBanner, { backgroundColor: '#2A1800', borderColor: 'rgba(239,159,39,0.35)' }]}>
            <Text style={{ fontSize: 20 }}>🩺</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.profileBannerTitle, { color: '#EF9F27' }]}>Complete your health profile</Text>
              <Text style={[s.profileBannerSub, { color: 'rgba(239,159,39,0.65)' }]}>
                Missing info affects emergency triage. Takes 30 seconds.
              </Text>
            </View>
            <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Profile') }}
              style={[s.profileBannerBtn, { backgroundColor: '#EF9F27' }]}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#000' }}>Complete →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { haptics.tap(); setBannerDismissed(true) }}
              style={s.profileBannerDismiss}>
              <Text style={{ color: 'rgba(239,159,39,0.5)', fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Next appointment banner */}
        {nextAppt ? (
          <View style={[s.banner, { backgroundColor: t.bannerBg, borderColor: t.bannerBorder }]}>
            <Text style={[s.bannerLabel, { color: t.accent }]}>NEXT APPOINTMENT</Text>
            <View style={s.bannerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.bannerDoctor}>{nextAppt.doctor?.full_name ?? 'Doctor'}</Text>
                <Text style={[s.bannerSub, { color: 'rgba(255,255,255,0.5)' }]}>
                  {nextAppt.hospital?.name ?? ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                  {[nextAppt.appointment_date, nextAppt.start_time].map(l => (
                    <View key={l} style={[s.bannerChip, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                      <Text style={[s.bannerChipText, { color: t.accent }]}>{l}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <TouchableOpacity style={[s.bannerBtn, { backgroundColor: t.accent }]}
                onPress={() => { haptics.tap(); navigation.navigate('AppointmentDetail', { appointment: nextAppt }) }}>
                <Text style={s.bannerBtnText}>View</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : !loading && (
          <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Search') }}
            style={[s.banner, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[s.bannerLabel, { color: t.accent }]}>BOOK YOUR FIRST APPOINTMENT</Text>
            <Text style={[s.bannerDoctor, { color: t.textPrimary }]}>Find a hospital near you</Text>
            <Text style={[s.bannerSub, { color: t.textMuted }]}>Search by specialty, hospital or doctor →</Text>
          </TouchableOpacity>
        )}

        {/* Search */}
        <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Search') }}
          style={[s.searchBar, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Text style={{ fontSize: 15, color: t.textMuted }}>🔍</Text>
          <Text style={[s.searchPH, { color: t.textMuted }]}>Search hospitals, doctors, specialties…</Text>
        </TouchableOpacity>

        {/* Book Appointment quick-start */}
        <View style={s.bookRow}>
          <TouchableOpacity
            onPress={() => { haptics.tap(); navigation.navigate('BookingFlow', {}) }}
            style={[s.bookCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={[s.bookIcon, { backgroundColor: t.accentBg }]}>
              <Text style={{ fontSize: 20 }}>🏥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.bookCardLabel, { color: t.textPrimary }]}>Physical Visit</Text>
              <Text style={[s.bookCardSub, { color: t.textMuted }]}>Doctor assigned on arrival</Text>
            </View>
            <Text style={{ color: t.accent, fontSize: 16 }}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptics.tap(); navigation.navigate('BookingFlow', { bookingType: 'virtual' }) }}
            style={[s.bookCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={[s.bookIcon, { backgroundColor: 'rgba(55,138,221,0.12)' }]}>
              <Text style={{ fontSize: 20 }}>💻</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.bookCardLabel, { color: t.textPrimary }]}>Virtual Call</Text>
              <Text style={[s.bookCardSub, { color: t.textMuted }]}>Choose a preferred doctor</Text>
            </View>
            <Text style={{ color: t.accent, fontSize: 16 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Emergency CTA */}
        <View style={s.emergency}>
          <Text style={{ fontSize: 22 }}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.emergencyTitle}>Need urgent care?</Text>
            <Text style={[s.emergencySub, { color: 'rgba(255,255,255,0.6)' }]}>
              Emergency slots available · Premium fee applies
            </Text>
          </View>
          <TouchableOpacity style={s.emergencyBtn}
            onPress={() => { haptics.heavy(); navigation.navigate('EmergencyBooking') }}>
            <Text style={s.emergencyBtnText}>Book now</Text>
          </TouchableOpacity>
        </View>

        {/* Specialties row */}
        <Text style={[s.sectionLabel, { color: t.textMuted }]}>Specialties</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.specialtyScroll}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          {preview.map(sp => {
            const active = activeSpecialty === sp.label
            return (
              <TouchableOpacity key={sp.label} onPress={() => handleSpecialtyPress(sp.label)}
                style={[s.chip, {
                  backgroundColor: active ? t.accentBg  : t.cardBg,
                  borderColor:     active ? t.accent    : t.cardBorder,
                  borderWidth:     active ? 1.5 : 1,
                }]}>
                <Text style={{ fontSize: 20 }}>{sp.icon}</Text>
                <Text style={[s.chipLabel, { color: active ? t.accent : t.textMuted, fontWeight: active ? '700' : '500' }]}>
                  {sp.label}
                </Text>
              </TouchableOpacity>
            )
          })}
          <TouchableOpacity onPress={() => { haptics.tap(); setShowAll(true) }}
            style={[s.chip, s.moreChip, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={{ fontSize: 18 }}>＋</Text>
            <Text style={[s.chipLabel, { color: t.accent, fontWeight: '700' }]}>More</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Active filter banner */}
        {activeSpecialty && (
          <View style={[s.filterBanner, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={{ fontSize: 16 }}>{activeIcon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.filterBannerTitle, { color: t.accent }]}>
                {displayedHospitals.length} hospital{displayedHospitals.length !== 1 ? 's' : ''} offering {activeSpecialty}
              </Text>
              <Text style={[s.filterBannerSub, { color: t.textSecondary }]}>
                Sorted by proximity · Tap a chip again to clear
              </Text>
            </View>
            <TouchableOpacity onPress={clearFilter}
              style={[s.clearBtn, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
              <Text style={[s.clearBtnText, { color: t.accent }]}>✕ Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hospital list */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionLabel, { color: t.textMuted }]}>
            {activeSpecialty ? `${activeSpecialty} hospitals` : 'Nearby hospitals'}
          </Text>
          {!activeSpecialty && (
            <TouchableOpacity onPress={() => navigation.navigate('Search')}>
              <Text style={[s.seeAll, { color: t.accent }]}>See all →</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : displayedHospitals.length > 0 ? (
          // Show top 3 when unfiltered, all results when filtered
          (activeSpecialty ? displayedHospitals : displayedHospitals.slice(0, 3)).map(h => (
            <HospitalCard key={h.id} hospital={h}
              onPress={() => { haptics.tap(); navigation.navigate('HospitalProfile', { hospital: h }) }} />
          ))
        ) : activeSpecialty ? (
          <View style={[s.emptyFilter, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={{ fontSize: 52, marginBottom: 10 }}>🔍</Text>
            <Text style={[s.emptyFilterTitle, { color: t.textPrimary }]}>No hospitals found</Text>
            <Text style={[s.emptyFilterSub, { color: t.textMuted }]}>
              No hospitals near you currently offer {activeSpecialty}.
            </Text>
            <TouchableOpacity onPress={clearFilter}
              style={[s.clearBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder, marginTop: 14, paddingHorizontal: 20, paddingVertical: 10 }]}>
              <Text style={[s.clearBtnText, { color: t.accent }]}>Clear filter</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[s.emptyFilter, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={{ fontSize: 52, marginBottom: 10 }}>🏥</Text>
            <Text style={[s.emptyFilterTitle, { color: t.textPrimary }]}>No hospitals nearby</Text>
            <Text style={[s.emptyFilterSub, { color: t.textMuted }]}>
              Try searching by specialty, hospital name, or doctor.
            </Text>
            <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Search') }}
              style={[s.clearBtn, { backgroundColor: t.accent, borderColor: t.accent, marginTop: 14, paddingHorizontal: 20, paddingVertical: 10 }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Search hospitals →</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:              { flex: 1 },
  scroll:            { flex: 1, paddingHorizontal: 20 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 16, marginBottom: 18 },
  greeting:          { fontSize: 12, letterSpacing: 0.4 },
  headline:          { fontSize: 22, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  dayMsg:            { fontSize: 11, marginTop: 3, opacity: 0.8 },
  notifBtn:          { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notifDot:          { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  // Profile completion banner
  profileBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 16 },
  profileBannerTitle:{ fontSize: 12, fontWeight: '800' },
  profileBannerSub:  { fontSize: 10, marginTop: 2, lineHeight: 14 },
  profileBannerBtn:  { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  profileBannerDismiss: { padding: 4 },
  // Banners
  banner:            { borderRadius: 20, padding: 14, marginBottom: 18, borderWidth: 1 },
  bannerLabel:       { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  bannerRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bannerDoctor:      { fontSize: 15, fontWeight: '700', color: '#fff' },
  bannerSub:         { fontSize: 11, marginTop: 2 },
  bannerChip:        { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  bannerChipText:    { fontSize: 10, fontWeight: '700' },
  bannerBtn:         { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  bannerBtnText:     { fontSize: 12, fontWeight: '700', color: '#fff' },
  searchBar:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14, borderWidth: 1 },
  bookRow:           { flexDirection: 'row', gap: 8, marginBottom: 16 },
  bookCard:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, borderWidth: 1 },
  bookIcon:          { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bookCardLabel:     { fontSize: 12, fontWeight: '700' },
  bookCardSub:       { fontSize: 10, marginTop: 1 },
  searchPH:          { fontSize: 13 },
  emergency:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#7B1A1A', borderRadius: 16, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(163,45,45,0.5)' },
  emergencyTitle:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  emergencySub:      { fontSize: 11, marginTop: 1 },
  emergencyBtn:      { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  emergencyBtnText:  { fontSize: 11, fontWeight: '700', color: '#A32D2D' },
  sectionLabel:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },
  sectionRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10 },
  seeAll:            { fontSize: 12, fontWeight: '600' },
  specialtyScroll:   { marginHorizontal: -20, marginBottom: 4 },
  chip:              { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, alignItems: 'center', gap: 3 },
  chipLabel:         { fontSize: 10 },
  moreChip:          { minWidth: 58 },
  // Active filter banner
  filterBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 11, marginTop: 10, marginBottom: 4 },
  filterBannerTitle: { fontSize: 12, fontWeight: '700' },
  filterBannerSub:   { fontSize: 10, marginTop: 1 },
  clearBtn:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  clearBtnText:      { fontSize: 11, fontWeight: '700' },
  // Empty state
  emptyFilter:       { borderRadius: 18, borderWidth: 1, padding: 28, alignItems: 'center', marginVertical: 8 },
  emptyFilterTitle:  { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  emptyFilterSub:    { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  // Modal
  overlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:             { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 },
  handle:            { width: 40, height: 4, borderRadius: 99, alignSelf: 'center', marginBottom: 14 },
  sheetHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  sheetTitle:        { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  closeBtn:          { width: 30, height: 30, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  clearModalBtn:     { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, alignItems: 'center' },
  clearModalText:    { fontSize: 12, fontWeight: '700' },
  dividerRow:        { flexDirection: 'row', justifyContent: 'center', marginVertical: 14, borderTopWidth: 1, paddingTop: 14 },
  dividerPill:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  dividerText:       { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
})
