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
import { Card } from '@queue/shared/components/ui/v3'
import {
  TopBar, TopBarButton, Pill, HeroCard, HeroBody, DateTile,
  QuickRow, QuickTile, SectionHead, RowCard,
} from '@queue/shared/components/ui/home'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'
import type { DisplayHospital } from '@queue/shared/components/hospital/HospitalCard'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { HomeCarousel, type Slide } from '../components/HomeCarousel'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 16 ? 'Good afternoon' : 'Good evening'
}

function formatDistance(km?: number, city?: string | null) {
  if (km == null) return city ?? 'Nearby'
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function visitWhen(a: AppointmentWithRelations) {
  const today = new Date().toISOString().slice(0, 10)
  const day = a.appointment_date === today ? 'Today'
    : new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}${a.start_time ? ' · ' + a.start_time.slice(0, 5) : ''}`
}

function longDate(d = new Date()) {
  return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** The three stacked parts of the hero's date tile. */
function datePieces(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return {
    weekday: d.toLocaleDateString('en-NG', { weekday: 'short' }).toUpperCase(),
    day:     String(d.getDate()),
    month:   d.toLocaleDateString('en-NG', { month: 'short' }),
  }
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

  // Shown in place of the old one-line "No upcoming visits" row. Every slide is
  // built from data this screen already has, and only appears when it has
  // something true to say -- an empty hero is worse than a short carousel.
  const heroSlides: Slide[] = [
    {
      key: 'book',
      title: 'Book your doctor appointment',
      body: 'Find the right doctor, at the right time, for a healthier tomorrow.',
      icon: 'medkit',
      onPress: () => navigation.navigate('Search'),
      search: { placeholder: 'Search for doctor, specialty, or clinic…' },
    },
    ...(virtualDoctors
      ? [{
          key: 'virtual',
          title: 'See a doctor without leaving home',
          body: `${virtualDoctors} ${virtualDoctors === 1 ? 'doctor is' : 'doctors are'} available for video, audio or chat right now.`,
          icon: 'videocam' as const,
          cta: 'Start a virtual visit',
          onPress: () => navigation.navigate('VirtualCare'),
        } satisfies Slide]
      : []),
    ...(lastDoctor
      ? [{
          key: 'again',
          title: `Book again with ${lastDoctor.name}`,
          body: lastDoctor.specialty ? `Your last visit was ${lastDoctor.specialty}.` : 'Pick up where you left off.',
          icon: 'person' as const,
          cta: 'See availability',
          onPress: () => navigation.navigate('DoctorProfile', { userId: lastDoctor.userId }),
        } satisfies Slide]
      : []),
    {
      key: 'sos',
      title: 'Need help now?',
      body: 'Request an ambulance, or call the emergency lines without leaving the app.',
      icon: 'alert-circle',
      cta: 'Emergency',
      tone: 'alert',
      onPress: () => { haptics.heavy(); navigation.navigate('Sos') },
    },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <TopBar
        avatar={<ProfileAvatar size={40} onPress={() => navigation.navigate('Profile')} />}
        eyebrow={longDate()}
        title={`${greeting()}, ${firstName}`}
        onAvatarPress={() => navigation.navigate('Profile')}
        right={
          <TopBarButton
            icon="notifications-outline"
            label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            dot={unread > 0}
            onPress={() => navigation.navigate('Notifications')}
          />
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} />}>
        <View style={{ paddingHorizontal: 20, gap: 16 }}>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pill
              label="Booking for:"
              value={switchedInto ? firstName : 'Me'}
              onPress={() => navigation.navigate('Dependents')}
            />
            <View style={{ flex: 1 }} />
            <Pill
              tone="danger"
              icon="alert-circle"
              value="Emergency SOS"
              onPress={() => { haptics.heavy(); navigation.navigate('Sos') }}
            />
          </View>

          {loading ? (
            <SkeletonCard />
          ) : visit ? (
            <HeroCard
              eyebrow={inQueue ? 'IN THE QUEUE' : 'UPCOMING VISIT'}
              status={{
                label: inQueue && visit.queue_position != null
                  ? `#${visit.queue_position} in line`
                  : visit.status === 'confirmed' ? 'Confirmed' : 'Pending',
                icon: inQueue ? 'people' : visit.status === 'confirmed' ? 'checkmark-circle' : 'time',
              }}
              onPress={() => navigation.navigate(
                inQueue ? 'QueuePass' : 'AppointmentDetail',
                inQueue ? { appointmentId: visit.id } : { appointment: visit },
              )}
              footer={[
                { label: inQueue ? 'Queue Pass' : 'Reschedule', icon: inQueue ? 'qr-code-outline' : 'calendar-outline',
                  onPress: () => navigation.navigate(
                    inQueue ? 'QueuePass' : 'AppointmentDetail',
                    inQueue ? { appointmentId: visit.id } : { appointment: visit }) },
                { label: visit.type === 'virtual' ? 'Join visit' : 'Get directions',
                  icon: visit.type === 'virtual' ? 'videocam-outline' : 'navigate-outline',
                  onPress: () => navigation.navigate('AppointmentDetail', { appointment: visit }) },
              ]}
            >
              <HeroBody
                leading={<DateTile {...datePieces(visit.appointment_date)} />}
                title={visit.doctor?.full_name ?? 'Doctor to be assigned'}
                subtitle={[visit.doctor?.specialty?.name, visit.hospital?.name].filter(Boolean).join(' · ') || null}
                meta={visitWhen(visit)}
              />
            </HeroCard>
          ) : (
            <HomeCarousel slides={heroSlides} />
          )}

          {failed && (
            <Card style={{ backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="cloud-offline-outline" size={20} color={t.danger} />
              <Text style={{ flex: 1, fontSize: 13, color: t.textPrimary }}>Couldn&apos;t load everything.</Text>
              <TouchableOpacity onPress={load} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>Try again</Text>
              </TouchableOpacity>
            </Card>
          )}

          <View style={{ gap: 12 }}>
            <SectionHead title="Services" />
            <QuickRow>
              {/* Saturated pastels rather than full-strength brand colours: four
                  solid blocks of primary at this size fight each other and the
                  hero card above them. */}
              <QuickTile icon="calendar" label="Book visit" color="#4FD1B0"
                onPress={() => navigation.navigate('Search')} />
              <QuickTile icon="videocam" label="Virtual care" color="#7C9BF2"
                badge={virtualDoctors ? String(virtualDoctors) : null}
                onPress={() => navigation.navigate('VirtualCare')} />
              <QuickTile icon="medkit" label="Ambulance" color="#F28B82"
                onPress={() => navigation.navigate('AmbulanceHome')} />
              <QuickTile icon="heart" label="My care" color="#6EE7C0"
                onPress={() => navigation.navigate('MyCare')} />
            </QuickRow>
          </View>

          {lastDoctor && (
            <View style={{ gap: 10 }}>
              <SectionHead title="Your care team" />
              <RowCard
                leading={
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: t.accent, fontSize: 13 }}>{initials(lastDoctor.name)}</Text>
                  </View>
                }
                title={lastDoctor.name}
                subtitle={lastDoctor.specialty ?? null}
                action="Rebook"
                onActionPress={() => navigation.navigate('DoctorProfile', { userId: lastDoctor.userId })}
                onPress={() => navigation.navigate('DoctorProfile', { userId: lastDoctor.userId })}
              />
            </View>
          )}

          <View style={{ gap: 10 }}>
            <SectionHead title="Near you" action="See all" onAction={() => navigation.navigate('Search')} />
            {loading ? <SkeletonCard /> : hospitals.length === 0 ? (
              <Text style={{ fontSize: 14, color: t.textMuted }}>No hospitals to show yet.</Text>
            ) : hospitals.slice(0, 3).map(h => (
              <RowCard
                key={String(h.id)}
                leading={
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="business" size={20} color={t.accent} />
                  </View>
                }
                title={h.name}
                subtitle={`${h.rating ? `★ ${h.rating.toFixed(1)} · ` : ''}${formatDistance(h.distanceKm, h.city)}`}
                onPress={() => navigation.navigate('HospitalProfile', { hospital: h })}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
