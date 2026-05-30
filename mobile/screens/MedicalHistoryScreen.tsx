import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Linking } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

interface Appointment {
  id: string; booking_ref: string; appointment_date: string
  status: string; type: string; diagnosis: string | null
  doctor_notes: string | null; prescription_url: string | null
  hospitals: { name: string } | null
  doctors: { full_name: string; title: string; specialties: { name: string } | null } | null
}

export function MedicalHistoryScreen({ navigation }: { navigation: any }) {
  const [records, setRecords] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
      if (!profile) return
      const { data } = await supabase
        .from('appointments')
        .select('id,booking_ref,appointment_date,status,type,diagnosis,doctor_notes,prescription_url,hospitals(name),doctors(full_name,title,specialties(name))')
        .eq('patient_id', profile.id)
        .in('status', ['completed', 'no_show'])
        .order('appointment_date', { ascending: false })
        .limit(30)
      setRecords((data as Appointment[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Medical History</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.placeholder}>Loading…</Text>
        ) : records.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>🩺</Text>
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptyBody}>Your completed appointments and diagnoses will appear here</Text>
          </View>
        ) : (
          records.map(r => {
            const hospital = Array.isArray(r.hospitals) ? r.hospitals[0] : r.hospitals
            const doctor = Array.isArray(r.doctors) ? r.doctors[0] : r.doctors
            const specialty = Array.isArray(doctor?.specialties) ? doctor?.specialties[0] : doctor?.specialties
            const isExpanded = expanded === r.id
            const hasDetails = r.diagnosis || r.doctor_notes || r.prescription_url

            return (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                activeOpacity={hasDetails ? 0.75 : 1}
                onPress={() => hasDetails && setExpanded(isExpanded ? null : r.id)}>
                <View style={styles.cardTop}>
                  <View style={styles.iconWrap}>
                    <Text style={{ fontSize: 20 }}>{r.type === 'virtual' ? '💻' : '🏥'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>{doctor?.title} {doctor?.full_name ?? 'Unknown Doctor'}</Text>
                    <Text style={styles.specialty}>{specialty?.name ?? 'General Practice'}</Text>
                    <Text style={styles.hospital}>{hospital?.name ?? ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.date}>{r.appointment_date}</Text>
                    {hasDetails && (
                      <Text style={{ color: t.accent, fontSize: 18 }}>{isExpanded ? '▲' : '▼'}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{r.type}</Text>
                  </View>
                  <View style={[styles.badge, { borderColor: r.status === 'completed' ? '#00E87A44' : '#FF5C5C44', backgroundColor: r.status === 'completed' ? '#00E87A11' : '#FF5C5C11' }]}>
                    <Text style={[styles.badgeText, { color: r.status === 'completed' ? t.accent : '#FF5C5C' }]}>{r.status}</Text>
                  </View>
                  <Text style={styles.ref}>{r.booking_ref}</Text>
                </View>

                {isExpanded && (
                  <View style={styles.details}>
                    {r.diagnosis ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Diagnosis</Text>
                        <Text style={styles.detailValue}>{r.diagnosis}</Text>
                      </View>
                    ) : null}
                    {r.doctor_notes ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Doctor Notes</Text>
                        <Text style={styles.detailValue}>{r.doctor_notes}</Text>
                      </View>
                    ) : null}
                    {r.prescription_url ? (
                      <TouchableOpacity
                        style={styles.prescriptionBtn}
                        onPress={() => Linking.openURL(r.prescription_url!)}>
                        <Text style={{ fontSize: 16 }}>💊</Text>
                        <Text style={styles.prescriptionText}>View Prescription</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </TouchableOpacity>
            )
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: t.bg },
  header:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  scroll:          { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  placeholder:     { color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
  emptyState:      { alignItems: 'center', paddingVertical: 60 },
  emptyTitle:      { fontSize: font.lg, fontWeight: '700', color: t.text, marginBottom: 6 },
  emptyBody:       { fontSize: font.sm, color: t.textSub, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  card:            { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm },
  cardTop:         { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  iconWrap:        { width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doctorName:      { fontSize: font.md, fontWeight: '700', color: t.text },
  specialty:       { fontSize: font.sm, color: t.accent, marginTop: 1 },
  hospital:        { fontSize: font.sm, color: t.textSub, marginTop: 1 },
  date:            { fontSize: font.xs, color: t.textMuted },
  metaRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge:           { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, borderWidth: 1, borderColor: t.border, backgroundColor: t.bgCardAlt },
  badgeText:       { fontSize: 10, color: t.textSub, fontWeight: '600', textTransform: 'capitalize' },
  ref:             { marginLeft: 'auto', fontSize: 10, color: t.textMuted },
  details:         { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: t.border, gap: spacing.sm },
  detailRow:       { gap: 4 },
  detailLabel:     { fontSize: font.xs, fontWeight: '700', color: t.textSub, textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue:     { fontSize: font.sm, color: t.text, lineHeight: 20 },
  prescriptionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xs },
  prescriptionText:{ fontSize: font.sm, color: t.accent, fontWeight: '700' },
})
