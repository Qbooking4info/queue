import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getPatientAppointments } from '../lib/api'
import type { AppointmentWithRelations } from '../lib/api'
import { fmtDate, fmt12 } from '../lib/format'
import { SkeletonCard } from '../components/ui/Skeleton'
import { haptics } from '../lib/haptics'

const FILTERS = ['upcoming', 'pending review', 'completed', 'cancelled'] as const

function statusColors(status: string, approvalStatus: string, t: any) {
  if (approvalStatus === 'pending_approval')
    return { bg: 'rgba(239,159,39,0.12)', color: '#EF9F27', border: 'rgba(239,159,39,0.3)' }
  if (status === 'confirmed')   return { bg: t.accentBg,            color: t.accent,    border: t.accentBorder }
  if (status === 'pending')     return { bg: 'rgba(26,127,193,0.1)', color: '#1A7FC1',   border: 'rgba(26,127,193,0.3)' }
  if (status === 'checked_in')  return { bg: '#E8F4FE',              color: '#1A5A8C',   border: 'rgba(26,90,140,0.3)' }
  if (status === 'in_progress') return { bg: '#FEF0E6',              color: '#7A3A00',   border: 'rgba(122,58,0,0.3)' }
  if (status === 'completed')   return { bg: t.inputBg,              color: t.textMuted, border: t.cardBorder }
  return { bg: '#FCEBEB', color: '#791F1F', border: 'rgba(163,45,45,0.3)' }
}

