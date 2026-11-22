import { useEffect, useState } from 'react'
import { View, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, Stat, StatStrip, DetailRow, SectionHead,
  Notice, Btn, BottomBar, Mono,
} from '@queue/shared/components/q'

interface Props { navigation: any; route: any }

function getMinutes(slot?: string) {
  const m = /(\d+)\s*min/.exec(slot ?? '')
  if (m) return Number(m[1])
  if (/1\s*hr/.test(slot ?? '')) return 60
  return 0
}

export function EmergencyConfirmationScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const {
    urgencyLabel, symptom, hospital, slot, total, bookingRef, bedSpaceStatus,
  } = route.params

  const bedSpaceRisk = bedSpaceStatus === 'none' || bedSpaceStatus === 'very_limited'
  const [countdown, setCountdown] = useState(slot === 'Now (walk-in)' ? 0 : getMinutes(slot))

  useEffect(() => {
    if (countdown <= 0) return
    const id = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 60_000)
    return () => clearInterval(id)
  }, [])

  function callHospital() {
    if (!hospital?.phone) { Alert.alert('No phone number', 'This hospital has not listed a phone number.'); return }
    Linking.openURL(`tel:${hospital.phone}`).catch(() => Alert.alert('Error', 'Could not start a call.'))
  }

  function getDirections() {
    const lat = hospital?.latitude
    const lng = hospital?.longitude
    if (lat != null && lng != null) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
        .catch(() => Alert.alert('Error', 'Could not open Google Maps.'))
    } else if (hospital?.address) {
      const addr = encodeURIComponent(`${hospital.address}, ${hospital.city ?? ''}`)
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${addr}`)
        .catch(() => Alert.alert('Error', 'Could not open Google Maps.'))
    } else {
      Alert.alert('No location', 'This hospital has not set a map location yet.')
    }
  }

  // The old screen pulsed this icon on an endless loop. The word "emergency",
  // the red, and the instructions all say the same thing without it, and an
  // animation with no end state is the one kind this system does not use.
  return (
    <Screen>
      <AppBar title="Emergency booking confirmed" sub={bookingRef ?? undefined} />

      <Body>
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 4, paddingBottom: 18, gap: 8 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32, backgroundColor: t.q.redBg,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="alert-circle" size={32} color={t.q.red} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: t.q.ink, textAlign: 'center' }}>
            You have a place
          </Text>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, textAlign: 'center' }}>
            {[hospital?.name, 'emergency room'].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <StatStrip>
          <Stat label="Position on arrival" value={1} note="emergencies first" />
          <Stat
            label={slot === 'Now (walk-in)' ? 'Go' : 'Time to slot'}
            value={countdown === 0 ? 'Now' : countdown}
            unit={countdown === 0 ? undefined : 'min'}
          />
          <Stat label="Amount due" value={total != null ? `₦${Number(total).toLocaleString('en-NG')}` : '—'}
            note="pay at the desk" last />
        </StatStrip>

        {bedSpaceRisk && (
          /* Repeated here because this is the screen the patient walks away
             with; the warning on the booking screen is easy to forget by the
             time they are in transit. */
          <Notice tone="red" icon="warning-outline">
            {bedSpaceStatus === 'none' ? 'No bed space was confirmed. ' : 'Bed space was very limited. '}
            That is not guaranteed to change by the time you arrive. Emergencies who arrive first,
            especially more urgent ones, are seen first. First aid may still be given as capacity allows.
          </Notice>
        )}

        <SectionHead title="Your booking" />
        <Card>
          <DetailRow label="Reference" value={bookingRef ?? '—'} mono />
          <DetailRow label="Hospital" value={hospital?.name ?? '—'} />
          <DetailRow label="Doctor" value="Assigned on arrival" />
          <DetailRow label="Arrival" value={slot ?? '—'} />
          {!!urgencyLabel && <DetailRow label="Urgency" value={urgencyLabel} />}
          <DetailRow label="Condition" value={symptom ?? '—'} last />
        </Card>

        <SectionHead title="What to do now" />
        <Card pad>
          {[
            slot === 'Now (walk-in)'
              ? 'Go to the emergency room now, and show this screen at triage'
              : `Arrive at ${hospital?.name ?? 'the hospital'} by your chosen time`,
            'Bring a valid ID and this confirmation',
            'You are flagged as priority — the front desk has been notified',
            'A doctor is assigned when you arrive',
          ].map((line, i) => (
            <View key={line} style={{ flexDirection: 'row', gap: 12, paddingVertical: 7 }}>
              <Mono size={13} weight="700" color={t.q.red}>{i + 1}</Mono>
              <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: t.q.ink70 }}>{line}</Text>
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14 }}>
          <Btn label="Call hospital" variant="secondary" small icon="call-outline" onPress={callHospital} />
          <Btn label="Get directions" variant="secondary" small icon="map-outline" onPress={getDirections} />
        </View>
      </Body>

      <BottomBar>
        <Btn label="View bookings" variant="secondary"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Appointments' } }] })} />
        <Btn grow label="Home"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] })} />
      </BottomBar>
    </Screen>
  )
}
