import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getPatientAppointments } from '../lib/api'
import type { AppointmentWithRelations } from '../lib/api'

const FILTERS = ['upcoming', 'completed', 'cancelled'] as const

export function AppointmentsScreen({ navigation }: { navigation?: any }) {
  const { theme: t }           = useTheme()
  const { user }               = useAuth()
  const [filter, setFilter]    = useState<typeof FILTERS[number]>('upcoming')
  const [appts, setAppts]      = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]  = useState(true)
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

  const filtered = appts.filter(a =>
    filter === 'upcoming'
      ? ['confirmed', 'pending', 'checked_in', 'in_progress'].includes(a.status)
      : a.status === filter
  )

  const statusStyle = (status: string) => {
    if (status === 'confirmed')   return { bg: t.accentBg,  color: t.accent }
    if (status === 'pending')     return { bg: '#FEF8E7',   color: '#633806' }
    if (status === 'completed')   return { bg: t.inputBg,   color: t.textMuted }
    if (status === 'checked_in')  return { bg: '#E8F4FE',   color: '#1A5A8C' }
    if (status === 'in_progress') return { bg: '#FEF0E6',   color: '#7A3A00' }
    return { bg: '#FCEBEB', color: '#791F1F' }
  }

  const doctorInitials = (name: string) =>
    name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '??'

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.textPrimary }]}>My bookings</Text>

        <View style={styles.filters}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f} onPress={() => setFilter(f)}
              style={[styles.filterPill, {
                backgroundColor: filter === f ? t.accentBg : t.cardBg,
                borderColor: filter === f ? t.accent : t.cardBorder,
              }]}>
              <Text style={[styles.filterText, { color: filter === f ? t.accent : t.textMuted }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ paddingHorizontal: 20 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }} tintColor={t.accent} />
            }>
            {filtered.length === 0 && (
              <View style={styles.empty}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>📅</Text>
                <Text style={[styles.emptyText, { color: t.textMuted }]}>No {filter} appointments</Text>
                {filter === 'upcoming' && (
                  <TouchableOpacity onPress={() => navigation?.navigate('Search')}
                    style={[styles.bookBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                    <Text style={[styles.bookBtnText, { color: t.accent }]}>Book an appointment →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {filtered.map(a => {
              const ss      = statusStyle(a.status)
              const doctor  = a.doctor
              const hospital = a.hospital
              return (
                <TouchableOpacity key={a.id} activeOpacity={0.75}
                  onPress={() => navigation?.navigate('AppointmentDetail', { appointment: a })}
                  style={[styles.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardDoctor, { color: t.textPrimary }]}>
                        {doctor?.full_name ?? 'Doctor'}
                      </Text>
                      <Text style={[styles.cardSpec, { color: t.textMuted }]}>
                        {hospital?.name ?? ''}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
                      <Text style={[styles.statusText, { color: ss.color }]}>{a.status.replace('_', ' ')}</Text>
                    </View>
                  </View>

                  <View style={styles.cardChips}>
                    {[a.appointment_date, a.start_time, a.type].map(tag => (
                      <View key={tag} style={[styles.chip, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                        <Text style={[styles.chipText, { color: t.textMuted }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={[styles.cardBottom, { borderTopColor: t.cardBorder }]}>
                    <Text style={[styles.bookingId, { color: t.textMuted }]}>{a.booking_ref}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {['confirmed', 'pending'].includes(a.status) && a.type === 'virtual' && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                          <Text style={[styles.actionBtnText, { color: t.accent }]}>Join call</Text>
                        </TouchableOpacity>
                      )}
                      {['confirmed', 'pending'].includes(a.status) && (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                          <Text style={[styles.actionBtnText, { color: t.textMuted }]}>Reschedule</Text>
                        </TouchableOpacity>
                      )}
                      {a.status === 'completed' && (
                        <TouchableOpacity
                          onPress={() => navigation?.navigate('HospitalProfile', { hospital: { id: a.hospital_id } })}
                          style={[styles.actionBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                          <Text style={[styles.actionBtnText, { color: t.accent }]}>Book again</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
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

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  title:         { fontSize: 20, fontWeight: '800', letterSpacing: -0.8, marginBottom: 14, paddingHorizontal: 20, paddingTop: 16 },
  filters:       { flexDirection: 'row', gap: 6, marginBottom: 14, paddingHorizontal: 20 },
  filterPill:    { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  filterText:    { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText:     { fontSize: 13 },
  bookBtn:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 1, marginTop: 4 },
  bookBtnText:   { fontSize: 12, fontWeight: '700' },
  card:          { borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1 },
  cardTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardDoctor:    { fontSize: 14, fontWeight: '700' },
  cardSpec:      { fontSize: 11, marginTop: 2 },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  statusText:    { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardChips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  chip:          { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  chipText:      { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  cardBottom:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10 },
  bookingId:     { fontSize: 11 },
  actionBtn:     { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
})
