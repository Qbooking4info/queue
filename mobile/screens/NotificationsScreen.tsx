import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getNotifications, markNotificationRead, markAllNotificationsRead, getAppointmentById } from '../lib/api'
import { SkeletonRow } from '../components/ui/Skeleton'
import { haptics } from '../lib/haptics'

type NotifType = 'reminder' | 'confirmed' | 'cancelled' | 'virtual' | 'prescription' | 'lab' | 'payment' | 'waitlist' | 'review' | 'system'

const ACCENT: Record<string, string> = {
  reminder:    '#EF9F27',
  confirmed:   '#00E87A',
  cancelled:   '#FF5C5C',
  virtual:     '#5B9EFF',
  prescription:'#A78BFA',
  lab:         '#38BDF8',
  payment:     '#00E87A',
  waitlist:    '#EF9F27',
  review:      '#FBBF24',
  system:      '#94A3B8',
}
const ICON_BG: Record<string, string> = {
  reminder:'#1A3A28', confirmed:'#0D2A1F', cancelled:'#2A0D0D', virtual:'#0D1A3A',
  prescription:'#1E1040', lab:'#101A3A', payment:'#0D280D', waitlist:'#2A2010',
  review:'#2A1A00', system:'#1A1A1A',
}
const ICONS: Record<string, string> = {
  reminder:'📅', confirmed:'✅', cancelled:'❌', virtual:'💻',
  prescription:'💊', lab:'🔬', payment:'💳', waitlist:'🔔',
  review:'⭐', system:'🏥',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins < 60)   return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days < 7)    return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function groupLabel(iso: string): 'Today' | 'Yesterday' | 'Earlier' {
  const d   = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return 'Earlier'
}

interface Props { navigation: any }

export function NotificationsScreen({ navigation }: Props) {
  const { theme: t }           = useTheme()
  const { user }               = useAuth()
  const [items, setItems]      = useState<any[]>([])
  const [loading, setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) setLoading(true)
    const data = await getNotifications(user.id)
    setItems(data)
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const unreadCount = items.filter(n => !n.is_read).length
  const groups: ('Today' | 'Yesterday' | 'Earlier')[] = ['Today', 'Yesterday', 'Earlier']

  async function handleMarkAll() {
    if (!user) return
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    await markAllNotificationsRead(user.id)
  }

  async function handleMarkRead(id: string) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    await markNotificationRead(id)
  }

  // Types that carry an appointment_id we can navigate to
  const APPT_TYPES = new Set(['confirmed', 'pending', 'cancelled', 'reminder', 'virtual', 'payment', 'waitlist', 'review'])

  async function handleTap(n: any) {
    // Always mark read first
    if (!n.is_read) handleMarkRead(n.id)

    const appointmentId = n.data?.appointment_id
    const type: string  = n.type ?? ''

    if (APPT_TYPES.has(type) && appointmentId) {
      const appointment = await getAppointmentById(appointmentId)
      if (appointment) {
        navigation.navigate('AppointmentDetail', { appointment })
      }
      return
    }

    if (type === 'prescription' || type === 'lab') {
      navigation.navigate('Prescriptions')
      return
    }

    // system / unknown — no-op (already marked read)
  }

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={[st.backArrow, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[st.title, { color: t.textPrimary }]}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={[st.unreadCount, { color: t.textMuted }]}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAll}
            style={[st.markAllBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Text style={[st.markAllText, { color: t.accent }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ paddingTop: 8 }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }} tintColor={t.accent} />
          }>
          {groups.map(group => {
            const groupItems = items.filter(n => groupLabel(n.created_at) === group)
            if (!groupItems.length) return null
            return (
              <View key={group}>
                <View style={[st.groupRow, { borderBottomColor: t.cardBorder }]}>
                  <Text style={[st.groupLabel, { color: t.textMuted }]}>{group}</Text>
                  {group === 'Today' && unreadCount > 0 && (
                    <View style={[st.unreadBadge, { backgroundColor: t.accent }]}>
                      <Text style={st.unreadBadgeText}>
                        {items.filter(n => !n.is_read && groupLabel(n.created_at) === 'Today').length}
                      </Text>
                    </View>
                  )}
                </View>

                {groupItems.map(n => {
                  const accent = ACCENT[n.type] ?? '#94A3B8'
                  const iconBg = ICON_BG[n.type] ?? '#1A1A1A'
                  const icon   = ICONS[n.type]   ?? '🔔'
                  return (
                    <TouchableOpacity key={n.id} onPress={() => { haptics.tap(); handleTap(n) }} activeOpacity={0.7}
                      style={[st.row, {
                        backgroundColor: n.is_read ? t.canvasBg : t.cardBg,
                        borderBottomColor: t.cardBorder,
                      }]}>
                      {!n.is_read && <View style={[st.unreadDot, { backgroundColor: t.accent }]} />}
                      <View style={[st.iconWrap, { backgroundColor: iconBg, borderColor: `${accent}30` }]}>
                        <Text style={st.iconEmoji}>{icon}</Text>
                      </View>
                      <View style={st.content}>
                        <View style={st.contentTop}>
                          <Text style={[st.notifTitle, { color: t.textPrimary, fontWeight: n.is_read ? '500' : '700' }]}
                            numberOfLines={1}>{n.title}</Text>
                          <Text style={[st.time, { color: t.textMuted }]}>{relativeTime(n.created_at)}</Text>
                        </View>
                        <Text style={[st.body, { color: t.textSecondary }]} numberOfLines={2}>{n.body}</Text>
                      </View>
                      {(APPT_TYPES.has(n.type) && n.data?.appointment_id) || n.type === 'prescription' || n.type === 'lab'
                        ? <Text style={[st.chevron, { color: t.textMuted }]}>›</Text>
                        : null
                      }
                    </TouchableOpacity>
                  )
                })}
              </View>
            )
          })}

          {items.length === 0 && (
            <View style={st.empty}>
              <Ionicons name="notifications-outline" size={44} color={t.textMuted} style={{ marginBottom: 12, opacity: 0.4 }} />
              <Text style={[st.emptyTitle, { color: t.textPrimary }]}>All caught up</Text>
              <Text style={[st.emptySub, { color: t.textMuted }]}>No notifications yet. We'll let you know when something needs your attention.</Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe:            { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  backBtn:         { padding: 4 },
  backArrow:       { fontSize: 22 },
  title:           { fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  unreadCount:     { fontSize: 12, marginTop: 1 },
  markAllBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  markAllText:     { fontSize: 11, fontWeight: '700' },
  groupRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1 },
  groupLabel:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  unreadBadge:     { width: 18, height: 18, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { fontSize: 10, fontWeight: '800', color: '#000' },
  row:             { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, gap: 12, position: 'relative' },
  unreadDot:       { position: 'absolute', left: 8, top: 20, width: 6, height: 6, borderRadius: 3 },
  iconWrap:        { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1 },
  iconEmoji:       { fontSize: 20 },
  content:         { flex: 1, minWidth: 0 },
  contentTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 },
  notifTitle:      { fontSize: 13, flex: 1 },
  time:            { fontSize: 10, flexShrink: 0, marginTop: 1 },
  body:            { fontSize: 12, lineHeight: 17 },
  empty:           { alignItems: 'center', padding: 48 },
  emptyTitle:      { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptySub:        { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  chevron:         { fontSize: 20, fontWeight: '300', alignSelf: 'center', marginLeft: 4 },
})
