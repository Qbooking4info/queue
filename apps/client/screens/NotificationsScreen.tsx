import { useState, useCallback } from 'react'
import { View, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Empty, IconBtn, Mono,
  type PillTone,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { getNotifications, markNotificationRead, markAllNotificationsRead, getAppointmentById } from '@queue/shared/lib/api'
import { SkeletonRow } from '@queue/shared/components/ui/Skeleton'
import { haptics } from '@queue/shared/lib/haptics'

type NotifType = 'reminder' | 'confirmed' | 'cancelled' | 'virtual' | 'prescription' | 'lab' | 'payment' | 'waitlist' | 'review' | 'system' | 'no_show' | 'reschedule_prompt'

// Every notification type, mapped onto the kit's five tones rather than a
// colour of its own. Twelve bespoke accents was twelve chances for two screens
// to disagree about what "payment" looks like.
const TONE: Record<string, PillTone> = {
  reminder: 'amber',
  confirmed: 'green',
  cancelled: 'red',
  virtual: 'teal',
  prescription: 'teal',
  lab: 'teal',
  payment: 'green',
  waitlist: 'amber',
  review: 'amber',
  system: 'neutral',
  no_show: 'red',
  reschedule_prompt: 'amber',
  transport: 'red',
  dispatch_offer: 'red',
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  reminder:'alarm-outline', confirmed:'checkmark-circle-outline', cancelled:'close-circle-outline', virtual:'videocam-outline',
  prescription:'medkit-outline', lab:'flask-outline', payment:'card-outline', waitlist:'hourglass-outline',
  review:'star-outline', system:'business-outline',
  no_show:'alert-circle-outline', reschedule_prompt:'calendar-outline',
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
    // No signed-in user means there is nothing to load and never will be;
    // returning without clearing `loading` leaves a spinner for ever.
    if (!user) { setLoading(false); return }
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
  const APPT_TYPES = new Set(['confirmed', 'pending', 'cancelled', 'reminder', 'virtual', 'payment', 'waitlist', 'review', 'no_show', 'reschedule_prompt'])

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

    // Ambulance dispatch. These carry request_id (and for a crew offer,
    // offer_id) and were falling through to the no-op below, so tapping the
    // most time-critical notification in the app did nothing at all.
    const requestId = n.data?.request_id
    if ((type === 'transport' || type === 'dispatch_offer') && requestId) {
      navigation.navigate('AmbulanceTracking', { requestId: String(requestId) })
      return
    }

    // system / unknown — no-op (already marked read)
  }

  return (
    <Screen>
      <AppBar
        title="Notifications"
        sub={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        onBack={() => navigation.goBack()}
        right={unreadCount > 0
          ? <IconBtn name="checkmark-done-outline" label="Mark all read" onPress={handleMarkAll} />
          : undefined}
      />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }}
          tintColor={t.q.primary} colors={[t.q.primary]} />
      }>
        {loading ? (
          <Card><SkeletonRow /><SkeletonRow /><SkeletonRow /></Card>
        ) : items.length === 0 ? (
          <Card style={{ marginTop: 16 }}>
            <Empty icon="notifications-outline" title="Nothing yet"
              body="Queue tells you here when your number moves, a booking is approved, or a payment goes through." />
          </Card>
        ) : (
          groups.map(g => {
            const inGroup = items.filter(n => groupLabel(n.created_at) === g)
            if (inGroup.length === 0) return null
            return (
              <View key={g}>
                <SectionHead title={g} />
                <Card>
                  {inGroup.map((n, i) => (
                    <View key={n.id}>
                      {i > 0 && <Hair />}
                      <Row
                        icon={ICONS[n.type] ?? 'notifications-outline'}
                        iconTone={TONE[n.type] ?? 'neutral'}
                        // An unread notification is tinted rather than badged:
                        // the row already carries a status pill's worth of
                        // meaning in its own type, and two markers on one row
                        // is the pattern this system does not use.
                        tint={!n.is_read}
                        title={n.title ?? 'Update'}
                        sub={n.body ?? null}
                        right={<Mono size={11} color={t.q.ink60}>{relativeTime(n.created_at)}</Mono>}
                        onPress={() => { haptics.tap(); handleTap(n) }}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            )
          })
        )}
      </Body>
    </Screen>
  )
}
