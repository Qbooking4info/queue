import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

interface Notification {
  id: string; title: string; body: string; type: string
  is_read: boolean; created_at: string
}

const TYPE_ICON: Record<string, string> = {
  appointment: '📅',
  reminder: '🔔',
  result: '🧪',
  promotion: '🎁',
  system: '⚙️',
}

export function NotificationsScreen({ navigation }: { navigation: any }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
        if (!profile) { setLoading(false); return }
        const { data } = await supabase
          .from('notifications')
          .select('id,title,body,type,is_read,created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(30)
        setNotifications((data as Notification[]) ?? [])
      } catch (_) {}
      setLoading(false)
    }
    load()
  }, [])

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  function timeAgo(dateStr: string) {
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime())
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const unread = notifications.filter(n => !n.is_read).length

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications</Text>
          {unread > 0 && <Text style={styles.unreadCount}>{unread} unread</Text>}
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.placeholder}>Loading…</Text>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>🔔</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>Appointment reminders, updates, and alerts will appear here</Text>
          </View>
        ) : (
          notifications.map(n => (
            <TouchableOpacity
              key={n.id}
              style={[styles.card, !n.is_read && styles.cardUnread]}
              activeOpacity={0.7}
              onPress={() => markRead(n.id)}>
              <View style={styles.iconWrap}>
                <Text style={{ fontSize: 20 }}>{TYPE_ICON[n.type] ?? '🔔'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={[styles.notifTitle, !n.is_read && styles.notifTitleUnread]}>{n.title}</Text>
                  <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
                </View>
                <Text style={styles.body} numberOfLines={2}>{n.body}</Text>
              </View>
              {!n.is_read && <View style={styles.dot} />}
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: t.bg },
  header:           { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:          { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:            { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  unreadCount:      { fontSize: font.xs, color: t.accent, fontWeight: '600', marginTop: 1 },
  scroll:           { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  placeholder:      { color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
  emptyState:       { alignItems: 'center', paddingVertical: 60 },
  emptyTitle:       { fontSize: font.lg, fontWeight: '700', color: t.text, marginBottom: 6 },
  emptyBody:        { fontSize: font.sm, color: t.textSub, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  card:             { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm },
  cardUnread:       { borderColor: t.accentBorder, backgroundColor: '#111D15' },
  iconWrap:         { width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' },
  notifTitle:       { fontSize: font.sm, fontWeight: '600', color: t.textSub, flex: 1 },
  notifTitleUnread: { color: t.text, fontWeight: '700' },
  time:             { fontSize: font.xs, color: t.textMuted, marginLeft: 8 },
  body:             { fontSize: font.sm, color: t.textSub, lineHeight: 19 },
  dot:              { width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent, marginTop: 4 },
})
