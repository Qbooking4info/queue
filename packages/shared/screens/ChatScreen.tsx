import { useCallback, useEffect, useRef, useState } from 'react'
import { View, FlatList, TouchableOpacity, KeyboardAvoidingView, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text, TextInput } from '../components/ui/Typography'
import { Screen, AppBar, Card, Empty, Notice } from '../components/q'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { haptics } from '../lib/haptics'
import {
  getConversation, listMessages, sendMessage, markRead, subscribeToMessages, ROLE_LABEL,
  type ChatMessage, type ChatRole, type Conversation,
} from '../lib/chat'

interface Props {
  navigation: any
  route: { params: { conversationId: string; role?: ChatRole } }
}

// Shared by all four apps. Which side "I" am comes from the conversation itself
// (my membership, or my hospital's inbox), not from the app.
export function ChatScreen({ navigation, route }: Props) {
  const { conversationId } = route.params
  const { theme: t } = useTheme()
  const [conv, setConv] = useState<Conversation | null>(null)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const list = useRef<FlatList<ChatMessage>>(null)

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([getConversation(conversationId), listMessages(conversationId)])
    if (!c.ok) setError(c.notReady ? 'Messaging is being switched on. Please check back soon.' : c.error)
    else setConv(c.data)
    if (m.ok) setMsgs(m.data)
    setLoading(false)
    markRead(conversationId).catch(() => {})
  }, [conversationId])

  const myId = conv?.me?.id
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeToMessages(conversationId, m => {
    setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
    if (m.sender_member_id !== myId) { haptics.tap(); markRead(conversationId).catch(() => {}) }
  }), [conversationId, myId])

  useEffect(() => { if (msgs.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50) }, [msgs.length])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true); haptics.tap()
    const r = await sendMessage({ conversationId, body })
    setSending(false)
    if (r.ok) { setDraft(''); setMsgs(prev => prev.some(x => x.id === r.data.id) ? prev : [...prev, r.data]) }
    else { haptics.error(); setError(r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error) }
  }

  const other = conv?.other
  const closed = conv?.status === 'closed'
  const iAmPatient = conv?.me?.role === 'patient'

  return (
    <Screen>
      <AppBar
        title={other?.display_name ?? 'Conversation'}
        sub={other ? ROLE_LABEL[other.role] : undefined}
        onBack={() => navigation.goBack()}
      />
      {/* A message is not an emergency channel, and nobody watching a thread
          for a reply should have to work that out for themselves. */}
      {iAmPatient && (
        <TouchableOpacity onPress={() => navigation.navigate('Sos')} accessibilityRole="button"
          accessibilityLabel="Emergency SOS"
          style={{ backgroundColor: t.q.redBg, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={16} color={t.q.red} />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: t.q.ink }}>
            Chest pain, fainting or trouble breathing? Don&apos;t wait for a reply — <Text style={{ fontWeight: '800', color: t.q.red }}>tap for SOS</Text>
          </Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.q.primary} /></View>
        ) : error && !conv ? (
          <Card style={{ marginTop: 16 }}>
            <Empty icon="chatbubble-ellipses-outline" title="Chat unavailable" body={error} />
          </Card>
        ) : (
          <FlatList ref={list} data={msgs} keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: t.q.ink60, fontSize: 13, marginTop: 24 }}>
              {iAmPatient ? 'Say hello and describe how you feel. Replies show up here.' : 'No messages yet. Say hello.'}</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_member_id === myId
              return (
                <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  {!mine && other?.role === 'hospital' && !!item.sender_name && (
                    <Text style={{ fontSize: 11, color: t.q.ink60, marginBottom: 2 }}>{item.sender_name}</Text>
                  )}
                  <View style={{ backgroundColor: mine ? t.q.primary : t.q.surface, borderWidth: mine ? 0 : 1, borderColor: t.q.line,
                    borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 12, paddingVertical: 9 }}>
                    <Text style={{ fontSize: 15, lineHeight: 21, color: mine ? t.q.onPrimary : t.q.ink }}>{item.body}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: t.q.ink60, marginTop: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                    {new Date(item.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    {mine && other?.last_read_at && new Date(other.last_read_at) >= new Date(item.created_at) ? ' · Read' : ''}
                  </Text>
                </View>
              )
            }} />
        )}

        {!!error && !!conv && <Notice tone="red">{error}</Notice>}

        {conv && (closed ? (
          <Text style={{ textAlign: 'center', color: t.q.ink60, padding: 16, fontSize: 13 }}>This conversation is closed.</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: t.q.line, backgroundColor: t.q.surface }}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message" placeholderTextColor={t.q.ink60} multiline
              accessibilityLabel="Message" maxLength={4000}
              style={{ flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, borderWidth: 1, borderColor: t.q.line, backgroundColor: t.q.field,
                paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, fontSize: 15, color: t.q.ink }} />
            <TouchableOpacity onPress={send} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send"
              style={{ width: 48, height: 48, borderRadius: 99, backgroundColor: draft.trim() ? t.q.primary : t.q.muted, alignItems: 'center', justifyContent: 'center' }}>
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={18} color={t.q.onPrimary} />}
            </TouchableOpacity>
          </View>
        ))}
      </KeyboardAvoidingView>
    </Screen>
  )
}
