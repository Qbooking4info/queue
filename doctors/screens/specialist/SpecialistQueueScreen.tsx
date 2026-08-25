import { useState, useCallback, useEffect, useRef, type ComponentProps } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { todayLocalDate } from '../../lib/format'
import { setConsultStatus, ringPatient } from '../../lib/consult-actions'

interface ApptRow {
  id:               string
  appointment_date: string
  start_time:       string
  type:             string
  status:           string
  reason:           string | null
  urgency:          string | null
  queue_position:   number | null
  patient_name:     string | null
  patient_phone:    string | null
  patient_gender:   string | null
  hospital_id:      string
  referral_reason?:         string | null
  referred_by_doctor_name?: string | null
  referring_hospital_name?: string | null
  referring_clinic_name?:   string | null
}

interface VitalsRow {
  weight_kg:    number | null
  height_cm:    number | null
  bp_systolic:  number | null
  bp_diastolic: number | null
  blood_sugar:  number | null
  recorded_at:  string
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
  const [vitalsMap,   setVitalsMap]   = useState<Map<string, VitalsRow>>(new Map())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!doctorProfile) { setAppts([]); setLoading(false); return }
    if (!silent) setLoading(true)

    const today = todayLocalDate()

    const { data } = await supabase.rpc('get_doctor_queue', {
      p_doctor_id: doctorProfile.doctorId,
      p_date:      tab === 'today' ? today : null,
      p_today:     today,
    })

    const rows = (data as ApptRow[]) ?? []
    setAppts(rows)
    setLoading(false)
    loadVitals(rows)
  }, [doctorProfile, tab])

  // vitals_audit_log has no hospital_id column to filter a realtime channel on
  // cleanly, and vitals are recorded once or twice per visit (not high-frequency),
  // so a light poll while the tab is focused is simpler than wiring up realtime
  // here -- picks up front desk recording vitals at check-in without a manual
  // pull-to-refresh.
  const loadVitals = useCallback(async (rows: ApptRow[]) => {
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
    if (tab !== 'today') return
    const interval = setInterval(() => loadVitals(appts), 15000)
    return () => clearInterval(interval)
  }, [tab, appts, loadVitals])

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
  }, [doctorProfile, tab, load])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  // Emergency patients sort to the top of the active queue — same tiering used on the
  // front-desk queue and the web dashboard's queue view. queue_position (nulls-last,
  // for not-yet-checked-in rows) is the secondary key -- without it this only agreed
  // with the actual renumbered queue order by coincidence (RPC order is by
  // start_time), so a manual reorder would have had no visible effect here.
  const active = appts
    .filter(a => ['pending','confirmed','checked_in','in_progress'].includes(a.status))
    .sort((a, b) => {
      const tier = (a.urgency === 'emergency' ? 0 : 1) - (b.urgency === 'emergency' ? 0 : 1)
      if (tier !== 0) return tier
      const ap = a.queue_position ?? Infinity
      const bp = b.queue_position ?? Infinity
      return ap - bp
    })
  const done   = appts.filter(a => a.status === 'completed')

  if (!doctorProfile && !loading) {
    return (
      <View style={st.center}>
        <Ionicons name="business-outline" size={52} color={t.textMuted} style={{ marginBottom: 16, opacity: 0.3 }} />
        <Text style={[st.emptyTitle, { color: t.textPrimary }]}>Not linked to a hospital yet</Text>
        <Text style={[st.emptySub, { color: t.textMuted, textAlign: 'center' }]}>
          Link to a hospital from the Hospitals tab to see their live queue here.
        </Text>
      </View>
    )
  }

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
                <ApptCard key={appt.id} appt={appt} navigation={navigation} showDate={tab === 'upcoming'}
                  vitals={vitalsMap.get(appt.id) ?? null} onChanged={() => load(true)} />
              ))}
            </View>
          )}

          {/* Completed */}
          {done.length > 0 && (
            <View style={st.group}>
              <Text style={[st.groupLabel, { color: t.textMuted }]}>COMPLETED</Text>
              {done.map(appt => (
                <ApptCard key={appt.id} appt={appt} navigation={navigation} showDate={tab === 'upcoming'}
                  vitals={null} onChanged={() => load(true)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function ApptCard({ appt, navigation, showDate, vitals, onChanged }: {
  appt: ApptRow; navigation: any; showDate: boolean; vitals: VitalsRow | null; onChanged: () => void
}) {
  const { theme: t } = useTheme()
  const [busy, setBusy] = useState<'start' | 'end' | 'ring' | null>(null)
  const meta = STATUS_META[appt.status] ?? STATUS_META.pending
  const initials = getInitials(appt.patient_name)
  const isVirtual = appt.type === 'virtual'
  const isEmergency = appt.urgency === 'emergency'
  const urgencyColor = isEmergency ? '#FF5C5C' : appt.urgency === 'urgent' ? '#EF9F27' : null
  const isDone = appt.status === 'completed' || appt.status === 'cancelled'
  const showVitals = appt.status === 'checked_in' || appt.status === 'in_progress'

  function openConsult() {
    haptics.tap()
    navigation.navigate('PatientConsult', { appointmentId: appt.id })
  }

  async function handleStart() {
    haptics.tap()
    setBusy('start')
    const { error } = await setConsultStatus(appt.id, 'in_progress')
    setBusy(null)
    if (error) { haptics.error(); Alert.alert('Could not start consultation', error) }
    else { haptics.success(); onChanged() }
  }

  async function handleEnd() {
    haptics.tap()
    setBusy('end')
    const { error } = await setConsultStatus(appt.id, 'completed')
    setBusy(null)
    if (error) { haptics.error(); Alert.alert('Could not end consultation', error) }
    else { haptics.success(); onChanged() }
  }

  async function handleRing() {
    haptics.tap()
    setBusy('ring')
    const { error } = await ringPatient(appt.id)
    setBusy(null)
    if (error) { haptics.error(); Alert.alert('Could not ring patient', error) } else haptics.success()
  }

  function openRefer() {
    haptics.tap()
    navigation.navigate('ReferPatient', {
      appointmentId: appt.id,
      patientName: appt.patient_name ?? 'Patient',
      ownHospitalId: appt.hospital_id,
      isInProgress: appt.status === 'in_progress',
    })
  }

  return (
    <View
      style={[st.card, {
        backgroundColor: isEmergency ? 'rgba(255,92,92,0.06)' : t.cardBg,
        borderColor: isEmergency ? '#FF5C5C' : t.cardBorder,
        borderLeftWidth: isEmergency ? 4 : 1,
      }]}
    >
    <TouchableOpacity activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={openConsult}>
      {/* Avatar */}
      <View style={[st.avatar, {
        backgroundColor: isEmergency ? 'rgba(255,92,92,0.14)' : t.accentBgMid,
        borderColor: isEmergency ? '#FF5C5C' : t.accentBorder,
      }]}>
        <Text style={[st.avatarText, { color: isEmergency ? '#FF5C5C' : t.accent }]}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[st.patientName, { color: t.textPrimary }]}>
            {appt.patient_name ?? 'Unknown patient'}
          </Text>
          {isEmergency ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, backgroundColor: 'rgba(255,92,92,0.14)', borderWidth: 1, borderColor: '#FF5C5C' }}>
              <Ionicons name="alert-circle-outline" size={9} color="#FF5C5C" />
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#FF5C5C' }}>EMERGENCY</Text>
            </View>
          ) : urgencyColor && (
            <Text style={{ fontSize: 9, fontWeight: '800', color: urgencyColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {appt.urgency}
            </Text>
          )}
        </View>
        <View style={st.metaRow}>
          <Text style={[st.metaText, { color: t.textMuted }]}>
            {showDate ? fmtDate(appt.appointment_date) + ' · ' : ''}{fmt12(appt.start_time)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name={isVirtual ? 'videocam-outline' : 'business-outline'} size={11} color={isVirtual ? '#5B9EFF' : t.textMuted} />
            <Text style={[st.typeDot, { color: isVirtual ? '#5B9EFF' : t.textMuted }]}>
              {isVirtual ? 'Virtual' : 'In-person'}
            </Text>
          </View>
        </View>
        {appt.reason && (
          <Text style={[st.reason, { color: t.textMuted }]} numberOfLines={1}>{appt.reason}</Text>
        )}
        {appt.referred_by_doctor_name && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <Ionicons name="arrow-redo-outline" size={10} color="#5B9EFF" />
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#5B9EFF' }} numberOfLines={1}>
              {appt.referred_by_doctor_name}
              {appt.referring_clinic_name ? ` · ${appt.referring_clinic_name}` : ''}
              {appt.referring_hospital_name ? ` · ${appt.referring_hospital_name}` : ''}
            </Text>
          </View>
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

      {/* Vitals peek -- live-ish (polled) once the patient's checked in */}
      {showVitals && (
        <View style={[st.vitalsRow, { borderTopColor: t.cardBorder }]}>
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

      {/* Quick actions */}
      {!isDone && (
        <View style={st.actionsRow}>
          {appt.status === 'checked_in' && (
            <QuickActionBtn label="Start" icon="play" primary disabled={busy !== null}
              loading={busy === 'start'} onPress={handleStart} theme={t} />
          )}
          {appt.status === 'in_progress' && (
            <QuickActionBtn label="End" icon="checkmark-done" primary disabled={busy !== null}
              loading={busy === 'end'} onPress={handleEnd} theme={t} />
          )}
          <QuickActionBtn label="Refer" icon="arrow-redo-outline" disabled={busy !== null} onPress={openRefer} theme={t} />
          <QuickActionBtn label="Ring" icon="notifications-outline" disabled={busy !== null}
            loading={busy === 'ring'} onPress={handleRing} theme={t} />
          <QuickActionBtn label="Details" icon="ellipsis-horizontal" disabled={busy !== null} onPress={openConsult} theme={t} />
        </View>
      )}
    </View>
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

function QuickActionBtn({ label, icon, onPress, theme: t, primary, disabled, loading }: {
  label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void
  theme: any; primary?: boolean; disabled?: boolean; loading?: boolean
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}
      style={[st.actionBtn, {
        backgroundColor: primary ? t.accent : t.inputBg,
        borderColor: primary ? t.accent : t.cardBorder,
        opacity: disabled && !loading ? 0.5 : 1,
      }]}>
      {loading ? (
        <ActivityIndicator size="small" color={primary ? (t.id === 'forest' ? '#061208' : '#fff') : t.textSecondary} />
      ) : (
        <>
          <Ionicons name={icon} size={13} color={primary ? (t.id === 'forest' ? '#061208' : '#fff') : t.textSecondary} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: primary ? (t.id === 'forest' ? '#061208' : '#fff') : t.textSecondary }}>
            {label}
          </Text>
        </>
      )}
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
  card:        { padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
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
  vitalsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  actionsRow:  { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(127,127,127,0.15)' },
  actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
})
