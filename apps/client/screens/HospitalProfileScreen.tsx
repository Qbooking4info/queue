import { useEffect, useState } from 'react'
import { View, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { EntityAvatar } from '@queue/shared/components/ui/EntityAvatar'
import { HospitalsMap } from '@queue/shared/components/map/HospitalsMap'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { getDoctorsByHospital } from '@queue/shared/lib/api'
import type { Doctor } from '@queue/shared/types/database'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, Seg, Btn, BottomBar,
  Notice, Stat, StatStrip, SectionHead, Mono, Empty,
} from '@queue/shared/components/q'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'

interface Props { navigation: any; route: any }

type Mode = 'person' | 'virtual'

export function HospitalProfileScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const hospital: DisplayHospital = route.params.hospital
  const [mode, setMode] = useState<Mode>('person')
  const [doctors, setDoctors] = useState<Doctor[]>([])

  const isMultiClinic = hospital.clinic_model === 'multi'

  useEffect(() => {
    getDoctorsByHospital(String(hospital.id)).then(setDoctors).catch(() => setDoctors([]))
  }, [hospital.id])

  function book(bookingType: 'physical' | 'virtual', doctor?: Doctor) {
    haptics.tap()
    navigation.navigate('BookingFlow', { hospital, bookingType, doctor })
  }

  function openDirections() {
    const { latitude: lat, longitude: lng } = hospital
    if (lat != null && lng != null) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
        .catch(() => Alert.alert('Error', 'Could not open Google Maps'))
    } else if (hospital.address) {
      const addr = encodeURIComponent(`${hospital.address}, ${hospital.city ?? ''}`)
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${addr}`)
        .catch(() => Alert.alert('Error', 'Could not open Google Maps'))
    } else {
      Alert.alert('No location', 'This hospital has not set a map location yet.')
    }
  }

  function call() {
    const phone = hospital.phone
    if (!phone) return Alert.alert('No number', 'This hospital has not published a phone number.')
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Could not start the call'))
  }

  const virtualDoctors = doctors.filter(d => (d as any).accepts_virtual)
  const shown = mode === 'virtual' ? virtualDoctors : doctors

  return (
    <Screen>
      <AppBar title="Hospital" onBack={() => navigation.goBack()} />

      <Body>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14 }}>
          <EntityAvatar size={52} kind="hospital" uri={hospital.logoUrl} label={hospital.name}
            hospital={{ type: hospital.hospitalType, ownership: hospital.ownership, clinicModel: hospital.clinic_model }} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: t.q.ink }}>
              {hospital.name}
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60 }}>
              {[hospital.address ?? hospital.city, hospital.is_24_hours ? 'open 24 hours' : null]
                .filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <StatStrip>
          <Stat label="OPD fee" value={hospital.opd_fee ? `₦${Number(hospital.opd_fee).toLocaleString('en-NG')}` : 'Free'} />
          <Stat label="Daily limit" value={hospital.daily_booking_limit ?? 'None'}
            note={hospital.daily_booking_limit ? 'bookings a day' : 'no cap'} />
          <Stat label="Doctors" value={doctors.length || '—'}
            note={virtualDoctors.length ? `${virtualDoctors.length} see patients online` : undefined} last />
        </StatStrip>

        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
          <Btn label="Get directions" variant="secondary" small icon="navigate-outline" onPress={openDirections} />
          <Btn label="Call" variant="secondary" small icon="call-outline" onPress={call} />
        </View>

        {hospital.approval_mode === 'manual' && (
          <Notice tone="amber" icon="clipboard-outline">
            This hospital reviews booking requests by hand. You may be asked to describe your symptoms or
            upload a referral letter. Nothing is charged until the hospital accepts.
          </Notice>
        )}
        {hospital.requires_referral && (
          <Notice tone="amber">
            A referral letter is needed for the specialist clinics here. A general outpatient visit needs none.
          </Notice>
        )}

        <Seg<Mode>
          value={mode}
          onChange={m => {
            if (m === 'virtual' && !hospital.virtual) {
              Alert.alert('Not offered', 'This hospital does not offer virtual visits yet.')
              return
            }
            haptics.tap(); setMode(m)
          }}
          options={[{ key: 'person', label: 'In-person visit' }, { key: 'virtual', label: 'Virtual' }]}
        />

        <SectionHead title="Choose a doctor" />
        <Card>
          {/* The hospital-assigns option exists because that IS the OPD model:
              you are seen by whoever is free, and the fee is the hospital's own
              OPD fee rather than any doctor's. */}
          <Row
            icon="business-outline"
            title="No preference"
            sub={isMultiClinic
              ? 'The hospital assigns the next available doctor, and refers you on if you need a sub-clinic'
              : 'The hospital assigns the next available doctor'}
            right={<Mono size={13} weight="700">
              {hospital.opd_fee ? `₦${Number(hospital.opd_fee).toLocaleString('en-NG')}` : 'Free'}
            </Mono>}
            chevron
            onPress={() => book(mode === 'virtual' ? 'virtual' : 'physical')}
          />
          {shown.map(d => {
            const fee = mode === 'virtual' ? (d as any).virtual_fee : d.consultation_fee
            return (
              <View key={d.id}>
                <Hair />
                <Row
                  leading={<EntityAvatar size={40} kind="doctor" uri={(d as any).avatar_url} label={d.full_name} />}
                  title={d.full_name}
                  sub={[(d as any).specialty?.name, (d as any).qualification].filter(Boolean).join(' · ') || null}
                  right={fee != null ? <Mono size={13} weight="700">₦{Number(fee).toLocaleString('en-NG')}</Mono> : undefined}
                  chevron
                  onPress={() => book(mode === 'virtual' ? 'virtual' : 'physical', d)}
                />
              </View>
            )
          })}
          {mode === 'virtual' && virtualDoctors.length === 0 && (
            <>
              <Hair />
              <Empty icon="videocam-outline" title="No doctor here sees patients online yet"
                body="You can still book an in-person visit, or find a doctor who consults online."
                action="Find a doctor online"
                onAction={() => navigation.navigate('DoctorSearch', { initialFilter: 'virtual' })} />
            </>
          )}
        </Card>

        {hospital.services.length > 0 && (
          <>
            <SectionHead title="Clinics here" />
            <Card pad>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink70 }}>
                {hospital.services.join(' · ')}
              </Text>
            </Card>
          </>
        )}

        {(hospital.hmo ?? []).length > 0 && (
          <>
            <SectionHead title="Insurance accepted" />
            <Card>
              {(hospital.hmo ?? []).map((h, i) => (
                <View key={h}>
                  {i > 0 && <Hair />}
                  <Row icon="shield-checkmark-outline" title={h} pill="Accepted" pillTone="green" />
                </View>
              ))}
            </Card>
          </>
        )}

        {hospital.latitude != null && hospital.longitude != null && (
          <>
            <SectionHead title="Where it is" />
            <Card>
              <HospitalsMap
                style={{ height: 180 }}
                interactive={false}
                initialRegion={{
                  latitude: hospital.latitude, longitude: hospital.longitude,
                  latitudeDelta: 0.01, longitudeDelta: 0.01,
                }}
                markers={[{ id: String(hospital.id), latitude: hospital.latitude, longitude: hospital.longitude, title: hospital.name }]}
              />
              <Hair inset={0} />
              <View style={{ padding: 14, paddingBottom: 6 }}><CardLabel>Address</CardLabel></View>
              <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                <Text style={{ fontSize: 14, color: t.q.ink }}>
                  {[hospital.address, hospital.city].filter(Boolean).join(', ') || 'Not published'}
                </Text>
              </View>
            </Card>
          </>
        )}
      </Body>

      <BottomBar meta={
        <Mono size={12} color={t.q.ink60}>
          {hospital.approval_mode === 'manual' ? 'Reviewed by the hospital' : 'Confirmed straight away'}
        </Mono>
      }>
        <Btn grow label="Book appointment" onPress={() => book(mode === 'virtual' ? 'virtual' : 'physical')} />
      </BottomBar>
    </Screen>
  )
}
