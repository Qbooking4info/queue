import { useState, useCallback, useEffect, type ComponentProps } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { todayLocalDate } from '@queue/shared/lib/format'
import { ringPatient } from '@queue/shared/lib/api'
import { VitalsEntryModal } from '@queue/shared/components/frontdesk/VitalsEntryModal'
import { MovePositionModal } from '@queue/shared/components/frontdesk/MovePositionModal'

interface Appt {
  id:               string
  booking_ref:      string
  appointment_date: string
  start_time:       string
  type:             string
  status:           string
  approval_status:  string | null
  reason:           string | null
  urgency:          string | null
  queue_position:   number | null
  doctor_id:          string | null
  assigned_doctor_id: string | null
  check_in_date:      string | null
  walkin_patient_name:  string | null
  walkin_patient_phone: string | null
  referral_reason?:  string | null
  patient:          { id: string; full_name: string; phone: string | null } | null
  doctor:           { full_name: string } | null
  referred_by?:      { full_name: string; title: string | null } | null
  referring_hospital?: { name: string } | null
  referring_clinic?: { name: string } | null
}

interface VitalsRow {
  weight_kg:    number | null
  height_cm:    number | null
  bp_systolic:  number | null
  bp_diastolic: number | null
  blood_sugar:  number | null
  recorded_at:  string
}

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

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
  const [vitalsMap,  setVitalsMap]  = useState<Map<string, VitalsRow>>(new Map())
  const [vitalsTarget, setVitalsTarget] = useState<Appt | null>(null)
  const [moveTarget,   setMoveTarget]   = useState<Appt | null>(null)
  const [ringing,      setRinging]      = useState<string | null>(null)

  const hospitalId = staffProfile?.hospitalId

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)

    const today = todayLocalDate()
    let query = supabase
      .from('appointments')
      .select(`
        id, booking_ref, appointment_date, start_time, type, status, approval_status, reason, urgency,
        queue_position, doctor_id, assigned_doctor_id, check_in_date,
        walkin_patient_name, walkin_patient_phone, referral_reason,
        patient:users!appointments_patient_id_fkey(id, full_name, phone),
        doctor:doctors!appointments_doctor_id_fkey(full_name),
        referred_by:doctors!appointments_referred_by_doctor_id_fkey(full_name, title),
        referring_hospital:hospitals!appointments_referring_hospital_id_fkey(name),
        referring_clinic:hospital_clinics!appointments_referring_clinic_id_fkey(name)
      `)
      .eq('hospital_id', hospitalId)
      .order('appointment_date', { ascending: true })
      .order('start_time',       { ascending: true })

    // Matches get_doctor_queue's own convention: a booking dated for another day that
    // physically checked in today belongs on today's list too, not just whatever day
    // it was originally booked for.
    if (tab === 'today') query = query.or(`appointment_date.eq.${today},check_in_date.eq.${today}`)

    const { data } = await query
    // Supabase's generated types model the patient/doctor FK joins below as
    // arrays even though each appointment has exactly one of each at runtime
    // (a known codegen limitation for `!fk_name(...)` embeds it can't prove
    // are one-to-one) -- cast through unknown to reflect the real shape.
    const rows = (data ?? []) as unknown as Appt[]
    setAppts(rows)
    setLoading(false)
    setRefreshing(false)
    loadVitals(rows)
  }, [hospitalId, tab])

  // vitals_audit_log has no hospital_id column to filter a realtime channel on
  // cleanly, and vitals are recorded once or twice per visit (not high-frequency),
  // so a light poll while focused is simpler than wiring up realtime here.
  const loadVitals = useCallback(async (rows: Appt[]) => {
    const ids = rows.filter(a => a.status === 'checked_in' || a.status === 'in_progress').map(a => a.id)
    if (ids.length === 0) { setVitalsMap(new Map()); return }
    const { data } = await supabase
      .from('vitals_audit_log')
      .select('appointment_id, weight_kg, height_cm, bp_systolic, bp_diastolic, blood_sugar, recorded_at')
      .in('appointment_id', ids)
      .order('recorded_at', { ascending: false })
    const map = new Map<string, VitalsRow>()
    for (const row of (data as any[]) ?? []) {
      if (!map.has(row.appointment_id)) map.set(row.appointment_id, row)
    }
    setVitalsMap(map)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useEffect(() => {
    const interval = setInterval(() => loadVitals(appts), 15000)
    return () => clearInterval(interval)
  }, [appts, loadVitals])

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
    if (appt.approval_status === 'pending_approval') {
      Alert.alert('Cannot check in', 'This booking is still awaiting approval.')
      return
    }
    setActioning(appt.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      // Routed through the same PATCH /api/appointments/[id] endpoint the web dashboard
      // uses (not a raw table update) so check_in_date/queue_position get set -- a direct
      // update here left check_in_date null, so a future- or past-dated booking that
      // walked in today never actually joined today's queue.
      const res = await fetch(`${API_URL}/api/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ action: 'check_in' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Check-in failed')
      }
      haptics.success()
      load(true)
    } catch (e) {
      haptics.error()
      Alert.alert('Error', e instanceof Error ? e.message : 'Check-in failed')
    } finally {
      setActioning(null)
    }
  }

  async function handleApprove(appt: Appt) {
    setActioning(appt.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      // Routed through the same PATCH /api/appointments/[id] endpoint the web dashboard
      // uses (not a raw table update) so the patient actually gets notified their
      // booking was approved -- a direct update here would silently skip that.
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

  function handleReject(appt: Appt) {
    Alert.alert('Reject Booking', 'The patient will be notified. No payment was taken, so there is nothing to refund.', [
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
            body: JSON.stringify({ action: 'reject', note: 'Cancelled by front desk' }),
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

  async function handleRing(appt: Appt) {
    setRinging(appt.id)
    const { error } = await ringPatient(appt.id)
    setRinging(null)
    if (error) { haptics.error(); Alert.alert('Error', error) } else haptics.success()
  }

  const today = todayLocalDate()

  // Client-side search filter (no API call)
  const filtered = search.trim()
    ? appts.filter(a => (a.patient?.full_name ?? a.walkin_patient_name ?? '').toLowerCase().includes(search.toLowerCase()))
    : appts

  // Emergency walk-ins sort to the top of the active queue — same tiering used on the
  // web front-desk queue and the specialist queue. queue_position (nulls-last) is the
  // secondary key so a manual reorder (this screen's own Move action, or a patient's
  // self-delay) is actually visible here, not just on the doctor's own queue screen.
  const active = filtered
    .filter(a => !['completed', 'cancelled', 'no_show'].includes(a.status))
    .sort((a, b) => {
      const tier = (a.urgency === 'emergency' ? 0 : 1) - (b.urgency === 'emergency' ? 0 : 1)
      if (tier !== 0) return tier
      return (a.queue_position ?? Infinity) - (b.queue_position ?? Infinity)
    })
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
                  key={a.id} appt={a} theme={t} actioning={actioning} today={today}
                  vitals={vitalsMap.get(a.id) ?? null} ringing={ringing}
                  onCheckIn={handleCheckIn} onApprove={handleApprove} onReject={handleReject}
                  onRing={handleRing} onRecordVitals={setVitalsTarget} onMove={setMoveTarget}
                />
              ))}
            </>
          )}

          {done.length > 0 && (
            <>
              <Text style={[s.groupLabel, { color: t.textMuted, marginTop: 16 }]}>Completed / Cancelled ({done.length})</Text>
              {done.map(a => (
                <ApptCard
                  key={a.id} appt={a} theme={t} actioning={actioning} today={today}
                  vitals={null} ringing={ringing}
                  onCheckIn={handleCheckIn} onApprove={handleApprove} onReject={handleReject}
                  onRing={handleRing} onRecordVitals={setVitalsTarget} onMove={setMoveTarget}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {vitalsTarget && (
        <VitalsEntryModal
          appointmentId={vitalsTarget.id}
          patientName={vitalsTarget.patient?.full_name ?? vitalsTarget.walkin_patient_name ?? 'Patient'}
          onClose={() => setVitalsTarget(null)}
          onSaved={() => { setVitalsTarget(null); loadVitals(appts) }}
        />
      )}

      {moveTarget && (
        <MovePositionModal
          appt={moveTarget}
          queue={active.filter(a => a.status === 'checked_in'
            && a.doctor_id === moveTarget.doctor_id && a.assigned_doctor_id === moveTarget.assigned_doctor_id
            && a.check_in_date === moveTarget.check_in_date)}
          onClose={() => setMoveTarget(null)}
          onMoved={() => { setMoveTarget(null); load(true) }}
        />
      )}
    </SafeAreaView>
  )
}

function ApptCard({ appt, theme: t, actioning, today, vitals, ringing, onCheckIn, onApprove, onReject, onRing, onRecordVitals, onMove }: {
  appt: Appt; theme: any; actioning: string | null; today: string
  vitals: VitalsRow | null; ringing: string | null
  onCheckIn: (a: Appt) => void; onApprove: (a: Appt) => void; onReject: (a: Appt) => void
  onRing: (a: Appt) => void; onRecordVitals: (a: Appt) => void; onMove: (a: Appt) => void
}) {
  // `status` and `approval_status` are independent columns -- a booking awaiting manual
  // review has status='pending', approval_status='pending_approval'; status itself never
  // holds that string. Derive a single display status so the badge agrees with canApprove below.
  const dispStatus = appt.approval_status === 'pending_approval' ? 'pending_approval' : appt.status
  const meta      = STATUS_META[dispStatus] ?? { label: dispStatus, color: '#888', bg: 'rgba(128,128,128,0.1)' }
  const isLoading = actioning === appt.id
  const canCheckIn = (appt.status === 'confirmed' || appt.status === 'pending') && appt.appointment_date === today
    && appt.approval_status !== 'pending_approval'
  const canApprove = appt.approval_status === 'pending_approval'
  const isEmergency = appt.urgency === 'emergency'
  const urgencyColor = isEmergency ? '#FF5C5C' : appt.urgency === 'urgent' ? '#EF9F27' : null
  const showVitals = appt.status === 'checked_in' || appt.status === 'in_progress'
  const isRinging = ringing === appt.id

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => haptics.tap()}
      style={[s.card, {
        backgroundColor: isEmergency ? 'rgba(255,92,92,0.06)' : t.cardBg,
        borderColor: isEmergency ? '#FF5C5C' : t.cardBorder,
        borderLeftWidth: isEmergency ? 4 : 1,
      }]}
    >
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[s.patientName, { color: t.textPrimary }]}>{appt.patient?.full_name ?? appt.walkin_patient_name ?? 'Walk-in Patient'}</Text>
          {(appt.patient?.phone ?? appt.walkin_patient_phone) && <Text style={[s.patientPhone, { color: t.textMuted }]}>{appt.patient?.phone ?? appt.walkin_patient_phone}</Text>}
          <Text style={[s.meta, { color: t.textMuted }]}>
            {appt.appointment_date !== today ? `${appt.appointment_date} · ` : ''}{fmt12(appt.start_time)}
            {appt.doctor ? ` · Dr. ${appt.doctor.full_name}` : ''}
            {' · '}<Ionicons name={appt.type === 'virtual' ? 'videocam-outline' : 'business-outline'} size={10} color={t.textMuted} />{appt.type === 'virtual' ? ' Virtual' : ' In-person'}
          </Text>
          {appt.reason && <Text style={[s.reason, { color: t.textMuted }]} numberOfLines={1}>{appt.reason}</Text>}
          {appt.referred_by && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
              <Ionicons name="arrow-redo-outline" size={10} color="#5B9EFF" />
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#5B9EFF' }} numberOfLines={1}>
                {[appt.referred_by.title, appt.referred_by.full_name].filter(Boolean).join(' ')}
                {appt.referring_clinic?.name ? ` · ${appt.referring_clinic.name}` : ''}
                {appt.referring_hospital?.name ? ` · ${appt.referring_hospital.name}` : ''}
              </Text>
            </View>
          )}
        </View>
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <View style={[s.badge, { backgroundColor: meta.bg }]}>
            <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {isEmergency ? (
            <View style={[s.badge, { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,92,92,0.14)', borderWidth: 1, borderColor: '#FF5C5C' }]}>
              <Ionicons name="alert-circle-outline" size={10} color="#FF5C5C" />
              <Text style={[s.badgeText, { color: '#FF5C5C' }]}>EMERGENCY</Text>
            </View>
          ) : urgencyColor && (
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
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark" size={13} color="#00C265" />
                    <Text style={[s.actionText, { color: '#00C265' }]}>Approve</Text>
                  </View>}
            </TouchableOpacity>
          )}
          {canApprove && (
            <TouchableOpacity onPress={() => onReject(appt)} disabled={!!actioning}
              style={[s.actionBtn, { backgroundColor: 'rgba(255,92,92,0.1)', borderColor: 'rgba(255,92,92,0.3)' }]}>
              {isLoading ? <ActivityIndicator size="small" color="#FF5C5C" />
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="close" size={13} color="#FF5C5C" />
                    <Text style={[s.actionText, { color: '#FF5C5C' }]}>Reject</Text>
                  </View>}
            </TouchableOpacity>
          )}
          {canCheckIn && (
            <TouchableOpacity onPress={() => onCheckIn(appt)} disabled={!!actioning}
              style={[s.actionBtn, { backgroundColor: 'rgba(91,158,255,0.12)', borderColor: 'rgba(91,158,255,0.3)', flex: 1 }]}>
              {isLoading ? <ActivityIndicator size="small" color="#5B9EFF" />
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[s.actionText, { color: '#5B9EFF' }]}>Check In</Text>
                    <Ionicons name="arrow-forward" size={13} color="#5B9EFF" />
                  </View>}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Vitals peek -- live-ish (polled) once the patient's checked in */}
      {showVitals && (
        <View style={[s.vitalsRow, { borderTopColor: t.cardBorder }]}>
          {vitals ? (
            <>
              {vitals.weight_kg != null && <VitalChip icon="scale-outline" text={`${vitals.weight_kg}kg`} theme={t} />}
              {vitals.height_cm != null && <VitalChip icon="resize-outline" text={`${vitals.height_cm}cm`} theme={t} />}
              {(vitals.bp_systolic != null && vitals.bp_diastolic != null) &&
                <VitalChip icon="pulse-outline" text={`${vitals.bp_systolic}/${vitals.bp_diastolic}`} theme={t} />}
              {vitals.blood_sugar != null && <VitalChip icon="water-outline" text={`${vitals.blood_sugar}mg/dL`} theme={t} />}
            </>
          ) : (
            <Text style={{ fontSize: 11, color: t.textMuted, fontStyle: 'italic' }}>No vitals recorded yet</Text>
          )}
        </View>
      )}

      {showVitals && (
        <View style={[s.actions, { borderTopColor: t.cardBorder }]}>
          <TouchableOpacity onPress={() => onRecordVitals(appt)}
            style={[s.actionBtn, { flex: 1, backgroundColor: 'rgba(91,158,255,0.12)', borderColor: 'rgba(91,158,255,0.3)' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="fitness-outline" size={13} color="#5B9EFF" />
              <Text style={[s.actionText, { color: '#5B9EFF' }]}>Vitals</Text>
            </View>
          </TouchableOpacity>
          {appt.status === 'checked_in' && (
            <TouchableOpacity onPress={() => onMove(appt)}
              style={[s.actionBtn, { flex: 1, backgroundColor: 'rgba(167,139,250,0.12)', borderColor: 'rgba(167,139,250,0.3)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="swap-vertical-outline" size={13} color="#A78BFA" />
                <Text style={[s.actionText, { color: '#A78BFA' }]}>Move</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onRing(appt)} disabled={isRinging}
            style={[s.actionBtn, { flex: 1, backgroundColor: 'rgba(239,159,39,0.12)', borderColor: 'rgba(239,159,39,0.3)' }]}>
            {isRinging ? <ActivityIndicator size="small" color="#EF9F27" />
              : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="notifications-outline" size={13} color="#EF9F27" />
                  <Text style={[s.actionText, { color: '#EF9F27' }]}>Ring</Text>
                </View>}
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  )
}

function VitalChip({ icon, text, theme: t }: { icon: ComponentProps<typeof Ionicons>['name']; text: string; theme: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name={icon} size={11} color={t.textMuted} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: t.textSecondary }}>{text}</Text>
    </View>
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
  vitalsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1 },
  actionText:   { fontSize: 13, fontWeight: '700' },
  empty:        { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:   { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub:     { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
})
