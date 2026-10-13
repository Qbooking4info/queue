import { useState, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { useLocation, distanceKm } from '@queue/shared/contexts/LocationContext'
import { getHospitals, getNextAppointment, getActiveQueueAppointment } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { haptics } from '@queue/shared/lib/haptics'
import { readCache, writeCache } from '@queue/shared/lib/cache'
import { useEffect } from 'react'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { StatusBadge } from '@queue/shared/components/ui/StatusBadge'
import { Header, HeaderIconButton, HeaderTail, ServiceTile, SectionTitle, Card } from '@queue/shared/components/ui/v3'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { todayLocalDate } from '@queue/shared/lib/format'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 16 ? 'Good afternoon' : 'Good evening'
}

function formatDistance(km?: number, city?: string | null) {
  if (km == null) return city ?? 'Nearby'
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function visitWhen(a: AppointmentWithRelations) {
  const today = todayLocalDate()  // local calendar date; the UTC slice is yesterday from 00:00-01:00 WAT
  const day = a.appointment_date === today ? 'Today'
    : new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}${a.start_time ? ' · ' + a.start_time.slice(0, 5) : ''}`
}

function initials(name?: string | null) {
  return (name ?? '?').replace(/^Dr\.?\s*/i, '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

interface Props { navigation: any }

export function HomeScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, switchedInto } = useAuth() as any
  const { coords } = useLocation()
  const [hospitals, setHospitals] = useState<(DisplayHospital & { distanceKm?: number })[]>([])
  const [nextAppt, setNextAppt] = useState<AppointmentWithRelations | null>(null)
  const [activeAppt, setActiveAppt] = useState<AppointmentWithRelations | null>(null)
  const [virtualDoctors, setVirtualDoctors] = useState<number | null>(null)
  const [unread, setUnread] = useState(0)
  const [lastDoctor, setLastDoctor] = useState<{ userId: string; name: string; specialty?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [raw, appt, active, docs] = await Promise.all([
        getHospitals(),
        user ? getNextAppointment(user.id) : Promise.resolve(null),
        user ? getActiveQueueAppointment(user.id) : Promise.resolve(null),
        supabase.from('doctors').select('id', { count: 'exact', head: true }).eq('accepts_virtual', true).eq('is_active', true),
      ])
      const mapped = raw.map(h => {
        const dh = toDisplayHospital(h) as DisplayHospital & { distanceKm?: number }
        if (coords && h.latitude != null && h.longitude != null) {
          dh.distanceKm = distanceKm(coords, { latitude: h.latitude, longitude: h.longitude })
        }
        return dh
      }).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      setHospitals(mapped)
      setNextAppt(appt)
      setActiveAppt(active)
      setVirtualDoctors(docs.count ?? null)
      writeCache(user?.id, 'home', { hospitals: mapped, nextAppt: appt, activeAppt: active, virtualDoctors: docs.count ?? null })
      if (user) {
        // "Book again" shortcut: the doctor from the most recent completed visit.
        const { data: last } = await supabase.from('appointments')
          .select('doctor:doctors!appointments_doctor_id_fkey(user_id, full_name, specialty:specialties!doctors_specialty_id_fkey(name))')
          .eq('patient_id', user.id).eq('status', 'completed')
          .order('appointment_date', { ascending: false }).limit(1).maybeSingle()
        const d = (last as any)?.doctor
        setLastDoctor(d?.user_id ? { userId: d.user_id, name: d.full_name, specialty: d.specialty?.name } : null)
        const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('is_read', false)
        setUnread(count ?? 0)
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [user, coords])

  // Paint the last good copy immediately, then refresh over it.
  useEffect(() => {
    readCache<any>(user?.id, 'home').then(c => {
      if (!c) return
      setHospitals(h => h.length ? h : c.hospitals ?? [])
      setNextAppt(a => a ?? c.nextAppt ?? null)
      setActiveAppt(a => a ?? c.activeAppt ?? null)
      setVirtualDoctors(v => v ?? c.virtualDoctors ?? null)
      setLoading(false)
    })
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const firstName = user?.full_name?.split(' ')[0] ?? 'there'
  const visit = activeAppt ?? nextAppt
  const inQueue = !!activeAppt

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Dependents') }} accessibilityRole="button"
              accessibilityLabel={switchedInto ? `Managing for ${user?.full_name}. Change` : 'Booking for me. Change'}
              style={{ height: 36, paddingHorizontal: 12, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                {switchedInto ? `Managing for ${firstName}` : 'For: Me'}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => { haptics.heavy(); navigation.navigate('Sos') }} accessibilityRole="button" accessibilityLabel="Emergency SOS"
              style={{ height: 36, paddingHorizontal: 14, borderRadius: 99, backgroundColor: '#EF4444', justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>SOS</Text>
            </TouchableOpacity>
            <HeaderIconButton icon="notifications-outline" label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              dot={unread > 0} onPress={() => navigation.navigate('Notifications')} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ProfileAvatar size={48} onPress={() => navigation.navigate('Profile')} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#CCFBF1', fontSize: 14 }}>{greeting()}</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800' }} accessibilityRole="header" numberOfLines={1}>{firstName}</Text>
            </View>
          </View>
        </Header>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} />}>
        <HeaderTail />
        <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 16 }}>
          {loading ? (
            <SkeletonCard />
          ) : visit ? (
            <Card onPress={() => navigation.navigate(inQueue ? 'QueuePass' : 'AppointmentDetail', inQueue ? { appointmentId: visit.id } : { appointment: visit })}
              accessibilityLabel="Next visit" style={{ gap: 12, shadowColor: '#0B1B1E', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: t.accent }}>NEXT VISIT · {visitWhen(visit).toUpperCase()}</Text>
                <StatusBadge type={visit.status} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '800', color: t.accent }}>{initials(visit.doctor?.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>{visit.doctor?.full_name ?? 'Doctor to be assigned'}</Text>
                  <Text style={{ fontSize: 13, color: t.textMuted }} numberOfLines={1}>
                    {[visit.doctor?.specialty?.name, visit.hospital?.name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              {inQueue && visit.queue_position != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.accentBg, borderRadius: 12, padding: 10 }}>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: t.accent }}>#{visit.queue_position}</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: t.textSecondary }}>
                    in the queue{visit.estimated_wait != null ? ` · about ${visit.estimated_wait} min` : ''}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: t.accent }}>Queue Pass ›</Text>
                </View>
              ) : visit.type === 'virtual' ? (
                <Text style={{ fontSize: 13, color: t.textSecondary }}>Video visit · join from the visit 10 minutes before</Text>
              ) : null}
            </Card>
          ) : (
            <Card onPress={() => navigation.navigate('Search')} accessibilityLabel="Book a visit"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar" size={22} color={t.id === 'forest' ? '#081416' : '#FFFFFF'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>No upcoming visits</Text>
                <Text style={{ fontSize: 13, color: t.textMuted }}>Book a hospital or online visit</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
            </Card>
          )}

          {failed && (
            <Card style={{ backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="cloud-offline-outline" size={20} color={t.danger} />
              <Text style={{ flex: 1, fontSize: 13, color: t.textPrimary }}>Couldn't load everything.</Text>
              <TouchableOpacity onPress={load} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>Try again</Text>
              </TouchableOpacity>
            </Card>
          )}

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ServiceTile icon="calendar" label="Book a visit" sublabel="Hospitals & doctors" onPress={() => navigation.navigate('Search')} />
              <ServiceTile icon="videocam" label="Virtual Care" tileColor={t.id === 'forest' ? '#60A5FA' : '#2563EB'}
                sublabel={virtualDoctors ? `● ${virtualDoctors} doctors offer video` : 'Video, audio or chat'}
                sublabelTone={virtualDoctors ? 'success' : 'muted'} onPress={() => navigation.navigate('VirtualCare')} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ServiceTile icon="medkit" label="Ambulance" tileColor={t.id === 'forest' ? '#F87171' : '#EF4444'} sublabel="SOS or scheduled"
                onPress={() => navigation.navigate('AmbulanceHome')} />
              <ServiceTile icon="heart" label="My Care" tileColor={t.id === 'forest' ? '#5EEAD4' : '#134E4A'} sublabel="Records & medicines"
                onPress={() => navigation.navigate('MyCare')} />
            </View>
          </View>

          {lastDoctor && (
            <Card onPress={() => navigation.navigate('DoctorProfile', { userId: lastDoctor.userId })} accessibilityLabel={`Book again with ${lastDoctor.name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="refresh" size={20} color={t.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>Book again with {lastDoctor.name}</Text>
                {!!lastDoctor.specialty && <Text style={{ fontSize: 12, color: t.textMuted }}>{lastDoctor.specialty}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
            </Card>
          )}

          <View style={{ gap: 8 }}>
            <SectionTitle title="Near you" action="See all" onAction={() => navigation.navigate('Search')} />
            {loading ? <SkeletonCard /> : hospitals.length === 0 ? (
              <Text style={{ fontSize: 14, color: t.textMuted }}>No hospitals to show yet.</Text>
            ) : hospitals.slice(0, 3).map(h => (
              <Card key={String(h.id)} onPress={() => navigation.navigate('HospitalProfile', { hospital: h })} accessibilityLabel={h.name}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="business-outline" size={22} color={t.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }} numberOfLines={1}>{h.name}</Text>
                  <Text style={{ fontSize: 12, color: t.textMuted }}>
                    {h.rating ? `★ ${h.rating.toFixed(1)} · ` : ''}{formatDistance(h.distanceKm, h.city)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
