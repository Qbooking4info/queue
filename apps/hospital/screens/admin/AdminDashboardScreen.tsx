import { useState, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { KpiCard, EmptyState, Card } from '@queue/shared/components/ui/v3'
import { TopBar, TopBarButton } from '@queue/shared/components/ui/home'
import {
  getRangeStats, getTodayAppointments, getDoctorsOnDuty, fmtLocalDate,
  type RangeStats, type AdminAppointmentRow, type AdminDoctorRow } from '@queue/shared/lib/admin-api'
import { statusBadgeColors } from '@queue/shared/lib/statusColors'
import { supabase } from '@queue/shared/lib/supabase'
import { ProfileAvatar } from '@queue/shared/components/ui/ProfileAvatar'
import { useUnreadMessages } from '@queue/shared/hooks/useUnreadMessages'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
// Same rule as the web banner (useInboundAmbulances): heading to this hospital and still live.
const LIVE = new Set(['matched', 'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination'])

// Inbound ambulances for this hospital, via the same route the Ambulance desk uses.
// Fails quietly (returns 0) for roles that route doesn't serve.
async function countInbound(): Promise<number> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return 0
    const res = await fetch(`${API_URL}/api/ambulances`, { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (!res.ok) return 0
    const body = await res.json()
    return ((body.requests ?? []) as { status: string; is_inbound?: boolean }[]).filter(r => r.is_inbound && LIVE.has(r.status)).length
  } catch { return 0 }
}

export function AdminDashboardScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const sc = statusBadgeColors(t)
  // Was its own hardcoded table -- in_progress and checked_in were BOTH the same blue
  // here, unlike every sibling screen's orange in_progress; no_show shared cancelled's
  // red instead of FrontDesk/Staff's gray. sc.* is the single source of truth now, so
  // this can't drift from those screens again.
  const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    pending:          { label: 'Pending',     color: sc.pending.text,          bg: sc.pending.bg },
    pending_approval: { label: 'Awaiting',    color: sc.pending_approval.text, bg: sc.pending_approval.bg },
    confirmed:        { label: 'Confirmed',   color: sc.confirmed.text,        bg: sc.confirmed.bg },
    checked_in:       { label: 'Checked In',  color: sc.checked_in.text,       bg: sc.checked_in.bg },
    in_progress:      { label: 'In Progress', color: sc.in_progress.text,      bg: sc.in_progress.bg },
    completed:        { label: 'Completed',   color: sc.completed.text,        bg: sc.completed.bg },
    cancelled:        { label: 'Cancelled',   color: sc.cancelled.text,        bg: sc.cancelled.bg },
    no_show:          { label: 'No Show',     color: sc.no_show.text,          bg: sc.no_show.bg },
  }
  const AVAILABILITY_META: Record<string, { label: string; color: string }> = {
    on_duty:  { label: 'On duty',  color: t.statusOpen.text },
    on_break: { label: 'On break', color: t.statusBusy.text },
    off_duty: { label: 'Off duty', color: t.statusNeutral.text },
  }

  const [stats,      setStats]      = useState<RangeStats | null>(null)
  const [appts,      setAppts]      = useState<AdminAppointmentRow[]>([])
  const [doctors,    setDoctors]    = useState<AdminDoctorRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inbound,    setInbound]    = useState(0)
  const [approvals,  setApprovals]  = useState(0)
  const unreadMessages = useUnreadMessages('hospital')

  const hospitalId = staffProfile?.hospitalId
  const clinicId   = staffProfile?.clinicId ?? null
  const isClinicScoped = staffProfile?.role === 'clinic_admin' && !!clinicId

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)
    const today = fmtLocalDate(new Date())
    let approvalsQ = supabase.from('appointments').select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId).eq('approval_status', 'pending_approval')
    if (isClinicScoped && clinicId) approvalsQ = approvalsQ.eq('clinic_id', clinicId)
    const [s, a, d, inb, appr] = await Promise.all([
      getRangeStats(hospitalId, today, today, isClinicScoped ? clinicId : null),
      getTodayAppointments(hospitalId, isClinicScoped ? clinicId : null),
      getDoctorsOnDuty(hospitalId, isClinicScoped ? clinicId : null),
      countInbound(),
      approvalsQ,
    ])
    setInbound(inb)
    setApprovals(appr.count ?? 0)
    setStats(s)
    setAppts(a)
    setDoctors(d)
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, clinicId, isClinicScoped])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onDutyCount = doctors.filter(d => d.availability_status === 'on_duty').length

  return (
    <SafeAreaView edges={['left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <TopBar
        avatar={<ProfileAvatar size={40} name={staffProfile?.name} onPress={() => navigation.navigate('StaffMore')} />}
        eyebrow={new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={staffProfile?.name ? `${isClinicScoped ? 'Clinic' : 'Hospital'} · ${staffProfile.name}` : 'Today'}
        onAvatarPress={() => navigation.navigate('StaffMore')}
        right={<TopBarButton icon="ellipsis-horizontal" label="More" onPress={() => navigation.navigate('StaffMore')} />}
      />

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {/* Stats grid */}
          {(inbound > 0 || approvals > 0 || unreadMessages > 0) && (
            <View style={{ gap: 10, marginBottom: 14 }}>
              {inbound > 0 && (
                <Card onPress={() => navigation.navigate('AmbulanceRequests')} accessibilityLabel={`${inbound} ambulances inbound`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.cardBg, borderColor: t.dangerBorder, borderWidth: 1.5 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="medical" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{inbound} ambulance{inbound === 1 ? '' : 's'} inbound</Text>
                    <Text style={{ fontSize: 13, color: t.textMuted }}>See ETA and triage, assign a doctor</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
                </Card>
              )}
              {unreadMessages > 0 && (
                <Card onPress={() => navigation.navigate('HospitalMessages')} accessibilityLabel={`${unreadMessages} unread messages`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.accentBg, borderColor: t.accentBorder }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="chatbubbles" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{unreadMessages} unread message{unreadMessages === 1 ? '' : 's'}</Text>
                    <Text style={{ fontSize: 13, color: t.textMuted }}>From patients, doctors or crews</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
                </Card>
              )}
              {approvals > 0 && (
                <Card onPress={() => navigation.navigate('StaffAppointments')} accessibilityLabel={`${approvals} bookings awaiting approval`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.statusBusy.bg, borderColor: t.statusBusy.border }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.statusBusy.text, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="hourglass" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{approvals} booking{approvals === 1 ? '' : 's'} awaiting approval</Text>
                    <Text style={{ fontSize: 13, color: t.textMuted }}>Approve or decline so patients aren't left waiting</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
                </Card>
              )}
            </View>
          )}

          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <KpiCard icon="calendar-outline" label="Today's appts" value={stats?.total ?? 0} />
              <KpiCard icon="checkmark-done-outline" label="Completed" value={stats?.completed ?? 0} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <KpiCard icon="hourglass-outline" label="Pending" value={stats?.pending ?? 0} highlight={(stats?.pending ?? 0) > 0} />
              <KpiCard icon="medkit-outline" label="Doctors on duty" value={onDutyCount} />
            </View>
          </View>

          {/* Doctors on duty */}
          <Text style={[s.sectionTitle, { color: t.textPrimary }]}>Doctors ({doctors.length})</Text>
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            {doctors.length === 0 ? (
              <Text style={[s.emptyText, { color: t.textMuted }]}>No doctors found.</Text>
            ) : doctors.map((d, i) => {
              const av = AVAILABILITY_META[d.availability_status] ?? AVAILABILITY_META.on_duty
              return (
                <View key={d.id} style={[s.doctorRow, { borderTopColor: t.cardBorder, borderTopWidth: i === 0 ? 0 : 1 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.doctorName, { color: t.textPrimary }]}>{[d.title, d.full_name].filter(Boolean).join(' ')}</Text>
                    {d.specialty_name && <Text style={[s.doctorSpec, { color: t.textMuted }]}>{d.specialty_name}</Text>}
                  </View>
                  <View style={[s.availBadge, { backgroundColor: `${av.color}1F` }]}>
                    <View style={[s.availDot, { backgroundColor: av.color }]} />
                    <Text style={[s.availText, { color: av.color }]}>{av.label}</Text>
                  </View>
                </View>
              )
            })}
          </View>

          {/* Today's queue */}
          <Text style={[s.sectionTitle, { color: t.textPrimary, marginTop: 16 }]}>Today's queue ({appts.length})</Text>
          {appts.length === 0 ? (
            <EmptyState icon="clipboard-outline" title="No appointments today" body="Bookings and walk-ins for today show up here." />
          ) : appts.map(a => {
            const meta = STATUS_META[a.status] ?? { label: a.status, color: sc.no_show.text, bg: sc.no_show.bg }
            return (
              <View key={a.id} style={[s.apptCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.apptPatient, { color: t.textPrimary }]}>{a.patient_name}</Text>
                  <Text style={[s.apptMeta, { color: t.textMuted }]}>
                    {a.start_time} · Dr. {a.doctor_name}
                  </Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  greeting:      { fontSize: 12, fontWeight: '600' },
  headerTitle:   { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  statGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statCard:      { flexBasis: '47%', flexGrow: 1, borderRadius: 16, borderWidth: 1, padding: 14 },
  statValue:     { fontSize: 22, fontWeight: '800' },
  statLabel:     { fontSize: 11, marginTop: 2 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 8, marginTop: 18 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 4 },
  emptyText:     { fontSize: 12.5, textAlign: 'center', paddingVertical: 10 },
  doctorRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderTopWidth: 1 },
  doctorName:    { fontSize: 13, fontWeight: '700' },
  doctorSpec:    { fontSize: 11, marginTop: 1 },
  availBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  availDot:      { width: 6, height: 6, borderRadius: 3 },
  availText:     { fontSize: 10, fontWeight: '700' },
  apptCard:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8, gap: 8 },
  apptPatient:   { fontSize: 13, fontWeight: '700' },
  apptMeta:      { fontSize: 11, marginTop: 2 },
  statusBadge:   { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  statusText:    { fontSize: 10, fontWeight: '700' },
})
