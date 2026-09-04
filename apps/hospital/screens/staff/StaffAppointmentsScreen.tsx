import { useState, useCallback, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Appt {
  id: string
  booking_ref: string
  appointment_date: string
  start_time: string
  type: string
  status: string
  approval_status: string | null
  reason: string | null
  urgency: string | null
  queue_position: number | null
  walkin_patient_name: string | null
  walkin_patient_phone: string | null
  patient: { id: string; full_name: string; phone: string | null } | null
  doctor: { full_name: string } | null
  clinic: { name: string } | null
}

type FilterTab = 'pending' | 'today' | 'upcoming' | 'past'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: 'Pending',          color: '#EF9F27', bg: 'rgba(239,159,39,0.12)' },
  pending_approval: { label: 'Awaiting Approval', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  confirmed:        { label: 'Confirmed',         color: '#00C265', bg: 'rgba(0,194,101,0.12)' },
  checked_in:       { label: 'Checked In',        color: '#5B9EFF', bg: 'rgba(91,158,255,0.14)' },
  in_progress:      { label: 'In Progress',       color: '#FF8C42', bg: 'rgba(255,140,66,0.14)' },
  completed:        { label: 'Completed',         color: '#7A9089', bg: 'rgba(122,144,137,0.12)' },
  cancelled:        { label: 'Cancelled',         color: '#FF5C5C', bg: 'rgba(255,92,92,0.10)' },
  no_show:          { label: 'No Show',           color: '#888',    bg: 'rgba(128,128,128,0.1)' },
}

