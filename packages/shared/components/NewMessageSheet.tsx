// "New message" picker used by every app: a searchable list of people/places the
// caller may message. Picking one opens (or reuses) the thread via
// start_conversation, which re-checks the relationship server-side.
import { useMemo, useState } from 'react'
import { View, Modal, FlatList, ActivityIndicator, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from './ui/Typography'
import { useTheme } from '../contexts/ThemeContext'
import { Alert } from '../contexts/AlertContext'
import { haptics } from '../lib/haptics'
import { startConversation, type ChatTarget } from '../lib/chat'
import { Card, Hair, Row, SearchField, IconBtn, Empty } from './q'

export interface ChatOption { id: string; target: ChatTarget; title: string; subtitle?: string; avatarUrl?: string | null; icon?: React.ComponentProps<typeof Ionicons>['name'] }

export function NewMessageSheet({ visible, onClose, options, loading, navigation, title = 'New message' }: {
  visible: boolean; onClose: () => void; options: ChatOption[]; loading?: boolean; navigation: any; title?: string
}) {
  const { theme: t } = useTheme()
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter(o => o.title.toLowerCase().includes(s) || o.subtitle?.toLowerCase().includes(s)) : options
  }, [q, options])

  async function pick(o: ChatOption) {
    setBusyId(o.id); haptics.tap()
    const r = await startConversation(o.target, o.id)
    setBusyId(null)
    if (!r.ok) {
      haptics.error()
      Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error)
      return
    }
    onClose(); setQ('')
    navigation.navigate('Chat', { conversationId: r.data })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: t.q.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          maxHeight: '85%', minHeight: '55%', paddingBottom: 24,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
            <Text accessibilityRole="header" style={{ flex: 1, fontSize: 17, fontWeight: '700', letterSpacing: -0.2, color: t.q.ink }}>
              {title}
            </Text>
            <IconBtn name="close" label="Close" onPress={onClose} />
          </View>
          <SearchField value={q} onChangeText={setQ} placeholder="Search" />
          {loading ? <ActivityIndicator color={t.q.primary} style={{ marginTop: 30 }} /> : (
            <Card style={{ flexShrink: 1 }}>
              <FlatList
                data={list}
                keyExtractor={o => o.target + o.id}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <Hair />}
                ListEmptyComponent={
                  <Empty icon="people-outline" title="No one to message yet"
                    body="People you have a visit, link or job with show up here." />
                }
                renderItem={({ item }) => (
                  <Row
                    leading={item.avatarUrl
                      ? <Image source={{ uri: item.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      : undefined}
                    icon={item.avatarUrl ? undefined : (item.icon ?? 'person-outline')}
                    iconTone="teal"
                    title={item.title}
                    sub={item.subtitle ?? null}
                    right={busyId === item.id
                      ? <ActivityIndicator color={t.q.primary} />
                      : <Ionicons name="chatbubble-outline" size={18} color={t.q.primary} />}
                    onPress={busyId ? undefined : () => pick(item)} />
                )} />
            </Card>
          )}
        </View>
      </View>
    </Modal>
  )
}
