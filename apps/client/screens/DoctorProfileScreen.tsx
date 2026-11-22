import { useEffect, useState } from 'react'
import { View, ActivityIndicator, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { EntityAvatar } from '@queue/shared/components/ui/EntityAvatar'
import { getIndependentDoctorProfile, getHospitalById, type IndependentDoctorProfile } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, DetailRow, Btn, BottomBar,
  Stat, StatStrip, Empty, Mono,
} from '@queue/shared/components/q'

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
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} size="large" />
        </View>
      </Screen>
    )
  }

  if (!doctor) {
    return (
      <Screen>
        <AppBar title="Doctor" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 16 }}>
          <Empty icon="person-outline" title="We could not find this doctor"
            body="They may have left the platform, or the link is out of date."
            action="Back" onAction={() => navigation.goBack()} />
        </Card>
      </Screen>
    )
  }

  const direct = doctor.acceptsDirectVirtual || doctor.acceptsDirectHomeVisit

  return (
    <Screen>
      <AppBar title="Doctor" onBack={() => navigation.goBack()} />

      <Body>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14 }}>
          <EntityAvatar size={56} kind="doctor" uri={doctor.avatarUrl} gender={doctor.gender} label={doctor.fullName} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: t.q.ink }}>
              {doctor.title ? `${doctor.title} ` : ''}{doctor.fullName}
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60 }}>
              {[
                doctor.specialty?.name ?? 'General practice',
                doctor.level,
                doctor.yearsExperience != null ? `${doctor.yearsExperience} years` : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {/* What it costs to be seen, by route. Only the routes this doctor
            actually offers are drawn -- an empty "Home visit" cell would read
            as "free", which is the opposite of the truth. */}
        {direct && (
          <StatStrip>
            {doctor.acceptsDirectVirtual && (
              <Stat label="Video" value={doctor.virtualFee != null ? `₦${doctor.virtualFee.toLocaleString('en-NG')}` : '—'}
                last={!doctor.acceptsDirectHomeVisit} />
            )}
            {doctor.acceptsDirectHomeVisit && (
              <Stat label="Home visit" value={doctor.homeVisitFee != null ? `₦${doctor.homeVisitFee.toLocaleString('en-NG')}` : '—'} last />
            )}
          </StatStrip>
        )}

        {!!doctor.bio && (
          <>
            <SectionHead title="About" />
            <Card pad>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink70 }}>{doctor.bio}</Text>
            </Card>
          </>
        )}

        {doctor.hospitals.length > 0 && (
          <>
            <SectionHead title="Practises at" />
            <Card>
              {doctor.hospitals.map((h, i) => (
                <View key={h.id}>
                  {i > 0 && <Hair />}
                  <Row
                    icon="business-outline"
                    title={h.name}
                    sub={direct ? null : 'Book through this hospital'}
                    right={openingHospitalId === h.id ? <ActivityIndicator size="small" color={t.q.ink60} /> : undefined}
                    chevron={openingHospitalId !== h.id}
                    onPress={() => viewHospital(h.id)}
                  />
                </View>
              ))}
            </Card>
          </>
        )}

        <SectionHead title="Qualifications & credentials" />
        <Card>
          {!!doctor.qualification && <DetailRow label="Degrees" value={doctor.qualification} />}
          {!!doctor.level && <DetailRow label="Cadre" value={doctor.level} />}
          {doctor.yearsExperience != null && <DetailRow label="Experience" value={`${doctor.yearsExperience} years`} />}
          {!!doctor.phone && <DetailRow label="Phone" value={doctor.phone} mono />}
          {doctor.documents.length > 0
            ? doctor.documents.map((d, i) => (
                <View key={d.id}>
                  <Row
                    icon="document-text-outline"
                    title={d.title}
                    sub={d.url ? 'Tap to open' : 'Not shared publicly'}
                    right={d.url ? undefined : <Mono size={11} color={t.q.ink60}>PRIVATE</Mono>}
                    chevron={!!d.url}
                    onPress={d.url ? () => Linking.openURL(d.url!) : undefined}
                  />
                  {i < doctor.documents.length - 1 && <Hair />}
                </View>
              ))
            : (!doctor.qualification && !doctor.level && doctor.yearsExperience == null) && (
                <Empty icon="document-text-outline" title="Nothing published yet"
                  body="This doctor has not added credentials to their public profile." />
              )}
        </Card>
      </Body>

      {direct ? (
        <BottomBar>
          {doctor.acceptsDirectHomeVisit && (
            <Btn
              label="Home visit" variant="secondary" icon="home-outline"
              onPress={() => { haptics.tap(); navigation.navigate('DirectBooking', { doctor, visitType: 'home_visit' }) }}
            />
          )}
          {doctor.acceptsDirectVirtual && (
            <Btn
              grow icon="videocam-outline"
              label={`Book video${doctor.virtualFee ? ` · ₦${doctor.virtualFee.toLocaleString('en-NG')}` : ''}`}
              onPress={() => { haptics.tap(); navigation.navigate('DirectBooking', { doctor, visitType: 'virtual' }) }}
            />
          )}
          {!doctor.acceptsDirectVirtual && doctor.acceptsDirectHomeVisit && (
            <Btn
              grow icon="home-outline"
              label={`Request home visit${doctor.homeVisitFee ? ` · ₦${doctor.homeVisitFee.toLocaleString('en-NG')}` : ''}`}
              onPress={() => { haptics.tap(); navigation.navigate('DirectBooking', { doctor, visitType: 'home_visit' }) }}
            />
          )}
        </BottomBar>
      ) : doctor.hospitals.length > 0 ? (
        <BottomBar meta={<Mono size={12} color={t.q.ink60}>Booked through the hospital, at its price</Mono>}>
          <Btn grow label={`Book via ${doctor.hospitals[0].name}`} onPress={() => viewHospital(doctor.hospitals[0].id)} />
        </BottomBar>
      ) : null}
    </Screen>
  )
}
