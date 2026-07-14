import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Linking, Alert } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useTheme } from '../contexts/ThemeContext'
import { Avatar } from '../components/ui/Avatar'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { DisplayHospital } from '../components/hospital/HospitalCard'

interface Props { navigation: any; route: any }

const TABS = ['services', 'hmo', 'info'] as const

export function HospitalProfileScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const hospital: DisplayHospital & {
    clinic_model?: string | null
    daily_booking_limit?: number | null
    approval_mode?: string | null
    requires_referral?: boolean | null
    opd_fee?: number | null
  } = route.params.hospital
  const [tab, setTab] = useState<typeof TABS[number]>('services')

  const isMultiClinic = hospital.clinic_model === 'multi'

  function bookInPerson() {
    navigation.navigate('BookingFlow', { hospital, bookingType: 'physical' })
  }

  function bookVirtual() {
    navigation.navigate('BookingFlow', { hospital, bookingType: 'virtual' })
  }

  function openDirections() {
    const lat = hospital.latitude
    const lng = hospital.longitude
    const label = encodeURIComponent(hospital.name)
    if (lat != null && lng != null) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${label}`
      Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Google Maps'))
    } else if (hospital.address) {
      const addr = encodeURIComponent(`${hospital.address}, ${hospital.city ?? ''}`)
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${addr}`)
        .catch(() => Alert.alert('Error', 'Could not open Google Maps'))
    } else {
      Alert.alert('No location', 'This hospital has not set a map location yet.')
    }
  }

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
              {isMultiClinic && (
                <View style={[styles.multiChip, { backgroundColor: 'rgba(180,156,240,0.12)', borderColor: 'rgba(180,156,240,0.3)' }]}>
                  <Text style={[styles.multiChipText, { color: '#B49CF0' }]}>🏢 Multi-clinic</Text>
                </View>
              )}
              {(hospital.emergencySlots ?? 0) > 0 && (
                <View style={styles.emergBadge}>
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

        {/* Multi-clinic OPD note */}
        {isMultiClinic && (
          <View style={[styles.opdNote, { backgroundColor: 'rgba(85,167,235,0.08)', borderColor: 'rgba(85,167,235,0.2)' }]}>
            <Text style={[styles.opdNoteIcon]}>💡</Text>
            <Text style={[styles.opdNoteText, { color: t.textSecondary }]}>
              Not sure which department to book?{' '}
              <Text style={{ fontWeight: '700' }}>Book an OPD (General) visit</Text> — the doctor
              will assess and refer you to the right sub-clinic.
            </Text>
          </View>
        )}

        {/* Approval mode notice */}
        {hospital.approval_mode === 'manual' && (
          <View style={[styles.opdNote, { backgroundColor: 'rgba(239,159,39,0.08)', borderColor: 'rgba(239,159,39,0.2)', marginTop: 8 }]}>
            <Text style={styles.opdNoteIcon}>📋</Text>
            <Text style={[styles.opdNoteText, { color: t.textSecondary }]}>
              This hospital <Text style={{ fontWeight: '700' }}>manually reviews</Text> booking
              requests. You may be asked to describe your symptoms or upload a referral letter.
              Rejected bookings receive a full refund.
            </Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: t.cardBorder }]}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)} style={styles.tabItem}>
            <Text style={[styles.tabText, {
              color: tab === tb ? t.accent : t.textMuted,
              fontWeight: tab === tb ? '700' : '400',
            }]}>
              {tb.charAt(0).toUpperCase() + tb.slice(1)}
            </Text>
            <View style={[styles.tabUnderline, { backgroundColor: tab === tb ? t.accent : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'services' && (
          <View style={styles.chipGrid}>
            {hospital.services.map((s, idx) => (
              <TouchableOpacity key={idx}
                onPress={() => bookInPerson()}
                style={[styles.serviceChip, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[styles.serviceText, { color: t.accent }]}>{s}</Text>
                <Text style={[styles.serviceBookText, { color: t.accent }]}>→</Text>
              </TouchableOpacity>
            ))}
            <View style={[styles.serviceNote, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
              <Text style={[styles.serviceNoteText, { color: t.textMuted }]}>
                Tap a service to begin an in-person booking. Your request will be routed to the appropriate department.
              </Text>
            </View>
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

        {tab === 'info' && (
          <>
            {/* Map */}
            {hospital.latitude != null && hospital.longitude != null && (
              <View style={styles.mapWrap}>
                <MapView
                  style={styles.map}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  initialRegion={{
                    latitude:  hospital.latitude!,
                    longitude: hospital.longitude!,
                    latitudeDelta:  0.01,
                    longitudeDelta: 0.01,
                  }}>
                  <Marker coordinate={{ latitude: hospital.latitude!, longitude: hospital.longitude! }} title={hospital.name} />
                </MapView>
                <TouchableOpacity onPress={openDirections}
                  style={[styles.directionsBtn, { backgroundColor: t.accent }]}>
                  <Text style={styles.directionsBtnText}>🗺 Get Directions</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Info rows */}
            {[
              { label: 'Address',     value: hospital.address ?? 'See directions' },
              { label: 'City',        value: hospital.city    ?? hospital.distance },
              { label: 'Phone',       value: (hospital as any).phone ?? 'Contact hospital' },
              { label: 'Daily Limit', value: hospital.daily_booking_limit ? `${hospital.daily_booking_limit} bookings/day` : 'No limit' },
              { label: 'OPD Fee',     value: hospital.opd_fee ? `₦${hospital.opd_fee.toLocaleString()}` : 'Free' },
              { label: 'Approval',    value: hospital.approval_mode === 'manual' ? 'Manual review required' : 'Instant confirmation' },
              { label: 'Emergency',   value: hospital.emergencySlots ? '24/7 emergency line' : 'No emergency service' },
            ].map(item => (
              <View key={item.label} style={[styles.infoRow, { borderBottomColor: t.cardBorder }]}>
                <Text style={[styles.infoLabel, { color: t.textMuted }]}>{item.label}</Text>
                <Text style={[styles.infoValue, { color: t.textPrimary }]}>{item.value}</Text>
              </View>
            ))}

            {/* Directions button fallback when no map coords */}
            {(hospital.latitude == null || hospital.longitude == null) && (
              <TouchableOpacity onPress={openDirections}
                style={[styles.directionsBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder, borderWidth: 1, marginTop: 12 }]}>
                <Text style={[styles.directionsBtnText, { color: t.accent }]}>🗺 Get Directions</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Booking CTAs */}
      <View style={[styles.cta, { borderTopColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
        <View style={styles.ctaRow}>
          {/* In-person to hospital (OPD) */}
          <TouchableOpacity style={[styles.ctaBtnSecondary, { borderColor: t.accent, backgroundColor: t.accentBg }]}
            onPress={bookInPerson}>
            <Text style={[styles.ctaBtnSecondaryText, { color: t.accent }]}>🏥 In-Person Visit</Text>
            {hospital.opd_fee ? (
              <Text style={[styles.ctaBtnFee, { color: t.accent }]}>₦{hospital.opd_fee.toLocaleString()}</Text>
            ) : (
              <Text style={[styles.ctaBtnFee, { color: t.accent }]}>Free OPD</Text>
            )}
          </TouchableOpacity>

          {/* Virtual — only if hospital accepts virtual */}
          {hospital.virtual ? (
            <TouchableOpacity
              style={[styles.ctaBtnPrimary, { backgroundColor: t.accent }]}
              onPress={bookVirtual}>
              <Text style={styles.ctaBtnPrimaryText}>💻 Book Virtual</Text>
              <Text style={[styles.ctaBtnFee, { color: 'rgba(255,255,255,0.75)' }]}>Choose a doctor →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.ctaBtnPrimary, { backgroundColor: t.accent }]}
              onPress={bookInPerson}>
              <Text style={styles.ctaBtnPrimaryText}>Book Appointment</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:                { flex: 1 },
  hero:                { paddingHorizontal: 20, paddingBottom: 14 },
  backBtn:             { paddingBottom: 12, paddingTop: 4 },
  backArrow:           { fontSize: 22 },
  heroRow:             { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 14 },
  hospitalName:        { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  hospitalSpecialty:   { fontSize: 12, marginTop: 2 },
  multiChip:           { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  multiChipText:       { fontSize: 10, fontWeight: '700' },
  emergBadge:          { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99,
                         backgroundColor: '#FCEBEB', borderWidth: 1, borderColor: 'rgba(163,45,45,0.3)' },
  emergBadgeText:      { fontSize: 10, fontWeight: '700', color: '#791F1F', textTransform: 'uppercase' },
  opdNote:             { flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                         borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 10 },
  opdNoteIcon:         { fontSize: 14 },
  opdNoteText:         { flex: 1, fontSize: 12, lineHeight: 18 },
  statsGrid:           { flexDirection: 'row', gap: 8 },
  statBox:             { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 8, borderWidth: 1 },
  statValue:           { fontSize: 12, fontWeight: '700' },
  statLabel:           { fontSize: 9, marginTop: 2 },
  tabBar:              { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 20 },
  tabItem:             { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabText:             { fontSize: 12 },
  tabUnderline:        { height: 2, width: '80%', borderRadius: 99, marginTop: 4 },
  content:             { flex: 1, paddingHorizontal: 20, paddingTop: 14 },
  chipGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip:         { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1,
                         flexDirection: 'row', alignItems: 'center', gap: 6 },
  serviceText:         { fontSize: 12, fontWeight: '600' },
  serviceBookText:     { fontSize: 12, fontWeight: '700' },
  serviceNote:         { width: '100%', borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 8 },
  serviceNoteText:     { fontSize: 12, lineHeight: 18 },
  hmoRow:              { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 11, marginBottom: 8, borderWidth: 1 },
  hmoName:             { flex: 1, fontSize: 13, fontWeight: '600' },
  acceptedBadge:       { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  acceptedText:        { fontSize: 10, fontWeight: '700' },
  infoRow:             { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, gap: 16 },
  infoLabel:           { fontSize: 12, flexShrink: 0 },
  infoValue:           { fontSize: 12, fontWeight: '500', textAlign: 'right', flex: 1 },
  cta:                 { padding: 16, paddingBottom: 20, borderTopWidth: 1 },
  ctaRow:              { flexDirection: 'row', gap: 10 },
  ctaBtnSecondary:     { flex: 1, borderRadius: 14, padding: 13, alignItems: 'center', borderWidth: 1.5 },
  ctaBtnSecondaryText: { fontSize: 13, fontWeight: '700' },
  ctaBtnPrimary:       { flex: 1, borderRadius: 14, padding: 13, alignItems: 'center' },
  ctaBtnPrimaryText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  ctaBtnFee:           { fontSize: 10, marginTop: 2 },
  mapWrap:             { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  map:                 { height: 180 },
  directionsBtn:       { padding: 13, alignItems: 'center', borderRadius: 12, marginTop: 8 },
  directionsBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
})
