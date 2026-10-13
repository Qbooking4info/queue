import { useCallback, useState, type ReactNode } from 'react'
import { View, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '../components/ui/Typography'
import { Header, EmptyState, HeaderIconButton } from '../components/ui/v3'
import { useTheme } from '../contexts/ThemeContext'
import { haptics } from '../lib/haptics'
import { listConversations, ROLE_LABEL, type ChatRole, type Conversation } from '../lib/chat'

function when(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

// Conversation list. Patient app: chats with doctors. Queue Doctor: chats with patients.
export function MessagesScreen({ navigation, role, onBack, listHeader, onNew, subtitle, emptyBody }: {
  navigation: any; role: ChatRole; onBack?: () => void; listHeader?: ReactNode
  /** Shows a "New message" button in the header. */
  onNew?: () => void; subtitle?: string; emptyBody?: string
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
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Messages" subtitle={subtitle ?? (role === 'patient' ? 'Your doctors and hospitals' : 'Patients, doctors, hospitals and crews')} onBack={onBack}
        right={onNew ? <HeaderIconButton icon="create-outline" label="New message" onPress={onNew} /> : undefined} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.accent} /></View>
      ) : (
        <FlatList data={convs} keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          ListHeaderComponent={listHeader ? <>{listHeader}</> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
          ListEmptyComponent={notice ? <EmptyState icon="chatbubble-ellipses-outline" title="Chat unavailable" body={notice} /> :
            <EmptyState icon="chatbubbles-outline" title="No conversations yet"
              body={emptyBody ?? (role === 'patient' ? 'After a visit, open the appointment and tap "Message doctor" or "Message hospital".' : 'Conversations show up here.')}
              action={onNew ? 'New message' : undefined} onAction={onNew} />}
          renderItem={({ item }) => {
            const who = item.other
            const name = who?.display_name ?? 'Conversation'
            const initials = name.replace(/^Dr\.?\s*/i, '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
            const unread = item.unread ?? 0
            return (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${name}${unread ? `, ${unread} unread` : ''}`}
                onPress={() => { haptics.tap(); navigation.navigate('Chat', { conversationId: item.id, role }) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.cardBorder }}>
                {who?.avatar_url ? <Image source={{ uri: who.avatar_url }} style={{ width: 46, height: 46, borderRadius: 99 }} /> : (
                  <View style={{ width: 46, height: 46, borderRadius: 99, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: t.accent, fontWeight: '800' }}>{initials}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{name}</Text>
                    {!!who && <Text style={{ fontSize: 10, fontWeight: '700', color: t.accent, backgroundColor: t.accentBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' }}>{ROLE_LABEL[who.role]}</Text>}
                    <Text style={{ fontSize: 11, color: t.textMuted }}>{when(item.last_message_at ?? item.created_at)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: unread ? t.textPrimary : t.textMuted, fontWeight: unread ? '600' : '400' }}>
                      {item.status === 'closed' ? 'Closed · ' : ''}{item.last_body ?? 'No messages yet'}
                    </Text>
                    {unread > 0 && (
                      <View style={{ minWidth: 20, height: 20, borderRadius: 99, paddingHorizontal: 6, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: t.id === 'forest' ? '#081416' : '#FFFFFF' }}>{unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )
          }} />
      )}
    </SafeAreaView>
  )
}
