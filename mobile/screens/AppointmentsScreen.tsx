import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl, Alert, Linking } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

type Status = 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'no_show'
type TabFilter = 'upcoming' | 'completed'

interface Appointment {
  id: string; booking_ref: string; appointment_date: string; start_time: string
  type: 'in-person' | 'virtual'; status: Status
  hospitals: { name: string } | null
  doctors:   { full_name: string; title: string } | null
}

const STATUS_COLOR: Record<Status, string> = {
  confirmed: '#00E87A', pending: '#FFB547', completed: '#4A6058', cancelled: '#FF5C5C', no_show: '#FF5C5C',
}

export function AppointmentsScreen() {
  const [tab, setTab]               = useState<TabFilter>('upcoming')
  const [appointments, setAppts]    = useState<Appointment[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetch = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
      if (!profile) return

      const upcomingStatuses  = ['pending','confirmed','checked_in','in_progress']
      const completedStatuses = ['completed','cancelled','no_show']

      const { data } = await supabase
        .from('appointments')
        .select('id,booking_ref,appointment_date,start_time,type,status,hospitals(name),doctors(full_name,title)')
        .eq('patient_id', profile.id)
        .in('status', tab === 'upcoming' ? upcomingStatuses : completedStatuses)
        .order('appointment_date', { ascending: tab === 'upcoming' })
        .limit(20)
      setAppts((data as Appointment[]) ?? [])
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [tab])

  useEffect(() => { setLoading(true); fetch() }, [fetch])

  const onRefresh = () => { setRefreshing(true); fetch() }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
        <View style={styles.tabs}>
          {(['upcoming', 'completed'] as TabFilter[]).map(tb => (
            <TouchableOpacity key={tb} onPress={() => setTab(tb)} style={[styles.tab, tab === tb && styles.tabActive]}>
              <Text style={[styles.tabText, tab === tb && styles.tabTextActive]}>{tb.charAt(0).toUpperCase() + tb.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}>
        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : appointments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📅</Text>
            <Text style={styles.emptyTitle}>No {tab} appointments</Text>
            <Text style={styles.emptyBody}>When you book with a hospital, they'll appear here</Text>
          </View>
        ) : (
          appointments.map(a => {
            const hospital = Array.isArray(a.hospitals) ? a.hospitals[0] : a.hospitals
            const doctor   = Array.isArray(a.doctors)   ? a.doctors[0]   : a.doctors
            return (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>{doctor?.title} {doctor?.full_name}</Text>
                    <Text style={styles.hospitalName}>{hospital?.name}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[a.status] + '22', borderColor: STATUS_COLOR[a.status] + '44' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[a.status] }]}>{a.status}</Text>
                  </View>
                </View>
                <View style={styles.cardMeta}>
                  <View style={styles.metaTag}><Text style={styles.metaTagText}>📅 {a.appointment_date}</Text></View>
                  <View style={styles.metaTag}><Text style={styles.metaTagText}>⏰ {a.start_time.slice(0, 5)}</Text></View>
                  <View style={styles.metaTag}><Text style={styles.metaTagText}>{a.type === 'virtual' ? '💻' : '🏥'} {a.type}</Text></View>
                </View>
                <View style={styles.cardFooter}>
                  {a.status === 'confirmed' && a.type === 'virtual' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#5B9EFF22', borderColor: '#5B9EFF44' }]}
                      onPress={() => Alert.alert('Join Call', 'Your video call link will be sent to your email and phone number 15 minutes before your appointment.')}>
                      <Text style={{ fontSize: font.sm, color: '#5B9EFF', fontWeight: '700' }}>Join Call</Text>
                    </TouchableOpacity>
                  )}
                  {(a.status === 'pending' || a.status === 'confirmed') && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: t.border }]}
                      onPress={() => Alert.alert('Reschedule', 'To reschedule, please contact the hospital directly.', [
                        { text: 'OK' },
                      ])}>
                      <Text style={{ fontSize: font.sm, color: t.textSub, fontWeight: '600' }}>Reschedule</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.bookingRef}>{a.booking_ref}</Text>
                </View>
              </View>
            )
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: t.bg },
  header:         { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  title:          { fontSize: font.xl, fontWeight: '800', color: t.text, marginBottom: spacing.md, letterSpacing: -0.5 },
  tabs:           { flexDirection: 'row', gap: spacing.sm },
  tab:            { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: t.border },
  tabActive:      { borderColor: t.accent, backgroundColor: t.accentMuted },
  tabText:        { fontSize: font.sm, color: t.textSub, fontWeight: '600', textTransform: 'capitalize' },
  tabTextActive:  { color: t.accent },
  scroll:         { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  empty:          { color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
  emptyState:     { alignItems: 'center', paddingVertical: 60 },
  emptyTitle:     { fontSize: font.lg, fontWeight: '700', color: t.text, marginBottom: 6 },
  emptyBody:      { fontSize: font.sm, color: t.textSub, textAlign: 'center', maxWidth: 240 },
  card:           { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  doctorName:     { fontSize: font.md, fontWeight: '700', color: t.text },
  hospitalName:   { fontSize: font.sm, color: t.textSub, marginTop: 1 },
  statusBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  statusText:     { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardMeta:       { flexDirection: 'row', gap: 6, marginBottom: spacing.md, flexWrap: 'wrap' },
  metaTag:        { backgroundColor: t.bgCardAlt, borderWidth: 1, borderColor: t.border, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  metaTagText:    { fontSize: 10, color: t.textSub },
  cardFooter:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: t.border },
  bookingRef:     { marginLeft: 'auto', fontSize: 10, color: t.textMuted, fontFamily: 'monospace' },
})
