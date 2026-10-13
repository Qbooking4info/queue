import { Card, ListRow } from '@queue/shared/components/ui/v3'
import { MessagesScreen as ConversationList } from '@queue/shared/screens/MessagesScreen'

interface Props { navigation: any }

// Messages tab: chat consults with doctors the patient has seen, with Queue Support
// (payments, refunds, the app) pinned on top.
export function MessagesScreen({ navigation }: Props) {
  return (
    <ConversationList navigation={navigation} role="patient"
      listHeader={
        <Card style={{ paddingVertical: 0 }}>
          <ListRow icon="help-buoy-outline" title="Queue Support" subtitle="Payments, refunds or the app · always available" last
            onPress={() => navigation.navigate('Support')} />
        </Card>
      } />
  )
}
