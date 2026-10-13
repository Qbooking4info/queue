// "New message" picker used by every app: a searchable list of people/places the
// caller may message. Picking one opens (or reuses) the thread via
// start_conversation, which re-checks the relationship server-side.
import { useMemo, useState } from 'react'
import { View, Modal, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text, TextInput } from './ui/Typography'
import { EmptyState } from './ui/v3'
import { useTheme } from '../contexts/ThemeContext'
import { Alert } from '../contexts/AlertContext'
import { haptics } from '../lib/haptics'
import { startConversation, type ChatTarget } from '../lib/chat'

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
        <View style={{ backgroundColor: t.canvasBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', minHeight: '55%', paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: t.textPrimary }} accessibilityRole="header">{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"
              style={{ width: 44, height: 44, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: t.cardBg }}>
              <Ionicons name="close" size={20} color={t.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={t.textMuted} accessibilityLabel="Search"
              style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, paddingHorizontal: 14, color: t.textPrimary, fontSize: 15 }} />
          </View>
          {loading ? <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} /> : (
            <FlatList data={list} keyExtractor={o => o.target + o.id} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              ListEmptyComponent={<EmptyState icon="people-outline" title="No one to message yet" body="People you have a visit, link or job with show up here." />}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => pick(item)} disabled={!!busyId} accessibilityRole="button" accessibilityLabel={`Message ${item.title}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg }}>
                  {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={{ width: 42, height: 42, borderRadius: 99 }} /> : (
                    <View style={{ width: 42, height: 42, borderRadius: 99, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={item.icon ?? 'person-outline'} size={20} color={t.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }} numberOfLines={1}>{item.title}</Text>
                    {!!item.subtitle && <Text style={{ fontSize: 12, color: t.textMuted }} numberOfLines={1}>{item.subtitle}</Text>}
                  </View>
                  {busyId === item.id ? <ActivityIndicator color={t.accent} /> : <Ionicons name="chatbubble-ellipses-outline" size={18} color={t.accent} />}
                </TouchableOpacity>
              )} />
          )}
        </View>
      </View>
    </Modal>
  )
}
