import { useCallback, useState } from 'react'
import { View, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { getActiveTransport } from '@queue/shared/lib/ambulance-api'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Btn, Mono,
} from '@queue/shared/components/q'

interface Props { navigation: any }

export function AmbulanceHomeScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [active, setActive] = useState<{ id: string; status: string } | null>(null)

  useFocusEffect(useCallback(() => {
    getActiveTransport().then(r => setActive(r ? { id: r.id, status: r.status } : null)).catch(() => {})
  }, []))

  return (
    <Screen>
      <AppBar title="Ambulance" onBack={() => navigation.goBack()} />

      <Body>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60 }}>
            We find you an ambulance. If we cannot, we say so straight away and give you numbers that will.
          </Text>
        </View>

        {active && (
          <Card style={{ marginBottom: 12 }}>
            <Row
              icon="navigate"
              tint
              title="You have an active request"
              sub="Track where the crew is now"
              chevron
              onPress={() => navigation.navigate('AmbulanceTracking', { requestId: active.id })}
            />
          </Card>
        )}

        <Card>
          <Row
            icon="warning-outline" iconTone="red"
            title="Emergency ambulance"
            sub="Send an SOS — the nearest crew is dispatched"
            titleColor={t.q.red}
            chevron
            onPress={() => { haptics.heavy(); navigation.navigate('Sos') }}
          />
          <Hair />
          <Row
            icon="business-outline"
            title="Book an emergency slot"
            sub="Get yourself there — we hold a place at the hospital"
            chevron
            onPress={() => navigation.navigate('EmergencyBooking')}
          />
          <Hair />
          <Row
            icon="calendar-outline" iconTone="neutral"
            title="Scheduled transport"
            sub="Discharge, dialysis or a planned transfer"
            pill="Soon" pillTone="neutral"
          />
        </Card>

        <SectionHead title="Call directly" />
        <Card>
          {([
            ['112', 'Lagos State Emergency', 'Free from any phone'],
            ['767', 'LASAMBUS', 'Lagos ambulance service'],
          ] as const).map(([num, name, sub], i) => (
            <View key={num}>
              {i > 0 && <Hair />}
              <Row
                icon="call-outline" iconTone="red"
                title={name}
                sub={sub}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Mono size={15} weight="700">{num}</Mono>
                    <Btn label="Call" variant="secondary" small
                      onPress={() => Linking.openURL(`tel:${num}`).catch(() => {})} />
                  </View>
                }
              />
            </View>
          ))}
        </Card>

        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
            If someone is not breathing, call 112 now as well as sending an SOS.
          </Text>
        </View>
      </Body>
    </Screen>
  )
}
