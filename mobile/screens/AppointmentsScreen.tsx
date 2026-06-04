import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { appointments } from '../data'

const FILTERS = ['upcoming', 'completed', 'cancelled'] as const

export function AppointmentsScreen() {
  const { theme: t } = useTheme()
  const [filter, setFilter] = useState<typeof FILTERS[number]>('upcoming')

  const filtered = appointments.filter(a =>
    filter === 'upcoming' ? ['confirmed', 'pending'].includes(a.status) : a.status === filter
  )

  const statusStyle = (status: string) => {
    if (status === 'confirmed') return { bg: t.accentBg, color: t.accent }
    if (status === 'pending')   return { bg: '#FEF8E7', color: '#633806' }
    if (status === 'completed') return { bg: t.inputBg, color: t.textMuted }
    return { bg: '#FCEBEB', color: '#791F1F' }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.textPrimary }]}>My bookings</Text>

        {/* Filter pills */}
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

        <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 20 }}>
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: t.textMuted }]}>No {filter} appointments</Text>
            </View>
          )}
          {filtered.map(a => {
            const ss = statusStyle(a.status)
            return (
              <View key={a.id} style={[styles.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardDoctor, { color: t.textPrimary }]}>{a.doctor}</Text>
                    <Text style={[styles.cardSpec, { color: t.textMuted }]}>{a.spec} · {a.hospital}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
                    <Text style={[styles.statusText, { color: ss.color }]}>{a.status}</Text>
                  </View>
                </View>

                <View style={styles.cardChips}>
                  {[a.date, a.time, a.type].map(tag => (
                    <View key={tag} style={[styles.chip, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                      <Text style={[styles.chipText, { color: t.textMuted }]}>{tag}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.cardBottom, { borderTopColor: t.cardBorder }]}>
                  <Text style={[styles.bookingId, { color: t.textMuted }]}>{a.id}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {a.status === 'confirmed' && a.type === 'virtual' && (
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                        <Text style={[styles.actionBtnText, { color: t.accent }]}>Join call</Text>
                      </TouchableOpacity>
                    )}
                    {a.status === 'confirmed' && (
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                        <Text style={[styles.actionBtnText, { color: t.textMuted }]}>Reschedule</Text>
                      </TouchableOpacity>
                    )}
                    {a.status === 'completed' && (
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                        <Text style={[styles.actionBtnText, { color: t.accent }]}>Book again</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            )
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.8, marginBottom: 14, paddingHorizontal: 20, paddingTop: 16 },
  filters:     { flexDirection: 'row', gap: 6, marginBottom: 14, paddingHorizontal: 20 },
  filterPill:  { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  filterText:  { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  empty:       { alignItems: 'center', paddingVertical: 40 },
  emptyText:   { fontSize: 13 },
  card:        { borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardDoctor:  { fontSize: 14, fontWeight: '700' },
  cardSpec:    { fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  statusText:  { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardChips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  chip:        { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  chipText:    { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  cardBottom:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10 },
  bookingId:   { fontSize: 11 },
  actionBtn:   { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  actionBtnText:{ fontSize: 11, fontWeight: '700' },
})
