import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useState } from 'react'
import { View, ScrollView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { getPatientAppointments } from '@queue/shared/lib/api'
import { StatusBadge } from '@queue/shared/components/ui/StatusBadge'
import { Header, Card, SectionTitle, SegmentedControl, PrimaryButton, ListRow } from '@queue/shared/components/ui/v3'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'

type Mode = 'video' | 'audio' | 'chat'

const COPY: Record<Mode, { title: string; body: string }> = {
  video: { title: 'Video visit', body: 'Face to face with a doctor. Best for rashes, swelling or anything they should see.' },
  audio: { title: 'Audio visit', body: 'A voice call when your connection is weak or you prefer not to be on camera.' },
  chat:  { title: 'Chat consult', body: 'Message a doctor you have seen before about results, medicines or follow-up questions.' },
}

interface Props { navigation: any }

export function VirtualCareScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [mode, setMode] = useState<Mode>('video')
  const [visits, setVisits] = useState<AppointmentWithRelations[]>([])

  useFocusEffect(useCallback(() => {
    getPatientAppointments().then(r => {
      if (r.ok) setVisits(r.data.filter(a => a.type === 'virtual').slice(0, 5))
    })
  }, []))

  const c = COPY[mode]
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Virtual Care" onBack={() => navigation.goBack()}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 48, height: 48, borderRadius: 99, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="videocam" size={24} color="#0F766E" />
              </View>
            </View>
            <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 26 }}>See a doctor from home</Text>
          </View>
        </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                <View style={{ padding: 20, gap: 14 }}>
          <SegmentedControl<Mode> value={mode} onChange={setMode}
            options={[{ value: 'video', label: 'Video' }, { value: 'audio', label: 'Audio' }, { value: 'chat', label: 'Chat' }]} />

          <Card style={{ gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>{c.title}</Text>
            <Text style={{ fontSize: 14, color: t.textMuted, lineHeight: 20 }}>{c.body}</Text>
            {mode !== 'chat' && <Text style={{ fontSize: 13, color: t.textSecondary }}>You pay before you join the waiting room.</Text>}
            <PrimaryButton label={mode === 'chat' ? 'Open messages' : 'Choose a doctor'}
              onPress={() => mode === 'chat' ? navigation.navigate('MainTabs', { screen: 'Messages' })
                : navigation.navigate('DoctorSearch', { initialFilter: 'virtual' })} />
          </Card>

          <SectionTitle title="My virtual visits" />
          {visits.length === 0 ? (
            <Text style={{ fontSize: 14, color: t.textMuted }}>No virtual visits yet.</Text>
          ) : (
            <Card style={{ paddingVertical: 0 }}>
              {visits.map((v, i) => (
                <ListRow key={v.id} icon="videocam-outline" title={v.doctor?.full_name ?? 'Doctor'}
                  subtitle={`${v.appointment_date}${v.start_time ? ' · ' + v.start_time.slice(0, 5) : ''}`}
                  trailing={<StatusBadge type={v.status} />} last={i === visits.length - 1}
                  onPress={() => navigation.navigate('AppointmentDetail', { appointment: v })} />
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
