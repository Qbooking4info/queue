import { Card, Row } from '@queue/shared/components/q'
import { MessagesScreen as ConversationList } from '@queue/shared/screens/MessagesScreen'

interface Props { navigation: any }

// Messages tab: chats with doctors and hospitals the patient has seen, with
// Queue Support (payments, refunds, the app) pinned on top.
export function MessagesScreen({ navigation }: Props) {
  return (
    <ConversationList
      navigation={navigation}
      role="patient"
      listHeader={
        <Card style={{ marginBottom: 12 }}>
          <Row
            icon="help-buoy-outline"
            title="Queue Support"
            sub="Payments, refunds or the app · always available"
            chevron
            onPress={() => navigation.navigate('Support')}
          />
        </Card>
      }
    />
  )
}
