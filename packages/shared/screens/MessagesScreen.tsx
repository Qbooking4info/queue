import { useCallback, useState, type ReactNode } from 'react'
import { View, FlatList, RefreshControl, ActivityIndicator, Image } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '../components/ui/Typography'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { listConversations, ROLE_LABEL, type ChatRole, type Conversation } from '../lib/chat'
import {
  Screen, AppBar, Card, Row, Hair, Empty, IconBtn, Initials, Mono,
} from '../components/q'

function when(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

// Conversation list. Patient app: chats with doctors and hospitals.
// Queue Doctor / Hospital / Ambulance: chats with the other side.
export function MessagesScreen({ navigation, role, onBack, listHeader, onNew, subtitle, emptyBody }: {
  navigation: any
  role: ChatRole
  onBack?: () => void
  listHeader?: ReactNode
  /** Shows a "New message" button in the header. */
  onNew?: () => void
  subtitle?: string
  emptyBody?: string
}) {
  const { theme: t } = useTheme()
  const [convs, setConvs] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const r = await listConversations(role)
    if (r.ok) { setConvs(r.data); setNotice('') }
    else setNotice(r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error)
    setLoading(false); setRefreshing(false)
  }, [role])

  useFocusEffect(useCallback(() => { load() }, [load]))

  return (
    <Screen>
      {onBack
        ? <AppBar title="Messages" sub={subtitle} onBack={onBack}
            right={onNew ? <IconBtn name="create-outline" label="New message" onPress={onNew} /> : undefined} />
        : <AppBar large title="Messages"
            right={onNew ? <IconBtn name="create-outline" label="New message" onPress={onNew} /> : undefined} />}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : (
        <FlatList
          data={convs}
          keyExtractor={c => c.id}
          contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
          ListHeaderComponent={listHeader ? <>{listHeader}</> : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
              tintColor={t.q.primary} colors={[t.q.primary]} />
          }
          ListEmptyComponent={
            <Card style={{ marginTop: 16 }}>
              {notice
                ? <Empty icon="chatbubble-ellipses-outline" title="Chat unavailable" body={notice} />
                : <Empty
                    icon="chatbubbles-outline"
                    title="No conversations yet"
                    body={emptyBody ?? (role === 'patient'
                      ? 'After a visit, open the appointment and tap "Message doctor" or "Message the hospital".'
                      : 'Conversations show up here.')}
                    action={onNew ? 'New message' : undefined}
                    onAction={onNew}
                  />}
            </Card>
          }
          renderItem={({ item, index }) => {
            const who = item.other
            const name = who?.display_name ?? 'Conversation'
            const unread = item.unread ?? 0
            return (
              <Card style={index === 0 ? undefined : { marginTop: -1 }}>
                {index > 0 && <Hair inset={0} />}
                <Row
                  leading={
                    who?.avatar_url
                      ? <Image source={{ uri: who.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                      : <Initials name={name} size={44} />
                  }
                  title={name}
                  sub={`${item.status === 'closed' ? 'Closed · ' : ''}${item.last_body ?? 'No messages yet'}`}
                  // The time and the unread count are the two things that make
                  // this row scannable, so they share the right edge rather
                  // than competing with a role pill.
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Mono size={11} color={t.q.ink60}>{when(item.last_message_at ?? item.created_at)}</Mono>
                      {unread > 0 ? (
                        <View style={{
                          minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
                          backgroundColor: t.q.primary, alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: t.q.onPrimary }}>{unread}</Text>
                        </View>
                      ) : who ? (
                        <Text style={{ fontSize: 10.5, color: t.q.ink60 }}>{ROLE_LABEL[who.role]}</Text>
                      ) : null}
                    </View>
                  }
                  onPress={() => { haptics.tap(); navigation.navigate('Chat', { conversationId: item.id, role }) }}
                />
              </Card>
            )
          }}
        />
      )}
    </Screen>
  )
}
