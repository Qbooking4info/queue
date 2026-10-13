import { useState, useCallback } from 'react'
import { View, ScrollView, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getPatientAppointments } from '@queue/shared/lib/api'
import { fmtDate, fmt12 } from '@queue/shared/lib/format'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { StatusBadge } from '@queue/shared/components/ui/StatusBadge'
import { useIsOffline } from '@queue/shared/hooks/useIsOffline'
import { readCache, writeCache } from '@queue/shared/lib/cache'
import { useEffect } from 'react'
import { Header, Card, SegmentedControl, PrimaryButton, EmptyState } from '@queue/shared/components/ui/v3'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'

type Tab = 'upcoming' | 'past'

const UPCOMING = ['pending', 'confirmed', 'checked_in', 'in_progress']

function badgeType(a: AppointmentWithRelations) {
  const approval = (a as any).approval_status
  if (approval === 'pending_approval') return 'pending_approval'
  if (approval === 'rejected') return 'cancelled'
  return a.status
}

function initials(name?: string | null) {
  return (name ?? '?').replace(/^Dr\.?\s*/i, '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

export function AppointmentsScreen({ navigation }: { navigation?: any }) {
  const { theme: t } = useTheme()
  const offline = useIsOffline()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const result = await getPatientAppointments()
    if (result.ok) { setLoadError(null); setAppts(result.data); writeCache(user?.id, 'appointments', result.data) }
    else setLoadError(result.error)
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => {
    readCache<AppointmentWithRelations[]>(user?.id, 'appointments').then(c => {
      if (c) { setAppts(a => a.length ? a : c); setLoading(false) }
    })
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const upcoming = appts.filter(a => UPCOMING.includes(a.status) && (a as any).approval_status !== 'rejected')
    .sort((a, b) => (a.appointment_date + (a.start_time ?? '')).localeCompare(b.appointment_date + (b.start_time ?? '')))
  const past = appts.filter(a => !upcoming.includes(a))
  const list = tab === 'upcoming' ? upcoming : past

  function open(a: AppointmentWithRelations) {
    if (a.status === 'checked_in' || a.status === 'in_progress') navigation?.navigate('QueuePass', { appointmentId: a.id })
    else navigation?.navigate('AppointmentDetail', { appointment: a })
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Appointments">
        <SegmentedControl<Tab> onDark value={tab} onChange={setTab}
          options={[{ value: 'upcoming', label: `Upcoming${upcoming.length ? ' · ' + upcoming.length : ''}` }, { value: 'past', label: 'Past' }]} />
      </Header>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}>
        {loading ? (
          <><SkeletonCard /><SkeletonCard /></>
        ) : loadError ? (
          <EmptyState icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
            title={offline ? 'No connection' : "Couldn't load your visits"}
            body={offline ? 'Your visits will appear when you are back online.' : 'Pull down or tap below to try again.'}
            action="Try again" onAction={() => { setLoading(true); load() }} />
        ) : list.length === 0 ? (
          tab === 'upcoming'
            ? <EmptyState icon="calendar-outline" title="No upcoming visits" body="Book a hospital visit or see a doctor online." action="Book a visit" onAction={() => navigation?.navigate('Search')} />
            : <EmptyState icon="time-outline" title="No past visits yet" body="Completed and cancelled visits show here." />
        ) : list.map(a => {
          const isVirtual = a.type === 'virtual'
          return (
            <Card key={a.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: tab === 'upcoming' ? t.accent : t.textMuted }}>
                  {fmtDate(a.appointment_date)}{a.start_time ? ' · ' + fmt12(a.start_time) : ''}
                </Text>
                <StatusBadge type={badgeType(a)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: isVirtual ? t.infoBg : t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '800', color: isVirtual ? t.info : t.accent }}>{initials(a.doctor?.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{a.doctor?.full_name ?? 'Doctor to be assigned'}</Text>
                  <Text style={{ fontSize: 13, color: t.textMuted }} numberOfLines={1}>
                    {[a.doctor?.specialty?.name, a.hospital?.name, isVirtual ? 'Video' : 'In person'].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              {tab === 'upcoming' ? (
                <PrimaryButton label={a.status === 'checked_in' || a.status === 'in_progress' ? 'Open Queue Pass' : 'View details'} height={44} onPress={() => open(a)} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><PrimaryButton label="Details" variant="ghost" height={44} onPress={() => open(a)} /></View>
                  <View style={{ flex: 1 }}><PrimaryButton label="Book again" height={44} onPress={() => navigation?.navigate('Search')} /></View>
                </View>
              )}
            </Card>
          )
        })}
      </ScrollView>
    </View>
  )
}
