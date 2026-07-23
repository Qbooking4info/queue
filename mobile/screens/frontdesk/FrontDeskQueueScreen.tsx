import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'
import { SkeletonCard } from '../../components/ui/Skeleton'

interface Appt {
  id:               string
  booking_ref:      string
  appointment_date: string
  start_time:       string
  type:             string
  status:           string
  reason:           string | null
  urgency:          string | null
  queue_position:   number | null
  patient:          { id: string; full_name: string; phone: string | null } | null
  doctor:           { full_name: string } | null
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Pending',          color: '#EF9F27', bg: 'rgba(239,159,39,0.12)' },
  pending_approval:  { label: 'Awaiting Approval', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  confirmed:         { label: 'Confirmed',         color: '#00C265', bg: 'rgba(0,194,101,0.12)'  },
  checked_in:        { label: 'Checked In',        color: '#5B9EFF', bg: 'rgba(91,158,255,0.14)' },
  in_progress:       { label: 'In Progress',       color: '#FF8C42', bg: 'rgba(255,140,66,0.14)' },
  completed:         { label: 'Completed',         color: '#7A9089', bg: 'rgba(122,144,137,0.12)'},
  cancelled:         { label: 'Cancelled',         color: '#FF5C5C', bg: 'rgba(255,92,92,0.10)'  },
  no_show:           { label: 'No Show',           color: '#888',    bg: 'rgba(128,128,128,0.1)' },
}

function fmt12(t: string) {
  if (!t) return '—'
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

interface Props { navigation: any }

export function FrontDeskQueueScreen({ navigation }: Props) {
  const { theme: t }   = useTheme()
  const { staffProfile } = useAuth()
  const [appts,      setAppts]      = useState<Appt[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actioning,  setActioning]  = useState<string | null>(null)
  const [tab,        setTab]        = useState<'today' | 'all'>('today')
  const [search,     setSearch]     = useState('')

  const hospitalId = staffProfile?.hospitalId

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)

    const today = new Date().toISOString().split('T')[0]
    let query = (supabase as any)
      .from('appointments')
      .select('id, booking_ref, appointment_date, start_time, type, status, reason, urgency, queue_position, patient:users!appointments_patient_id_fkey(id, full_name, phone), doctor:doctors!appointments_doctor_id_fkey(full_name)')
      .eq('hospital_id', hospitalId)
      .order('appointment_date', { ascending: true })
      .order('start_time',       { ascending: true })

    if (tab === 'today') query = query.eq('appointment_date', today)

    const { data } = await query
    setAppts((data ?? []) as Appt[])
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, tab])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useEffect(() => {
    if (!hospitalId) return
    const channel = supabase
      .channel(`frontdesk:${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `hospital_id=eq.${hospitalId}` },
        () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [hospitalId, load])

  async function handleCheckIn(appt: Appt) {
    if (appt.status !== 'confirmed' && appt.status !== 'pending') {
      Alert.alert('Cannot check in', `Status is "${STATUS_META[appt.status]?.label ?? appt.status}".`)
      return
    }
    setActioning(appt.id)
    const { error } = await (supabase as any)
      .from('appointments')
      .update({ status: 'checked_in' })
      .eq('id', appt.id)
    setActioning(null)
    if (error) {
      haptics.error()
      Alert.alert('Error', error.message)
    } else {
      haptics.success()
      load(true)
    }
  }

  async function handleApprove(appt: Appt) {
    setActioning(appt.id)
    const { error } = await (supabase as any)
      .from('appointments')
      .update({ approval_status: 'approved', status: 'confirmed' })
      .eq('id', appt.id)
      .eq('approval_status', 'pending_approval')
    setActioning(null)
    if (error) {
      haptics.error()
      Alert.alert('Error', error.message)
    } else {
      haptics.success()
      load(true)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  // Client-side search filter (no API call)
  const filtered = search.trim()
    ? appts.filter(a => a.patient?.full_name?.toLowerCase().includes(search.toLowerCase()))
    : appts

  const active = filtered.filter(a => !['completed', 'cancelled', 'no_show'].includes(a.status))
  const done   = filtered.filter(a =>  ['completed', 'cancelled', 'no_show'].includes(a.status))

  // Stats from full (unfiltered) list
  const checkedInCount = appts.filter(a => a.status === 'checked_in').length
  const pendingCount   = appts.filter(a => ['pending', 'pending_approval', 'confirmed'].includes(a.status)).length

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: t.textPrimary }]}>Queue</Text>
        <View style={[s.tabBar, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {(['today', 'all'] as const).map(tb => (
            <TouchableOpacity key={tb} onPress={() => setTab(tb)}
              style={[s.tabBtn, tab === tb && { backgroundColor: t.accent }]}>
              <Text style={[s.tabBtnText, { color: tab === tb ? '#fff' : t.textMuted }]}>
                {tb === 'today' ? 'Today' : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stats bar */}
      {!loading && (
        <View style={[s.statsBar, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.statsText, { color: t.textMuted }]}>
            Today: <Text style={{ color: t.textPrimary, fontWeight: '700' }}>{appts.length}</Text>
            {'  ·  '}
            Checked in: <Text style={{ color: '#5B9EFF', fontWeight: '700' }}>{checkedInCount}</Text>
            {'  ·  '}
            Pending: <Text style={{ color: '#EF9F27', fontWeight: '700' }}>{pendingCount}</Text>
          </Text>
        </View>
      )}

      {/* Search */}
      {!loading && appts.length > 0 && (
        <View style={[s.searchWrap, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Ionicons name="search-outline" size={14} color={t.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by patient name…"
            placeholderTextColor={t.textMuted}
            style={[s.searchInput, { color: t.textPrimary }]}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
      )}

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {filtered.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="clipboard-outline" size={52} color={t.textMuted} style={{ marginBottom: 16, opacity: 0.3 }} />
              <Text style={[s.emptyTitle, { color: t.textPrimary }]}>
                {search ? 'No patients match your search' : 'No appointments yet'}
              </Text>
              <Text style={[s.emptySub, { color: t.textMuted }]}>
                {search
                  ? `No results for "${search}". Try a different name.`
                  : tab === 'today'
                    ? 'No appointments scheduled for today.\nWalk-in patients can be added from the web dashboard.'
                    : 'No appointments found.'}
              </Text>
            </View>
          )}

          {active.length > 0 && (
            <>
              <Text style={[s.groupLabel, { color: t.textMuted }]}>Active ({active.length})</Text>
              {active.map(a => (
                <ApptCard
                  key={a.id} appt={a} theme={t} actioning={actioning}
                  onCheckIn={handleCheckIn} onApprove={handleApprove} today={today}
                />
              ))}
            </>
          )}

          {done.length > 0 && (
            <>
              <Text style={[s.groupLabel, { color: t.textMuted, marginTop: 16 }]}>Completed / Cancelled ({done.length})</Text>
              {done.map(a => (
                <ApptCard
                  key={a.id} appt={a} theme={t} actioning={actioning}
                  onCheckIn={handleCheckIn} onApprove={handleApprove} today={today}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function ApptCard({ appt, theme: t, actioning, onCheckIn, onApprove, today }: {
  appt: Appt; theme: any; actioning: string | null
  onCheckIn: (a: Appt) => void; onApprove: (a: Appt) => void; today: string
}) {
  const meta      = STATUS_META[appt.status] ?? { label: appt.status, color: '#888', bg: 'rgba(128,128,128,0.1)' }
  const isLoading = actioning === appt.id
  const canCheckIn = (appt.status === 'confirmed' || appt.status === 'pending') && appt.appointment_date === today
  const canApprove = appt.status === 'pending_approval'
  const urgencyColor = appt.urgency === 'emergency' ? '#FF5C5C' : appt.urgency === 'urgent' ? '#EF9F27' : null

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => haptics.tap()}
      style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
    >
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[s.patientName, { color: t.textPrimary }]}>{appt.patient?.full_name ?? 'Unknown patient'}</Text>
          {appt.patient?.phone && <Text style={[s.patientPhone, { color: t.textMuted }]}>{appt.patient.phone}</Text>}
          <Text style={[s.meta, { color: t.textMuted }]}>
            {appt.appointment_date !== today ? `${appt.appointment_date} · ` : ''}{fmt12(appt.start_time)}
            {appt.doctor ? ` · Dr. ${appt.doctor.full_name}` : ''}
            {` · ${appt.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'}`}
          </Text>
          {appt.reason && <Text style={[s.reason, { color: t.textMuted }]} numberOfLines={1}>{appt.reason}</Text>}
        </View>
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <View style={[s.badge, { backgroundColor: meta.bg }]}>
            <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {urgencyColor && (
            <View style={[s.badge, { backgroundColor: `${urgencyColor}18` }]}>
              <Text style={[s.badgeText, { color: urgencyColor, textTransform: 'capitalize' }]}>{appt.urgency}</Text>
            </View>
          )}
          {appt.booking_ref && <Text style={[s.ref, { color: t.textMuted }]}>{appt.booking_ref}</Text>}
        </View>
      </View>

      {(canCheckIn || canApprove) && (
        <View style={[s.actions, { borderTopColor: t.cardBorder }]}>
          {canApprove && (
            <TouchableOpacity onPress={() => onApprove(appt)} disabled={!!actioning}
              style={[s.actionBtn, { backgroundColor: 'rgba(0,194,101,0.12)', borderColor: 'rgba(0,194,101,0.3)' }]}>
              {isLoading ? <ActivityIndicator size="small" color="#00C265" />
                : <Text style={[s.actionText, { color: '#00C265' }]}>✓ Approve</Text>}
            </TouchableOpacity>
          )}
          {canCheckIn && (
            <TouchableOpacity onPress={() => onCheckIn(appt)} disabled={!!actioning}
              style={[s.actionBtn, { backgroundColor: 'rgba(91,158,255,0.12)', borderColor: 'rgba(91,158,255,0.3)', flex: 1 }]}>
              {isLoading ? <ActivityIndicator size="small" color="#5B9EFF" />
                : <Text style={[s.actionText, { color: '#5B9EFF' }]}>Check In →</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  safe:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTitle:  { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  tabBar:       { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  tabBtn:       { paddingHorizontal: 14, paddingVertical: 7 },
  tabBtnText:   { fontSize: 12, fontWeight: '700' },
  statsBar:     { marginHorizontal: 16, marginBottom: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  statsText:    { fontSize: 12 },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: 14, padding: 0 },
  groupLabel:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  card:         { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  cardTop:      { flexDirection: 'row', gap: 10, padding: 14 },
  patientName:  { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  patientPhone: { fontSize: 11, marginTop: 2 },
  meta:         { fontSize: 11, marginTop: 4 },
  reason:       { fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  badge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText:    { fontSize: 10, fontWeight: '700' },
  ref:          { fontSize: 9, fontWeight: '600', marginTop: 2 },
  actions:      { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1 },
  actionBtn:    { borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1 },
  actionText:   { fontSize: 13, fontWeight: '700' },
  empty:        { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:   { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub:     { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
})
