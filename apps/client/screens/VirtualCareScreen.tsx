import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { getPatientAppointments } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Btn, BottomBar,
  Empty, Mono, type PillTone,
} from '@queue/shared/components/q'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'

type Mode = 'video' | 'audio' | 'chat'

const MODES: { key: Mode; title: string; body: string; icon: 'videocam-outline' | 'call-outline' | 'chatbubble-outline' }[] = [
  { key: 'video', title: 'Video visit', body: 'Face to face on your phone. Best for anything a doctor should see.', icon: 'videocam-outline' },
  { key: 'audio', title: 'Audio visit', body: 'Uses less data, and no camera.', icon: 'call-outline' },
  { key: 'chat', title: 'Chat consult', body: 'Message a doctor you have seen before about results or medicines.', icon: 'chatbubble-outline' },
]

function pillFor(a: AppointmentWithRelations): { label: string; tone: PillTone } {
  if (a.status === 'in_progress') return { label: 'In the call', tone: 'teal' }
  if (a.status === 'confirmed') return { label: 'Confirmed', tone: 'green' }
  if (a.status === 'pending') return { label: 'Awaiting approval', tone: 'amber' }
  if (a.status === 'completed') return { label: 'Seen', tone: 'neutral' }
  return { label: a.status.replace(/_/g, ' '), tone: 'neutral' }
}

interface Props { navigation: any }

export function VirtualCareScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [mode, setMode] = useState<Mode>('video')
  const [visits, setVisits] = useState<AppointmentWithRelations[]>([])
  const [available, setAvailable] = useState<number | null>(null)

  useFocusEffect(useCallback(() => {
    getPatientAppointments().then(r => {
      if (r.ok) setVisits(r.data.filter(a => a.type === 'virtual').slice(0, 5))
    })
    supabase.from('doctors').select('id', { count: 'exact', head: true })
      .eq('accepts_virtual', true).eq('is_active', true)
      .then(({ count }) => setAvailable(count ?? null))
  }, []))

  return (
    <Screen>
      <AppBar title="Virtual care" onBack={() => navigation.goBack()} />

      <Body>
        <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 4 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: t.q.ink }}>
            See a doctor from home
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60 }}>
            You pay before you join the waiting room.
          </Text>
        </View>

        <Card>
          <View style={{ padding: 14, paddingBottom: 6 }}><CardLabel>How you want to be seen</CardLabel></View>
          {MODES.map((m, i) => (
            <View key={m.key}>
              {i > 0 && <Hair />}
              <Row
                icon={m.icon}
                iconTone={mode === m.key ? 'teal' : 'neutral'}
                tint={mode === m.key}
                title={m.title}
                sub={m.body}
                right={mode === m.key ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                onPress={() => setMode(m.key)}
              />
            </View>
          ))}
        </Card>

        {/* The handoff prints a price against each mode. Fees are set per
            doctor (doctors.virtual_fee), not per mode, so the real figure
            appears on the doctor you choose rather than being guessed here. */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
            Each doctor sets their own virtual fee. You see it before you pay.
          </Text>
        </View>

        <SectionHead title="My virtual visits" />
        {visits.length === 0 ? (
          <Card>
            <Empty icon="videocam-outline" title="No virtual visits yet"
              body="Choose a doctor below to book your first one." />
          </Card>
        ) : (
          <Card>
            {visits.map((v, i) => {
              const p = pillFor(v)
              return (
                <View key={v.id}>
                  {i > 0 && <Hair />}
                  <Row
                    icon="videocam-outline"
                    title={v.doctor?.full_name ?? 'Doctor'}
                    sub={`${new Date(v.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}${v.start_time ? ' · ' + v.start_time.slice(0, 5) : ''}`}
                    pill={p.label} pillTone={p.tone}
                    chevron
                    onPress={() => navigation.navigate('AppointmentDetail', { appointment: v })}
                  />
                </View>
              )
            })}
          </Card>
        )}
      </Body>

      <BottomBar meta={
        available != null ? (
          <Mono size={12} color={t.q.ink60}>
            {available} {available === 1 ? 'doctor' : 'doctors'} see patients online
          </Mono>
        ) : undefined
      }>
        <Btn
          grow
          label={mode === 'chat' ? 'Open messages' : 'Choose a doctor'}
          onPress={() => mode === 'chat'
            ? navigation.navigate('MainTabs', { screen: 'Messages' })
            : navigation.navigate('DoctorSearch', { initialFilter: 'virtual' })}
        />
      </BottomBar>
    </Screen>
  )
}
