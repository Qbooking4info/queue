import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import {
  getRangeStats, getTodayAppointments, getDoctorsOnDuty, fmtLocalDate,
  type RangeStats, type AdminAppointmentRow, type AdminDoctorRow } from '@queue/shared/lib/admin-api'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Pending',    color: '#EF9F27', bg: 'rgba(239,159,39,0.12)' },
  pending_approval:  { label: 'Awaiting',   color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  confirmed:         { label: 'Confirmed',  color: '#00C265', bg: 'rgba(0,194,101,0.12)' },
  checked_in:        { label: 'Checked In', color: '#5B9EFF', bg: 'rgba(91,158,255,0.12)' },
  in_progress:       { label: 'In Progress',color: '#5B9EFF', bg: 'rgba(91,158,255,0.12)' },
  completed:         { label: 'Completed',  color: '#7A9089', bg: 'rgba(122,144,137,0.12)' },
  cancelled:         { label: 'Cancelled',  color: '#FF5C5C', bg: 'rgba(255,92,92,0.1)' },
  no_show:           { label: 'No Show',    color: '#FF5C5C', bg: 'rgba(255,92,92,0.1)' },
}

const AVAILABILITY_META: Record<string, { label: string; color: string }> = {
  on_duty:  { label: 'On duty',  color: '#00C265' },
  on_break: { label: 'On break', color: '#EF9F27' },
  off_duty: { label: 'Off duty', color: '#7A9089' },
}

export function AdminDashboardScreen() {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()

  const [stats,      setStats]      = useState<RangeStats | null>(null)
  const [appts,      setAppts]      = useState<AdminAppointmentRow[]>([])
  const [doctors,    setDoctors]    = useState<AdminDoctorRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const hospitalId = staffProfile?.hospitalId
  const clinicId   = staffProfile?.clinicId ?? null
  const isClinicScoped = staffProfile?.role === 'clinic_admin' && !!clinicId

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)
    const today = fmtLocalDate(new Date())
    const [s, a, d] = await Promise.all([
      getRangeStats(hospitalId, today, today, isClinicScoped ? clinicId : null),
      getTodayAppointments(hospitalId, isClinicScoped ? clinicId : null),
      getDoctorsOnDuty(hospitalId, isClinicScoped ? clinicId : null),
    ])
    setStats(s)
    setAppts(a)
    setDoctors(d)
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, clinicId, isClinicScoped])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onDutyCount = doctors.filter(d => d.availability_status === 'on_duty').length

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <Text style={[s.greeting, { color: t.textMuted }]}>
          {isClinicScoped ? 'Clinic overview' : 'Hospital overview'}
        </Text>
        <Text style={[s.headerTitle, { color: t.textPrimary }]}>{staffProfile?.name ?? 'Dashboard'}</Text>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {/* Stats grid */}
          <View style={s.statGrid}>
            {[
              { label: "Today's appts", value: stats?.total ?? 0,     color: t.accent },
              { label: 'Completed',     value: stats?.completed ?? 0, color: t.accentDark },
              { label: 'Pending',       value: stats?.pending ?? 0,   color: t.statusBusy.text },
              { label: 'Doctors on duty', value: onDutyCount,         color: t.info },
            ].map(stat => (
              <View key={stat.label} style={[s.statCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[s.statLabel, { color: t.textMuted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Doctors on duty */}
          <Text style={[s.sectionTitle, { color: t.textMuted }]}>Doctors ({doctors.length})</Text>
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            {doctors.length === 0 ? (
              <Text style={[s.emptyText, { color: t.textMuted }]}>No doctors found.</Text>
            ) : doctors.map(d => {
              const av = AVAILABILITY_META[d.availability_status] ?? AVAILABILITY_META.on_duty
              return (
                <View key={d.id} style={[s.doctorRow, { borderTopColor: t.cardBorder }]}>
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
          <Text style={[s.sectionTitle, { color: t.textMuted, marginTop: 16 }]}>Today's queue ({appts.length})</Text>
          {appts.length === 0 ? (
            <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, alignItems: 'center', paddingVertical: 28 }]}>
              <Ionicons name="clipboard-outline" size={36} color={t.textMuted} style={{ marginBottom: 10, opacity: 0.3 }} />
              <Text style={[s.emptyText, { color: t.textMuted }]}>No appointments scheduled for today.</Text>
            </View>
          ) : appts.map(a => {
            const meta = STATUS_META[a.status] ?? { label: a.status, color: '#888', bg: 'rgba(128,128,128,0.1)' }
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
  sectionTitle:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 18 },
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