function statusLabel(status: string, approvalStatus: string) {
  if (approvalStatus === 'pending_approval') return 'Awaiting Review'
  if (status === 'in_progress') return 'In progress'
  if (status === 'checked_in')  return 'Checked in'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function AppointmentsScreen({ navigation }: { navigation?: any }) {
  const { theme: t } = useTheme()
  const { user }     = useAuth()

  const [filter,     setFilter]     = useState<typeof FILTERS[number]>('upcoming')
  const [appts,      setAppts]      = useState<AppointmentWithRelations[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) setLoading(true)
    const data = await getPatientAppointments(user.id)
    setAppts(data)
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const filtered = appts.filter(a => {
    const approvalStatus = (a as any).approval_status ?? 'auto_approved'
    if (filter === 'pending review') return approvalStatus === 'pending_approval'
    if (filter === 'upcoming')
      return ['confirmed', 'pending', 'checked_in', 'in_progress'].includes(a.status)
        && approvalStatus !== 'pending_approval'
    if (filter === 'completed') return a.status === 'completed'
    if (filter === 'cancelled') return a.status === 'cancelled' || approvalStatus === 'rejected'
    return true
  })

  const pendingCount = appts.filter(a => (a as any).approval_status === 'pending_approval').length

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={{ flex: 1 }}>

        {/* Title */}
        <View style={[s.titleRow, { borderBottomColor: t.cardBorder }]}>
          <Text style={[s.title, { color: t.textPrimary }]}>My Bookings</Text>
          {pendingCount > 0 && (
            <View style={[s.pendingBadge, { backgroundColor: 'rgba(239,159,39,0.12)', borderColor: 'rgba(239,159,39,0.3)' }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF9F27' }}>
                {pendingCount} awaiting review
              </Text>
            </View>
          )}
        </View>

        {/* Filter row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterContent}>
          {FILTERS.map((f, i) => {
            const active = filter === f
            const isLast = i === FILTERS.length - 1
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  s.filterPill,
                  isLast ? s.filterPillLast : undefined,
                  {
                    backgroundColor: active ? t.accentBg : t.cardBg,
                    borderColor:     active ? t.accent   : t.cardBorder,
                  },
                ]}>
                <Text style={[s.filterText, { color: active ? t.accent : t.textMuted }]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
                {f === 'pending review' && pendingCount > 0 && (
                  <View style={s.filterDot} />
                )}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {loading ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (
          <ScrollView
            style={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={t.accent}
                onRefresh={() => { setRefreshing(true); load(true) }}
              />
            }>

            {filtered.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📅</Text>
                <Text style={[s.emptyTitle, { color: t.textPrimary }]}>
                  No {filter} appointments
                </Text>
                <Text style={[s.emptySubtitle, { color: t.textMuted }]}>
                  {filter === 'upcoming'
                    ? 'Book an appointment to get started.'
                    : `You have no ${filter} appointments.`}
                </Text>
                {filter === 'upcoming' && (
                  <TouchableOpacity
                    onPress={() => { haptics.tap(); navigation?.navigate('BookingFlow', {}) }}
                    style={[s.bookNowBtn, { backgroundColor: t.accent }]}>
                    <Text style={s.bookNowText}>Book an appointment →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {filtered.map(a => {
              const approvalStatus = (a as any).approval_status ?? 'auto_approved'
              const bookingMode    = (a as any).booking_mode ?? 'doctor'
              const bookingRef     = (a as any).booking_ref ?? a.id
              const sc             = statusColors(a.status, approvalStatus, t)
              const isVirtual      = a.type === 'virtual'
              const isPending      = approvalStatus === 'pending_approval'
              const clinicObj      = (a as any).clinic ?? null
              const clinicLabel    = clinicObj && !clinicObj.is_opd ? clinicObj.name : null
              const doctorName     = a.doctor?.full_name
                ?? (bookingMode === 'hospital' ? null : 'Doctor')
              const isEmergency    = (a as any).urgency === 'emergency'

              return (
                <TouchableOpacity
                  key={a.id}
                  activeOpacity={0.75}
                  onPress={() => { haptics.tap(); navigation?.navigate('AppointmentDetail', { appointment: a }) }}
                  style={[
                    s.card,
                    {
                      backgroundColor: isEmergency ? 'rgba(255,92,92,0.06)' : t.cardBg,
                      borderColor: isEmergency ? '#FF5C5C' : isPending ? 'rgba(239,159,39,0.4)' : t.cardBorder,
                      borderLeftWidth: isEmergency ? 4 : 1,
                    },
                  ]}>

                  {/* Ref row — booking ID + status badge */}
                  <View style={[s.refRow, { borderBottomColor: t.cardBorder }]}>
                    <View style={s.refLeft}>
                      <Text style={s.refIcon}>{isVirtual ? '💻' : '🏥'}</Text>
                      <Text style={[s.refText, { color: t.accent }]}>{bookingRef}</Text>
                      {isEmergency && (
                        <View style={{ backgroundColor: '#FF5C5C', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>🚨 EMERGENCY</Text>
                        </View>
                      )}
                    </View>
                    <View style={[s.statusPill, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                      <Text style={[s.statusText, { color: sc.color }]}>
                        {statusLabel(a.status, approvalStatus)}
                      </Text>
                    </View>
                  </View>

                  {/* Body — hospital + doctor | date + time */}
                  <View style={s.cardBody}>
                    <View style={s.cardBodyLeft}>
                      <Text style={[s.hospitalName, { color: t.textPrimary }]} numberOfLines={1}>
                        {a.hospital?.name ?? '—'}
                      </Text>
                      <Text style={[s.doctorLine, { color: t.textMuted }]} numberOfLines={1}>
                        {clinicLabel
                          ? clinicLabel
                          : doctorName ?? (isVirtual ? 'Doctor to be assigned' : 'OPD / General Outpatient')}
                      </Text>
                    </View>
                    <View style={s.cardBodyRight}>
                      <Text style={[s.dateText, { color: t.textPrimary }]}>{fmtDate(a.appointment_date)}</Text>
                      <Text style={[s.timeText,  { color: t.textMuted   }]}>{fmt12(a.start_time)}</Text>
                    </View>
                  </View>

                  {/* Pending approval banner */}
                  {isPending && (
                    <View style={[s.approvalBanner, { backgroundColor: 'rgba(239,159,39,0.06)', borderTopColor: 'rgba(239,159,39,0.2)' }]}>
                      <Text style={{ fontSize: 11, color: '#EF9F27' }}>
                        ⏳ Awaiting hospital review — you'll be notified once approved.
                      </Text>
                    </View>
                  )}

                  {/* Footer — check-in pass prompt */}
                  {!isPending && ['confirmed', 'pending', 'checked_in'].includes(a.status) && (
                    <View style={[s.cardFooter, { borderTopColor: t.cardBorder }]}>
                      <Text style={[s.footerHint, { color: t.textMuted }]}>Tap to view check-in pass</Text>
                      {isVirtual && (
                        <View style={[s.virtualTag, { backgroundColor: 'rgba(55,138,221,0.1)', borderColor: 'rgba(55,138,221,0.25)' }]}>
                          <Text style={s.virtualTagText}>Virtual</Text>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}

            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  titleRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title:         { fontSize: 20, fontWeight: '800', letterSpacing: -0.8 },
  pendingBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  // Filter row
  filterScroll:  { flexGrow: 0 },
  filterContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  filterPill:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  filterPillLast:{ marginRight: 0 },
  filterText:    { fontSize: 12, fontWeight: '600' },
  filterDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF9F27', marginLeft: 5 },
  // List
  list:          { paddingHorizontal: 20 },
  // Empty state
  empty:         { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyIcon:     { fontSize: 52, marginBottom: 12 },
  emptyTitle:    { fontSize: 17, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  bookNowBtn:    { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  bookNowText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  // Card
  card:          { borderRadius: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  refRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  refLeft:       { flexDirection: 'row', alignItems: 'center' },
  refIcon:       { fontSize: 14, marginRight: 7 },
  refText:       { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  statusPill:    { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusText:    { fontSize: 10, fontWeight: '700' },
  cardBody:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12 },
  cardBodyLeft:  { flex: 1, paddingRight: 10 },
  cardBodyRight: { alignItems: 'flex-end' },
  hospitalName:  { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  doctorLine:    { fontSize: 11 },
  dateText:      { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  timeText:      { fontSize: 11 },
  approvalBanner:{ paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1 },
  cardFooter:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
  footerHint:    { fontSize: 10 },
  virtualTag:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  virtualTagText:{ fontSize: 9, color: '#85B7EB', fontWeight: '700' },
})
