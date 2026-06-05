import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { Avatar } from '../components/ui/Avatar'
import { Stars } from '../components/ui/Stars'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { DisplayHospital } from '../components/hospital/HospitalCard'

interface BookingDoctor {
  id?:              string
  name:             string
  spec:             string
  fee:              string
  avatar:           string
  exp?:             string
  rating?:          number
  consultation_fee?: number
  virtual_fee?:     number
}

interface Props { navigation: any; route: any }

const TABS = ['doctors', 'services', 'hmo', 'info'] as const

function toBookingDoctor(d: any): BookingDoctor {
  const initials = (d.full_name ?? d.name ?? '??')
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  return {
    id:               d.id,
    name:             d.full_name ?? d.name ?? 'Doctor',
    spec:             d.specialty?.name ?? d.spec ?? 'Specialist',
    fee:              d.consultation_fee ? `₦${Number(d.consultation_fee).toLocaleString()}` : (d.fee ?? '₦0'),
    avatar:           initials,
    exp:              d.years_experience ? `${d.years_experience} yrs` : (d.exp ?? ''),
    rating:           d.avg_rating ?? d.rating ?? 0,
    consultation_fee: d.consultation_fee,
    virtual_fee:      d.virtual_fee,
  }
}

export function HospitalProfileScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const hospital: DisplayHospital = route.params.hospital
  const [tab, setTab] = useState<typeof TABS[number]>('doctors')

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: t.canvasBg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.heroRow}>
          <Avatar initials={hospital.avatar} bg={hospital.avatarBg} size={58} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[styles.hospitalName, { color: t.textPrimary }]}>{hospital.name}</Text>
              {hospital.verified && <Text style={{ fontSize: 13, color: t.accent }}>✓</Text>}
            </View>
            <Text style={[styles.hospitalSpecialty, { color: t.textMuted }]}>{hospital.specialty}</Text>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
              <StatusBadge type={hospital.tagType} />
              {hospital.virtual && <StatusBadge type="virtual" />}
              {(hospital.emergencySlots ?? 0) > 0 && (
                <View style={[styles.emergBadge]}>
                  <Text style={styles.emergBadgeText}>🚨 {hospital.emergencySlots} emergency</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Rating',   value: `${hospital.rating} ★` },
            { label: 'Reviews',  value: String(hospital.reviews) },
            { label: 'Wait',     value: hospital.wait },
            { label: 'Distance', value: hospital.distance },
          ].map(s => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
              <Text style={[styles.statValue, { color: t.textPrimary }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: t.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: t.cardBorder }]}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)} style={styles.tabItem}>
            <Text style={[styles.tabText, { color: tab === tb ? t.accent : t.textMuted, fontWeight: tab === tb ? '700' : '400' }]}>
              {tb.charAt(0).toUpperCase() + tb.slice(1)}
            </Text>
            <View style={[styles.tabUnderline, { backgroundColor: tab === tb ? t.accent : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'doctors' && (hospital.doctors ?? []).map((d, i) => {
          const bd = toBookingDoctor(d)
          return (
            <DoctorRow key={bd.id ?? i} doctor={bd}
              onBook={() => navigation.navigate('BookingFlow', { hospital, doctor: bd })} />
          )
        })}

        {tab === 'services' && (
          <View style={styles.chipGrid}>
            {hospital.services.map(s => (
              <View key={s} style={[styles.serviceChip, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[styles.serviceText, { color: t.textPrimary }]}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'hmo' && (hospital.hmo ?? []).map(h => (
          <View key={h} style={[styles.hmoRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={{ fontSize: 14 }}>🏥</Text>
            <Text style={[styles.hmoName, { color: t.textPrimary }]}>{h}</Text>
            <View style={[styles.acceptedBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
              <Text style={[styles.acceptedText, { color: t.accent }]}>Accepted</Text>
            </View>
          </View>
        ))}

        {tab === 'info' && [
          { label: 'Address',   value: (hospital as any).address ?? 'See directions' },
          { label: 'Phone',     value: (hospital as any).phone   ?? 'Contact hospital' },
          { label: 'City',      value: (hospital as any).city    ?? hospital.distance },
          { label: 'Emergency', value: hospital.emergencySlots ? '24/7 emergency line' : 'No emergency service' },
        ].map(i => (
          <View key={i.label} style={[styles.infoRow, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.infoLabel, { color: t.textMuted }]}>{i.label}</Text>
            <Text style={[styles.infoValue, { color: t.textPrimary }]}>{i.value}</Text>
          </View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Book CTA */}
      <View style={[styles.cta, { borderTopColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
        <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: t.accent }]}
          onPress={() => {
            const first = (hospital.doctors ?? [])[0]
            if (first) navigation.navigate('BookingFlow', { hospital, doctor: toBookingDoctor(first) })
          }}>
          <Text style={styles.ctaBtnText}>Book appointment</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

function DoctorRow({ doctor: d, onBook }: { doctor: BookingDoctor; onBook: () => void }) {
  const { theme: t } = useTheme()
  return (
    <View style={[styles.doctorRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <View style={[styles.doctorAvatar, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
        <Text style={[styles.doctorAvatarText, { color: t.textMuted }]}>{d.avatar}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.doctorName, { color: t.textPrimary }]}>{d.name}</Text>
        <Text style={[styles.doctorSpec, { color: t.textMuted }]}>{d.spec} · {d.exp}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Stars rating={d.rating ?? 0} />
          <Text style={[styles.doctorFee, { color: t.accent, marginLeft: 'auto' }]}>{d.fee}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={onBook}
        style={[styles.bookBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
        <Text style={[styles.bookBtnText, { color: t.accent }]}>Book</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  hero:            { paddingHorizontal: 20, paddingBottom: 14 },
  backBtn:         { paddingBottom: 12, paddingTop: 4 },
  backArrow:       { fontSize: 22 },
  heroRow:         { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 14 },
  hospitalName:    { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  hospitalSpecialty:{ fontSize: 12, marginTop: 2 },
  emergBadge:      { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99,
                     backgroundColor: '#FCEBEB', borderWidth: 1, borderColor: 'rgba(163,45,45,0.3)' },
  emergBadgeText:  { fontSize: 10, fontWeight: '700', color: '#791F1F', textTransform: 'uppercase' },
  statsGrid:       { flexDirection: 'row', gap: 8 },
  statBox:         { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 8, borderWidth: 1 },
  statValue:       { fontSize: 12, fontWeight: '700' },
  statLabel:       { fontSize: 9, marginTop: 2 },
  tabBar:          { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 20 },
  tabItem:         { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabText:         { fontSize: 12 },
  tabUnderline:    { height: 2, width: '80%', borderRadius: 99, marginTop: 4 },
  content:         { flex: 1, paddingHorizontal: 20, paddingTop: 14 },
  doctorRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 13, marginBottom: 9, borderWidth: 1 },
  doctorAvatar:    { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  doctorAvatarText:{ fontSize: 12, fontWeight: '700' },
  doctorName:      { fontSize: 13, fontWeight: '700' },
  doctorSpec:      { fontSize: 11, marginTop: 1 },
  doctorFee:       { fontSize: 12, fontWeight: '700' },
  bookBtn:         { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  bookBtnText:     { fontSize: 11, fontWeight: '700' },
  chipGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip:     { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1 },
  serviceText:     { fontSize: 12, fontWeight: '500' },
  hmoRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 11, marginBottom: 8, borderWidth: 1 },
  hmoName:         { flex: 1, fontSize: 13, fontWeight: '600' },
  acceptedBadge:   { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  acceptedText:    { fontSize: 10, fontWeight: '700' },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, gap: 16 },
  infoLabel:       { fontSize: 12, flexShrink: 0 },
  infoValue:       { fontSize: 12, fontWeight: '500', textAlign: 'right', flex: 1 },
  cta:             { padding: 16, paddingBottom: 20, borderTopWidth: 1 },
  ctaBtn:          { borderRadius: 16, padding: 15, alignItems: 'center' },
  ctaBtnText:      { fontSize: 15, fontWeight: '700', color: '#fff' },
})
