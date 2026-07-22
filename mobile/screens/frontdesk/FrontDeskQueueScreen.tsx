import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

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

  // Realtime updates
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
    if (error) Alert.alert('Error', error.message)
    else load(true)
  }

  async function handleApprove(appt: Appt) {
    setActioning(appt.id)
    const { error } = await (supabase as any)
      .from('appointments')
      .update({ approval_status: 'approved', status: 'confirmed' })
      .eq('id', appt.id)
      .eq('approval_status', 'pending_approval')
    setActioning(null)
    if (error) Alert.alert('Error', error.message)
    else load(true)
  }

  const today = new Date().toISOString().split('T')[0]
  const active = appts.filter(a => !['completed', 'cancelled', 'no_show'].includes(a.status))
  const done   = appts.filter(a =>  ['completed', 'cancelled', 'no_show'].includes(a.status))

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
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

      {loading ? (
        <View style={s.center}><ActivityIndicator color={t.accent} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {appts.length === 0 && (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No appointments</Text>
              <Text style={[s.emptySub, { color: t.textMuted }]}>{tab === 'today' ? 'No appointments scheduled for today.' : 'No appointments found.'}</Text>
            </View>
          )}

          {active.length > 0 && (
            <>
              <Text style={[s.groupLabel, { color: t.textMuted }]}>Active ({active.length})</Text>
              {active.map(a => <ApptCard key={a.id} appt={a} theme={t} actioning={actioning} onCheckIn={handleCheckIn} onApprove={handleApprove} today={today} />)}
            </>
          )}

          {done.length > 0 && (
            <>
              <Text style={[s.groupLabel, { color: t.textMuted, marginTop: 16 }]}>Completed / Cancelled ({done.length})</Text>
              {done.map(a => <ApptCard key={a.id} appt={a} theme={t} actioning={actioning} onCheckIn={handleCheckIn} onApprove={handleApprove} today={today} />)}
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
    <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
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
    </View>
  )
}

const s = StyleSheet.create({
  safe:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTitle:  { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  tabBar:       { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  tabBtn:       { paddingHorizontal: 14, paddingVertical: 7 },
  tabBtnText:   { fontSize: 12, fontWeight: '700' },
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
  emptyTitle:   { fontSize: 17, fontWeight: '700' },
  emptySub:     { fontSize: 13, textAlign: 'center' },
})
