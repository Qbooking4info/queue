import { SafeAreaView } from 'react-native-safe-area-context'
import { View, ScrollView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { Header, Card, ListRow } from '@queue/shared/components/ui/v3'

interface Props { navigation: any }

// v3.1 My Care hub. Records and health profile both live in MedicalHistory today;
// care plans need the care_plans tables, which aren't built yet.
export function MyCareScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, switchedInto } = useAuth() as any
  const who = switchedInto ? user?.full_name?.split(' ')[0] : null

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="My Care" subtitle={who ? `Managing for ${who}` : undefined} onBack={() => navigation.goBack()}>
          <Text style={{ color: '#CCFBF1', fontSize: 14 }}>Your records, medicines and plans in one place.</Text>
        </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                <View style={{ padding: 20 }}>
          <Card style={{ paddingVertical: 0 }}>
            <ListRow icon="document-text-outline" title="Medical records" subtitle="Consultations, conditions and allergies"
              onPress={() => navigation.navigate('MedicalHistory')} />
            <ListRow icon="medkit-outline" title="Prescriptions" subtitle="Medicines and lab results"
              onPress={() => navigation.navigate('Prescriptions')} />
            <ListRow icon="checkbox-outline" title="Care plans" subtitle="Plans from your doctor · coming soon" />
            <ListRow icon="person-circle-outline" title="Health profile" subtitle="Blood group, genotype, allergies"
              onPress={() => navigation.navigate('MedicalHistory')} />
            <ListRow icon="time-outline" title="Visit history" subtitle="Notes and summaries from past visits" last
              onPress={() => navigation.navigate('MainTabs', { screen: 'Appointments' })} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
