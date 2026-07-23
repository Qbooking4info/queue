import { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'
import { SkeletonCard } from '../../components/ui/Skeleton'

interface PatientRow { id: string; full_name: string; phone: string | null; gender: string | null }
interface ApptRow {
  id:               string
  appointment_date: string
  start_time:       string
  type:             string
  status:           string
  reason:           string | null
  urgency:          string | null
  queue_position:   number | null
  patient:          PatientRow | null
}

interface Props { navigation: any }

type Tab = 'today' | 'upcoming'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#EF9F27', bg: 'rgba(239,159,39,0.12)' },
  confirmed:   { label: 'Confirmed',   color: '#00C265', bg: 'rgba(0,194,101,0.12)' },
  checked_in:  { label: 'Checked In',  color: '#5B9EFF', bg: 'rgba(91,158,255,0.14)' },
  in_progress: { label: 'In Progress', color: '#FF8C42', bg: 'rgba(255,140,66,0.14)' },
  completed:   { label: 'Completed',   color: '#7A9089', bg: 'rgba(122,144,137,0.12)' },
  cancelled:   { label: 'Cancelled',   color: '#FF5C5C', bg: 'rgba(255,92,92,0.10)' },
}

function fmt12(time: string): string {
  if (!time) return '—'
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${mStr} ${ampm}`
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function SpecialistQueueScreen({ navigation }: Props) {
  const { theme: t }  = useTheme()
  const { doctorProfile } = useAuth()
  const [tab,         setTab]         = useState<Tab>('today')
  const [appts,       setAppts]       = useState<ApptRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  async function load(silent = false) {
    if (!doctorProfile) return
    if (!silent) setLoading(true)

    const today = new Date().toISOString().split('T')[0]

    let query = (supabase as any)
      .from('appointments')
      .select('id, appointment_date, start_time, type, status, reason, urgency, queue_position, patient:users!appointments_patient_id_fkey(id, full_name, phone, gender)')
      .eq('doctor_id', doctorProfile.doctorId)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true })

    if (tab === 'today') {
      query = query.eq('appointment_date', today)
    } else {
      query = query.gt('appointment_date', today).order('appointment_date', { ascending: true })
    }

    const { data } = await query
    setAppts((data as ApptRow[]) ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { load() }, [tab, doctorProfile]))

  async function onRefresh() {
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }

  useEffect(() => {
    if (!doctorProfile || tab !== 'today') return

    const ch = supabase
      .channel(`doctor-queue:${doctorProfile.doctorId}`)
      .on('postgres_changes' as any, {
        event: '*', schema: 'public', table: 'appointments',
        filter: `doctor_id=eq.${doctorProfile.doctorId}`,
      }, () => load(true))
      .subscribe()

    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [doctorProfile, tab])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const active = appts.filter(a => ['pending','confirmed','checked_in','in_progress'].includes(a.status))
  const done   = appts.filter(a => a.status === 'completed')

  return (
    <SafeAreaView edges={['top','left','right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={[st.greeting, { color: t.textMuted }]}>{greeting}</Text>
          <Text style={[st.name, { color: t.textPrimary }]}>Dr. {doctorProfile?.fullName?.split(' ').slice(-1)[0] ?? '—'}</Text>
        </View>
        <View style={[st.statBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
          <Text style={[st.statNum, { color: t.accent }]}>{active.length}</Text>
          <Text style={[st.statLabel, { color: t.accent }]}>pending</Text>
        </View>
      </View>

      {/* Stats bar */}
      {!loading && tab === 'today' && (
        <View style={[st.statsBar, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[st.statsBarText, { color: t.textMuted }]}>
            Today: <Text style={{ color: t.textPrimary, fontWeight: '700' }}>{appts.length}</Text> patients
            {'  ·  '}
            Completed: <Text style={{ color: t.textPrimary, fontWeight: '700' }}>{done.length}</Text>
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={[st.tabRow, { borderBottomColor: t.cardBorder }]}>
        {(['today', 'upcoming'] as Tab[]).map(item => (
          <TouchableOpacity
            key={item}
            onPress={() => setTab(item)}
            style={[st.tab, tab === item && { borderBottomColor: t.accent, borderBottomWidth: 2 }]}
          >
            <Text style={[st.tabText, { color: tab === item ? t.accent : t.textMuted }]}>
              {item === 'today' ? "Today's Queue" : 'Upcoming'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : appts.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="medical-outline" size={52} color={t.textMuted} style={{ marginBottom: 16, opacity: 0.3 }} />
          <Text style={[st.emptyTitle, { color: t.textPrimary }]}>
            {tab === 'today' ? 'No patients scheduled for today' : 'No upcoming appointments'}
          </Text>
          <Text style={[st.emptySub, { color: t.textMuted }]}>
            {tab === 'today' ? 'Your schedule is clear. Enjoy the calm!' : 'Nothing scheduled beyond today.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}
        >
          {/* Active / waiting */}
          {active.length > 0 && (
            <View style={st.group}>
              <Text style={[st.groupLabel, { color: t.textMuted }]}>WAITING / ACTIVE</Text>
              {active.map(appt => (
                <ApptCard key={appt.id} appt={appt} navigation={navigation} showDate={tab === 'upcoming'} />
              ))}
            </View>
          )}

          {/* Completed */}
          {done.length > 0 && (
            <View style={st.group}>
              <Text style={[st.groupLabel, { color: t.textMuted }]}>COMPLETED</Text>
              {done.map(appt => (
                <ApptCard key={appt.id} appt={appt} navigation={navigation} showDate={tab === 'upcoming'} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function ApptCard({ appt, navigation, showDate }: { appt: ApptRow; navigation: any; showDate: boolean }) {
  const { theme: t } = useTheme()
  const meta = STATUS_META[appt.status] ?? STATUS_META.pending
  const initials = getInitials(appt.patient?.full_name)
  const isVirtual = appt.type === 'virtual'
  const urgencyColor = appt.urgency === 'emergency' ? '#FF5C5C' : appt.urgency === 'urgent' ? '#EF9F27' : null

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
      onPress={() => {
        haptics.tap()
        navigation.navigate('PatientConsult', { appointmentId: appt.id })
      }}
    >
      {/* Avatar */}
      <View style={[st.avatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
        <Text style={[st.avatarText, { color: t.accent }]}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[st.patientName, { color: t.textPrimary }]}>
            {appt.patient?.full_name ?? 'Unknown patient'}
          </Text>
          {urgencyColor && (
            <Text style={{ fontSize: 9, fontWeight: '800', color: urgencyColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {appt.urgency}
            </Text>
          )}
        </View>
        <View style={st.metaRow}>
          <Text style={[st.metaText, { color: t.textMuted }]}>
            {showDate ? fmtDate(appt.appointment_date) + ' · ' : ''}{fmt12(appt.start_time)}
          </Text>
          <Text style={[st.typeDot, { color: isVirtual ? '#5B9EFF' : t.textMuted }]}>
            {isVirtual ? '💻 Virtual' : '🏥 In-person'}
          </Text>
        </View>
        {appt.reason && (
          <Text style={[st.reason, { color: t.textMuted }]} numberOfLines={1}>{appt.reason}</Text>
        )}
      </View>

      {/* Status badge + queue number */}
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[st.badge, { backgroundColor: meta.bg }]}>
          <Text style={[st.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {appt.queue_position != null && (
          <Text style={[st.queuePos, { color: t.textMuted }]}>#{appt.queue_position}</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  greeting:    { fontSize: 12, fontWeight: '500' },
  name:        { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  statBadge:   { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  statNum:     { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel:   { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  statsBar:    { marginHorizontal: 16, marginBottom: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  statsBarText:{ fontSize: 12 },
  tabRow:      { flexDirection: 'row', borderBottomWidth: 1, marginHorizontal: 20 },
  tab:         { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0 },
  tabText:     { fontSize: 13, fontWeight: '700' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyTitle:  { fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center', paddingHorizontal: 32 },
  emptySub:    { fontSize: 13, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  group:       { paddingHorizontal: 16, marginBottom: 4 },
  groupLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 4, paddingVertical: 10 },
  card:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  avatar:      { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarText:  { fontSize: 15, fontWeight: '800' },
  patientName: { fontSize: 15, fontWeight: '700' },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  metaText:    { fontSize: 11 },
  typeDot:     { fontSize: 11, fontWeight: '500' },
  reason:      { fontSize: 11, marginTop: 3 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText:   { fontSize: 10, fontWeight: '700' },
  queuePos:    { fontSize: 11, fontWeight: '600' },
})
