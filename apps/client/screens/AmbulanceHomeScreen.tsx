import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useState } from 'react'
import { View, TouchableOpacity, Linking, ScrollView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { getActiveTransport } from '@queue/shared/lib/ambulance-api'
import { haptics } from '@queue/shared/lib/haptics'
import { Header, Card, SectionTitle } from '@queue/shared/components/ui/v3'

interface Props { navigation: any }

export function AmbulanceHomeScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [active, setActive] = useState<{ id: string; status: string } | null>(null)

  useFocusEffect(useCallback(() => {
    getActiveTransport().then(r => setActive(r ? { id: r.id, status: r.status } : null)).catch(() => {})
  }, []))

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Ambulance" onBack={() => navigation.goBack()}>
          <Text style={{ color: '#CCFBF1', fontSize: 14, lineHeight: 20 }}>
            We find you an ambulance. If we can't, we tell you straight away and give you numbers that will.
          </Text>
        </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                <View style={{ padding: 20, gap: 12 }}>
          {active && (
            <Card onPress={() => navigation.navigate('AmbulanceTracking', { requestId: active.id })} accessibilityLabel="Your active ambulance request"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.accentBg, borderColor: t.accentBorder }}>
              <Ionicons name="navigate" size={22} color={t.accent} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.textPrimary }}>You have an active request · track it</Text>
              <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
            </Card>
          )}

          <TouchableOpacity onPress={() => { haptics.heavy(); navigation.navigate('Sos') }} accessibilityRole="button" accessibilityLabel="Emergency SOS"
            style={{ backgroundColor: '#B91C1C', borderRadius: 16, padding: 18, minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 56, height: 56, borderRadius: 99, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 15 }}>SOS</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>Emergency</Text>
              <Text style={{ color: '#FECACA', fontSize: 13, marginTop: 2, lineHeight: 18 }}>Hold to send. We start looking for a crew straight away and ask questions while we search.</Text>
            </View>
          </TouchableOpacity>

          <Card accessibilityLabel="Scheduled transport" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 96, opacity: 0.75 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="calendar-outline" size={26} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.textPrimary }}>Scheduled transport</Text>
              <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 2, lineHeight: 18 }}>Discharge, dialysis or a planned transfer — coming soon.</Text>
            </View>
          </Card>

          <Card style={{ gap: 10 }}>
            <SectionTitle title="Call directly" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['112', '112'], ['767', 'Lagos 767']].map(([num, label]) => (
                <TouchableOpacity key={num} onPress={() => Linking.openURL(`tel:${num}`)} accessibilityRole="button" accessibilityLabel={`Call ${label}`}
                  style={{ flex: 1, height: 52, borderRadius: 13, borderWidth: 1.5, borderColor: t.danger, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="call" size={18} color={t.danger} />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: t.danger }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
