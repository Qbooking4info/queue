import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Linking } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

interface Hospital {
  id: string; name: string; type: string; city: string; state: string
  avg_rating: number | null; review_count: number; accepts_virtual: boolean
  is_verified: boolean; description: string | null; phone: string | null
  whatsapp: string | null; email: string | null; emergency_hours: boolean
  address: string | null
}

interface Doctor {
  id: string; full_name: string; title: string; qualification: string | null
  consultation_fee: number | null; virtual_fee: number | null
  accepts_virtual: boolean; avg_rating: number | null
  specialties: { name: string } | null
}

interface Hour { day_of_week: number; open_time: string; close_time: string }
interface Specialty { specialties: { name: string; icon: string | null } | null }

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export function HospitalProfileScreen({ route, navigation }: { route: any; navigation: any }) {
  const hospital: Hospital = route.params.hospital
  const [doctors, setDoctors]     = useState<Doctor[]>([])
  const [hours, setHours]         = useState<Hour[]>([])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('doctors')
        .select('id,full_name,title,qualification,consultation_fee,virtual_fee,accepts_virtual,avg_rating,specialties!doctors_specialty_id_fkey(name)')
        .eq('hospital_id', hospital.id).eq('is_active', true).order('full_name').limit(10),
      supabase.from('hospital_operating_hours')
        .select('day_of_week,open_time,close_time')
        .eq('hospital_id', hospital.id).order('day_of_week'),
      supabase.from('hospital_specialties')
        .select('specialties(name,icon)').eq('hospital_id', hospital.id),
    ]).then(([{ data: d }, { data: h }, { data: s }]) => {
      setDoctors((d as Doctor[]) ?? [])
      setHours((h as Hour[]) ?? [])
      setSpecialties((s as Specialty[]) ?? [])
      setLoading(false)
    })
  }, [hospital.id])

  function isOpenNow() {
    const now  = new Date()
    const day  = now.getDay()
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    return hours.some(h => h.day_of_week === day && h.open_time.slice(0,5) <= time && time <= h.close_time.slice(0,5))
  }

  function handleBooking() {
    navigation.navigate('Booking', { hospital })
  }

  function handleCall() {
    if (hospital.phone) Linking.openURL(`tel:${hospital.phone}`)
  }

  const specialtyNames = specialties.slice(0, 6).map(s => s.specialties?.name).filter(Boolean)
  const openNow = !loading && isOpenNow()

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {hospital.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name} numberOfLines={2}>{hospital.name}</Text>
              {hospital.is_verified && <Text style={{ color: t.accent, fontSize: 14 }}>✓</Text>}
            </View>
            <Text style={styles.type}>{hospital.type.replace(/_/g, ' ')} · {hospital.city}, {hospital.state}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              {hospital.avg_rating ? (
                <Text style={styles.rating}>★ {hospital.avg_rating.toFixed(1)} ({hospital.review_count})</Text>
              ) : (
                <Text style={styles.ratingNew}>New</Text>
              )}
              <View style={[styles.statusBadge, { borderColor: openNow ? '#00E87A44' : '#FF5C5C44', backgroundColor: openNow ? '#00E87A11' : '#FF5C5C11' }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: openNow ? t.accent : '#FF5C5C' }}>
                  {loading ? '…' : openNow ? 'Open Now' : 'Closed Now'}
                </Text>
              </View>
              {hospital.emergency_hours && (
                <View style={[styles.statusBadge, { borderColor: '#FF5C5C44', backgroundColor: '#FF5C5C11' }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#FF5C5C' }}>24/7</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Specialties */}
        {specialtyNames.length > 0 && (
          <View style={styles.section}>
            <View style={styles.tags}>
              {specialtyNames.map(s => (
                <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>
              ))}
            </View>
          </View>
        )}

        {/* Description */}
        {hospital.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.body}>{hospital.description}</Text>
          </View>
        )}

        {/* Doctors */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Doctors</Text>
          {loading ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : doctors.length === 0 ? (
            <Text style={styles.muted}>No doctors listed yet</Text>
          ) : doctors.map(d => (
            <TouchableOpacity key={d.id} style={styles.doctorCard} activeOpacity={0.75}
              onPress={() => navigation.navigate('Booking', { hospital, doctor: d })}>
              <View style={styles.doctorAvatar}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: t.accent }}>
                  {(d.full_name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doctorName}>{d.title} {d.full_name}</Text>
                <Text style={styles.doctorSub}>
                  {d.specialties?.name ?? 'General'}{d.qualification ? ` · ${d.qualification}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  {d.consultation_fee ? (
                    <Text style={styles.fee}>₦{d.consultation_fee.toLocaleString()} consult</Text>
                  ) : null}
                  {d.accepts_virtual && d.virtual_fee ? (
                    <Text style={[styles.fee, { color: '#5B9EFF' }]}>₦{d.virtual_fee.toLocaleString()} virtual</Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Operating Hours */}
        {!loading && hours.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Operating Hours</Text>
            {DAYS.map((day, i) => {
              const h = hours.find(oh => oh.day_of_week === i)
              return (
                <View key={day} style={styles.hourRow}>
                  <Text style={[styles.day, !h && { color: t.textMuted }]}>{day}</Text>
                  <Text style={[styles.hourText, !h && { color: t.textMuted }]}>
                    {h ? `${h.open_time.slice(0,5)} – ${h.close_time.slice(0,5)}` : 'Closed'}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Contact */}
        {(hospital.phone || hospital.address) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact</Text>
            {hospital.address && <Text style={styles.body}>{hospital.address}, {hospital.city}, {hospital.state}</Text>}
            {hospital.phone && (
              <TouchableOpacity onPress={handleCall} style={{ marginTop: 8 }}>
                <Text style={{ color: t.accent, fontSize: font.sm, fontWeight: '600' }}>📞 {hospital.phone}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Book CTA */}
      <View style={styles.cta}>
        {hospital.phone && (
          <TouchableOpacity onPress={handleCall} style={styles.callBtn}>
            <Text style={{ color: t.accent, fontSize: font.sm, fontWeight: '700' }}>📞 Call</Text>
          </TouchableOpacity>
        )}
        {hospital.whatsapp && (
          <TouchableOpacity
            onPress={() => Linking.openURL(`https://wa.me/${hospital.whatsapp?.replace(/\D/g,'')}`)}
            style={styles.callBtn}>
            <Text style={{ color: '#25D366', fontSize: font.sm, fontWeight: '700' }}>💬 WhatsApp</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleBooking} style={styles.bookBtn}>
          <Text style={styles.bookText}>Book Appointment</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: t.bg },
  header:       { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  backBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  hero:         { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, alignItems: 'flex-start' },
  avatar:       { width: 56, height: 56, borderRadius: 16, backgroundColor: '#1A3A28', borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center', shrink: 0 } as any,
  avatarText:   { color: t.accent, fontSize: font.sm, fontWeight: '800', letterSpacing: -0.5 },
  name:         { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.3, flex: 1 },
  type:         { fontSize: font.xs, color: t.textSub, marginTop: 2, textTransform: 'capitalize' },
  rating:       { fontSize: font.xs, color: '#FFB547', fontWeight: '700' },
  ratingNew:    { fontSize: font.xs, color: t.textMuted, fontWeight: '600' },
  statusBadge:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  section:      { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  sectionTitle: { fontSize: font.xs, fontWeight: '700', color: t.textSub, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.md },
  tags:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:          { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  tagText:      { fontSize: 11, color: t.textSub, fontWeight: '600' },
  body:         { fontSize: font.sm, color: t.textSub, lineHeight: 22 },
  muted:        { fontSize: font.sm, color: t.textMuted },
  doctorCard:   { flexDirection: 'row', gap: spacing.md, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  doctorAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1A3A28', borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doctorName:   { fontSize: font.sm, fontWeight: '700', color: t.text },
  doctorSub:    { fontSize: 11, color: t.textSub, marginTop: 1 },
  fee:          { fontSize: 10, color: t.accent, fontWeight: '600' },
  hourRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.border },
  day:          { fontSize: font.sm, color: t.textSub, fontWeight: '600', width: 40 },
  hourText:     { fontSize: font.sm, color: t.text },
  cta:          { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: spacing.sm, padding: spacing.xl, paddingBottom: 32, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border },
  callBtn:      { paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: t.accentBorder, backgroundColor: t.accentMuted },
  bookBtn:      { flex: 1, backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  bookText:     { fontSize: font.base, fontWeight: '800', color: '#060A07' },
})
