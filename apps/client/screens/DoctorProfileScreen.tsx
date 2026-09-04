import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { getIndependentDoctorProfile, IndependentDoctorProfile, getHospitalById } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { haptics } from '@queue/shared/lib/haptics'

interface Props { navigation: any; route: any }

export function DoctorProfileScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { userId } = route.params as { userId: string }
  const [doctor, setDoctor] = useState<IndependentDoctorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [openingHospitalId, setOpeningHospitalId] = useState<string | null>(null)

  useEffect(() => {
    getIndependentDoctorProfile(userId).then(d => { setDoctor(d); setLoading(false) })
  }, [userId])

  async function viewHospital(hospitalId: string) {
    haptics.tap()
    setOpeningHospitalId(hospitalId)
    const raw = await getHospitalById(hospitalId)
    setOpeningHospitalId(null)
    if (raw) navigation.navigate('HospitalProfile', { hospital: toDisplayHospital(raw) })
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
        <View style={st.center}><ActivityIndicator color={t.accent} size="large" /></View>
      </SafeAreaView>
    )
  }

  if (!doctor) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
        <View style={st.center}>
          <Text style={{ color: t.textPrimary, fontSize: 14, fontWeight: '700' }}>Doctor not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const initials = doctor.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={t.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={st.profileCard}>
          <View style={[st.avatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: t.accent }}>{initials}</Text>
          </View>
          <Text style={[st.name, { color: t.textPrimary }]}>{doctor.title ? `${doctor.title} ` : ''}{doctor.fullName}</Text>
          {doctor.specialty && (
            <Text style={[st.specialty, { color: t.accent }]}>
              {doctor.specialty.name}{doctor.level ? ` · ${doctor.level}` : ''}
            </Text>
          )}
          {doctor.qualification && <Text style={[st.qual, { color: t.textMuted }]}>{doctor.qualification}</Text>}
        </View>

        {doctor.bio && (
          <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[st.sectionTitle, { color: t.textMuted }]}>ABOUT</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: t.textSecondary, padding: 14 }}>{doctor.bio}</Text>
          </View>
        )}

        <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[st.sectionTitle, { color: t.textMuted }]}>DETAILS</Text>
          {doctor.yearsExperience != null && <Row label="Experience" value={`${doctor.yearsExperience} years`} theme={t} />}
          {doctor.phone && <Row label="Phone" value={doctor.phone} theme={t} />}
        </View>

        {doctor.hospitals.length > 0 && (
          <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[st.sectionTitle, { color: t.textMuted }]}>PRACTICES AT</Text>
            {doctor.hospitals.map(h => (
              <TouchableOpacity key={h.id} onPress={() => viewHospital(h.id)} disabled={openingHospitalId !== null}
                style={[st.row, { borderBottomColor: t.cardBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="business-outline" size={15} color={t.accent} />
                  <Text style={{ fontSize: 13, color: t.textPrimary }}>{h.name}</Text>
                </View>
                {openingHospitalId === h.id ? (
                  <ActivityIndicator size="small" color={t.textMuted} />
                ) : (
                  <Ionicons name="chevron-forward" size={14} color={t.textMuted} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {doctor.documents.length > 0 && (
          <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[st.sectionTitle, { color: t.textMuted }]}>QUALIFICATIONS & CREDENTIALS</Text>
            {doctor.documents.map(d => (
              <TouchableOpacity key={d.id} disabled={!d.url} onPress={() => d.url && Linking.openURL(d.url)}
                style={[st.row, { borderBottomColor: t.cardBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="document-text-outline" size={15} color={t.accent} />
                  <Text style={{ fontSize: 13, color: t.textPrimary }}>{d.title}</Text>
                </View>
                <Ionicons name="open-outline" size={14} color={t.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {doctor.acceptsDirectVirtual || doctor.acceptsDirectHomeVisit ? (
        <View style={[st.footer, { backgroundColor: t.canvasBg, borderTopColor: t.cardBorder }]}>
          {doctor.acceptsDirectVirtual && (
            <TouchableOpacity
              onPress={() => { haptics.tap(); navigation.navigate('DirectBooking', { doctor, visitType: 'virtual' }) }}
              style={[st.bookBtn, { backgroundColor: t.accent }]}>
              <Ionicons name="videocam-outline" size={15} color={t.id === 'forest' ? '#061208' : '#fff'} />
              <Text style={[st.bookBtnText, { color: t.id === 'forest' ? '#061208' : '#fff' }]}>
                Book Virtual{doctor.virtualFee ? ` · ₦${doctor.virtualFee.toLocaleString()}` : ''}
              </Text>
            </TouchableOpacity>
          )}
          {doctor.acceptsDirectHomeVisit && (
            <TouchableOpacity
              onPress={() => { haptics.tap(); navigation.navigate('DirectBooking', { doctor, visitType: 'home_visit' }) }}
              style={[st.bookBtn, { backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.accentBorder }]}>
              <Ionicons name="home-outline" size={15} color={t.accent} />
              <Text style={[st.bookBtnText, { color: t.accent }]}>
                Book Home Visit{doctor.homeVisitFee ? ` · ₦${doctor.homeVisitFee.toLocaleString()}` : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : doctor.hospitals.length > 0 ? (
        <View style={[st.footer, { backgroundColor: t.canvasBg, borderTopColor: t.cardBorder }]}>
          <TouchableOpacity
            onPress={() => viewHospital(doctor.hospitals[0].id)}
            style={[st.bookBtn, { backgroundColor: t.accent }]}>
            <Ionicons name="business-outline" size={15} color={t.id === 'forest' ? '#061208' : '#fff'} />
            <Text style={[st.bookBtnText, { color: t.id === 'forest' ? '#061208' : '#fff' }]}>
              Book via {doctor.hospitals[0].name}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

function Row({ label, value, theme: t }: { label: string; value: string; theme: any }) {
  return (
    <View style={[st.row, { borderBottomColor: t.cardBorder }]}>
      <Text style={{ fontSize: 12, color: t.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.textPrimary }}>{value}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  safe:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  profileCard:  { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  avatar:       { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 12 },
  name:         { fontSize: 19, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  specialty:    { fontSize: 13, fontWeight: '700', marginTop: 4 },
  qual:         { fontSize: 12, marginTop: 3, textAlign: 'center' },
  section:      { marginHorizontal: 20, marginBottom: 12, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, padding: 12, paddingHorizontal: 14 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  footer:       { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  bookBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 13 },
  bookBtnText:  { fontSize: 13, fontWeight: '700' },
})