function fmt12(time: string) {
  if (!time) return '—'
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

interface Props { navigation: any }

export function StaffAppointmentsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [appts,      setAppts]      = useState<Appt[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actioning,  setActioning]  = useState<string | null>(null)
  const [tab,        setTab]        = useState<FilterTab>('pending')
  const [search,     setSearch]     = useState('')

  const hospitalId = staffProfile?.hospitalId
  const today = todayLocalDate()

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)

    let query = supabase
      .from('appointments')
      .select('id, booking_ref, appointment_date, start_time, type, status, approval_status, reason, urgency, queue_position, walkin_patient_name, walkin_patient_phone, patient:users!appointments_patient_id_fkey(id, full_name, phone), doctor:doctors!appointments_doctor_id_fkey(full_name), clinic:hospital_clinics!appointments_clinic_id_fkey(name)')
      .eq('hospital_id', hospitalId)
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: true })
      .limit(200)

    if (tab === 'pending') {
      query = query.eq('approval_status', 'pending_approval')
    } else if (tab === 'today') {
      query = query.eq('appointment_date', today)
    } else if (tab === 'upcoming') {
      query = query.gt('appointment_date', today)
    } else if (tab === 'past') {
      query = query.lt('appointment_date', today)
    }

    const { data } = await query
    // See FrontDeskQueueScreen.tsx: Supabase's generated types model these FK
    // joins as arrays even though each appointment has exactly one of each.
    setAppts((data ?? []) as unknown as Appt[])
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, tab])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useEffect(() => {
    if (!hospitalId) return
    const ch = supabase
      .channel(`staff-appts:${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `hospital_id=eq.${hospitalId}` }, () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [hospitalId, load])

  async function handleApprove(appt: Appt) {
    setActioning(appt.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      const res = await fetch(`${API_URL}/api/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Approval failed')
      }
      haptics.success()
      load(true)
    } catch (e) {
      haptics.error()
      Alert.alert('Error', e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setActioning(null)
    }
  }

  async function handleReject(appt: Appt) {
    Alert.alert('Reject Booking', 'Cancel this appointment request?', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        setActioning(appt.id)
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const jwt = session?.access_token
          if (!jwt) throw new Error('Not authenticated')
          // The API requires a non-empty rejection note (it's shown to the patient in
          // their refund notification) -- mirrors the generic note the web dashboard's
          // front-desk reject action sends (rejectPendingApprovalAppointment).
          const res = await fetch(`${API_URL}/api/appointments/${appt.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ action: 'reject', note: 'Cancelled by hospital staff' }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => null)
            throw new Error(body?.error ?? 'Rejection failed')
          }
          haptics.success()
          load(true)
        } catch (e) {
          haptics.error()
          Alert.alert('Error', e instanceof Error ? e.message : 'Rejection failed')
        } finally {
          setActioning(null)
        }
      }}
    ])
  }

  const filtered = search.trim()
    ? appts.filter(a => (a.patient?.full_name ?? a.walkin_patient_name ?? '').toLowerCase().includes(search.toLowerCase()) || a.booking_ref?.toLowerCase().includes(search.toLowerCase()))
    : appts

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'pending',  label: 'Pending' },
    { key: 'today',    label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past',     label: 'Past' },
  ]

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: t.textPrimary }]}>Appointments</Text>
      </View>

      {/* Tab filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabContent}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb.key} onPress={() => setTab(tb.key)}
            style={[s.tab, tab === tb.key && { backgroundColor: t.accent, borderColor: t.accent }, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
            <Text style={[s.tabText, { color: tab === tb.key ? '#fff' : t.textMuted }]}>{tb.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={[s.searchWrap, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
        <Ionicons name="search-outline" size={14} color={t.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="Search patient or booking ref…"
          placeholderTextColor={t.textMuted}
          style={[s.searchInput, { color: t.textPrimary }]}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={48} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Text style={[s.emptyTitle, { color: t.textPrimary }]}>
                {search ? 'No matches' : tab === 'pending' ? 'No pending approvals' : 'No appointments'}
              </Text>
              <Text style={[s.emptySub, { color: t.textMuted }]}>
                {search ? `No results for "${search}"` : tab === 'pending' ? 'All bookings are up to date.' : 'Nothing here yet.'}
              </Text>
            </View>
          ) : filtered.map(appt => {
            const dispStatus = appt.approval_status === 'pending_approval' ? 'pending_approval' : appt.status
            const meta = STATUS_META[dispStatus] ?? { label: dispStatus, color: '#888', bg: 'rgba(128,128,128,0.1)' }
            const isLoading = actioning === appt.id
            const canApprove = appt.approval_status === 'pending_approval'
            const isEmergency = appt.urgency === 'emergency'

            return (
              <View key={appt.id} style={[s.card, { backgroundColor: isEmergency ? 'rgba(255,92,92,0.06)' : t.cardBg, borderColor: isEmergency ? t.danger : t.cardBorder, borderLeftWidth: isEmergency ? 4 : 1 }]}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.patientName, { color: t.textPrimary }]}>{appt.patient?.full_name ?? appt.walkin_patient_name ?? 'Walk-in'}</Text>
                    <Text style={[s.cardMeta, { color: t.textMuted }]}>
                      {fmtDate(appt.appointment_date)} · {fmt12(appt.start_time)}
                    </Text>
                    {appt.doctor && <Text style={[s.cardMeta, { color: t.textMuted }]}>Dr. {appt.doctor.full_name}</Text>}
                    {appt.clinic && <Text style={[s.cardMeta, { color: t.textMuted }]}>{appt.clinic.name}</Text>}
                    {appt.reason && <Text style={[s.reason, { color: t.textMuted }]} numberOfLines={1}>{appt.reason}</Text>}
                  </View>
                  <View style={{ gap: 6, alignItems: 'flex-end' }}>
                    <View style={[s.badge, { backgroundColor: meta.bg }]}>
                      <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {isEmergency && (
                      <View style={[s.badge, { backgroundColor: 'rgba(255,92,92,0.14)', borderWidth: 1, borderColor: t.danger }]}>
                        <Text style={[s.badgeText, { color: t.danger }]}>EMERGENCY</Text>
                      </View>
                    )}
                    {appt.booking_ref && <Text style={[s.ref, { color: t.textMuted }]}>{appt.booking_ref}</Text>}
                  </View>
                </View>
                {canApprove && (
                  <View style={[s.actions, { borderTopColor: t.cardBorder }]}>
                    <TouchableOpacity onPress={() => handleReject(appt)} disabled={!!actioning}
                      style={[s.actionBtn, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.3)', flex: 1 }]}>
                      {isLoading ? <ActivityIndicator size="small" color={t.danger} /> : <Text style={[s.actionText, { color: t.danger }]}>Reject</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleApprove(appt)} disabled={!!actioning}
                      style={[s.actionBtn, { backgroundColor: 'rgba(0,194,101,0.12)', borderColor: 'rgba(0,194,101,0.3)', flex: 2 }]}>
                      {isLoading ? <ActivityIndicator size="small" color={t.accentDark} /> : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="checkmark" size={13} color={t.accentDark} />
                          <Text style={[s.actionText, { color: t.accentDark }]}>Approve</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  header:     { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  title:      { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  tabScroll:  { flexGrow: 0 },
  tabContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  tab:        { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  tabText:    { fontSize: 12, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  card:       { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  cardTop:    { flexDirection: 'row', gap: 10, padding: 14 },
  patientName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  cardMeta:   { fontSize: 11, marginTop: 3 },
  reason:     { fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  ref:        { fontSize: 9, fontWeight: '600', marginTop: 2 },
  actions:    { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1 },
  actionBtn:  { borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1 },
  actionText: { fontSize: 13, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
})
