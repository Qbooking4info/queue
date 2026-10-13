import { useCallback, useEffect, useRef, useState } from 'react'
import { View, FlatList, TouchableOpacity, KeyboardAvoidingView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Text, TextInput } from '../components/ui/Typography'
import { Header, EmptyState } from '../components/ui/v3'
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
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title={other?.display_name ?? 'Conversation'} subtitle={other ? ROLE_LABEL[other.role] : undefined} onBack={() => navigation.goBack()} />
      {iAmPatient && (
        <TouchableOpacity onPress={() => navigation.navigate('Sos')} accessibilityRole="button"
          style={{ backgroundColor: t.dangerSubtle, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={16} color={t.danger} />
          <Text style={{ flex: 1, fontSize: 12, color: t.textPrimary, lineHeight: 17 }}>
            Chest pain, fainting or trouble breathing? Don't wait for a reply — <Text style={{ fontWeight: '800', color: t.danger }}>tap for SOS</Text>
          </Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.accent} /></View>
        ) : error && !conv ? (
          <EmptyState icon="chatbubble-ellipses-outline" title="Chat unavailable" body={error} />
        ) : (
          <FlatList ref={list} data={msgs} keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 24 }}>
              {iAmPatient ? 'Say hello and describe how you feel. Replies show up here.' : 'No messages yet. Say hello.'}</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_member_id === myId
              return (
                <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  {!mine && other?.role === 'hospital' && !!item.sender_name && (
                    <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 2 }}>{item.sender_name}</Text>
                  )}
                  <View style={{ backgroundColor: mine ? t.accent : t.cardBg, borderWidth: mine ? 0 : 1, borderColor: t.cardBorder,
                    borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 12, paddingVertical: 9 }}>
                    <Text style={{ fontSize: 15, lineHeight: 21, color: mine ? (t.id === 'forest' ? '#081416' : '#FFFFFF') : t.textPrimary }}>{item.body}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: t.textMuted, marginTop: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                    {new Date(item.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    {mine && other?.last_read_at && new Date(other.last_read_at) >= new Date(item.created_at) ? ' · Read' : ''}
                  </Text>
                </View>
              )
            }} />
        )}

        {!!error && !!conv && <Text accessibilityRole="alert" style={{ color: t.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 }}>{error}</Text>}

        {conv && (closed ? (
          <Text style={{ textAlign: 'center', color: t.textMuted, padding: 16, fontSize: 13 }}>This conversation is closed.</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: t.cardBorder, backgroundColor: t.cardBg }}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message" placeholderTextColor={t.textMuted} multiline
              accessibilityLabel="Message" maxLength={4000}
              style={{ flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg,
                paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, fontSize: 15, color: t.textPrimary }} />
            <TouchableOpacity onPress={send} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send"
              style={{ width: 48, height: 48, borderRadius: 99, backgroundColor: draft.trim() ? t.accent : t.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={18} color={t.id === 'forest' ? '#081416' : '#FFFFFF'} />}
            </TouchableOpacity>
          </View>
        ))}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
